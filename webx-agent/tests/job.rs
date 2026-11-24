//! A whole job against a mock model and a mock tool gateway, over real HTTP on localhost.
use microagent::Config;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use webx_agent::{run_job, Autonomy, FileStore, Job, ModelClient, ToolGateway};

#[derive(Default)]
struct Seen {
    /// (path, authorization header, body) of each request the tool gateway got
    tools: Vec<(String, String, Value)>,
    model_calls: usize,
}

/// A tiny HTTP server: `answer(path, body)` gives the JSON to send back.
fn serve(seen: Arc<Mutex<Seen>>, answer: impl Fn(&str, &Value, &mut Seen) -> Value + Send + Sync + 'static) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let answer = Arc::new(answer);
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let (seen, answer) = (seen.clone(), answer.clone());
            std::thread::spawn(move || handle(stream, seen, answer));
        }
    });
    format!("http://{addr}")
}

fn handle(mut s: TcpStream, seen: Arc<Mutex<Seen>>, answer: Arc<impl Fn(&str, &Value, &mut Seen) -> Value>) {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let (head_end, len) = loop {
        let n = s.read(&mut chunk).unwrap_or(0);
        if n == 0 { return; }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            let head = String::from_utf8_lossy(&buf[..p]).to_lowercase();
            let len = head.lines().find_map(|l| l.strip_prefix("content-length:")).and_then(|v| v.trim().parse::<usize>().ok()).unwrap_or(0);
            break (p + 4, len);
        }
    };
    while buf.len() < head_end + len {
        let n = s.read(&mut chunk).unwrap_or(0);
        if n == 0 { break; }
        buf.extend_from_slice(&chunk[..n]);
    }
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let first = head.lines().next().unwrap_or("").to_string();
    let path = first.split_whitespace().nth(1).unwrap_or("/").to_string();
    let auth = head.lines().find_map(|l| l.to_lowercase().starts_with("authorization:").then(|| l.splitn(2, ':').nth(1).unwrap_or("").trim().to_string())).unwrap_or_default();
    let body: Value = serde_json::from_slice(&buf[head_end..head_end + len]).unwrap_or(Value::Null);
    let out = {
        let mut g = seen.lock().unwrap();
        if !path.starts_with("/v1/") { g.tools.push((path.clone(), auth, body.clone())); }
        answer(&path, &body, &mut g)
    };
    let text = out.to_string();
    let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", text.len(), text);
}

fn tool_list() -> Value {
    json!({"data": [
        {"name": "read_page", "help": "Read a page", "risk": "read", "args": [{"name": "id", "kind": "text", "help": "Page id", "required": true}]},
        {"name": "edit_page", "help": "Change a page's title", "risk": "write", "args": [{"name": "id", "kind": "text", "help": "Page id"}, {"name": "title", "kind": "text", "help": "New title"}]},
        {"name": "send_email", "help": "Email someone", "risk": "outside", "args": [{"name": "to", "kind": "text", "help": "Address"}]},
        {"name": "mystery", "help": "A tool of a kind this worker does not know", "risk": "whatever", "args": []}
    ]})
}

/// A model that says each of `replies` in turn, then repeats the last.
fn start_model(replies: Vec<&'static str>, seen: Arc<Mutex<Seen>>) -> ModelClient {
    let url = serve(seen, move |_p, _b, g| {
        let r = replies[g.model_calls.min(replies.len() - 1)];
        g.model_calls += 1;
        json!({"choices": [{"message": {"content": r}}]})
    });
    ModelClient { url: format!("{url}/v1"), key: Some("model-key".into()), model: "m".into() }
}

fn start_gateway(seen: Arc<Mutex<Seen>>) -> ToolGateway {
    let url = serve(seen, |path, body, _| match path.split('?').next().unwrap() {
        "/tools" => tool_list(),
        "/run" => json!({"ok": true, "text": format!("page {} says: hello", body["args"]["id"].as_str().unwrap_or("?"))}),
        _ => json!({"ok": false, "text": "no such route"}),
    });
    ToolGateway { base: url, secret: "gw-secret".into() }
}

fn job(id: &str, autonomy: Autonomy) -> Job {
    Job {
        id: id.into(), tenant: "dga".into(), owner: "ann@example.org".into(), owner_user_id: "7".into(), engine: "strapi".into(),
        required_level: "read".into(), policy_snapshot: Value::Null, lang: "en".into(),
        goal: "Read page p1 and report".into(), context: String::new(), autonomy,
    }
}
fn store(name: &str) -> FileStore {
    let d = std::env::temp_dir().join(format!("webx-agent-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    FileStore(d)
}
const PLAN: &str = r#"{"plan":["read the page","report"]}"#;
const READ: &str = r#"{"tool":"read_page","args":{"id":"p1"}}"#;
const DONE: &str = r#"{"final":"Page p1 says hello."}"#;

#[test]
fn a_job_runs_its_tools_through_the_gateway_as_the_owner_and_finishes() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let (model, gw) = (start_model(vec![PLAN, READ, DONE], seen.clone()), start_gateway(seen.clone()));
    let mut st = store("done");
    let r = run_job(&job("j1", Autonomy::Draft), Config::default(), &model, &gw, &mut st, 40).unwrap();
    assert_eq!((r.stop.as_str(), r.summary.as_str(), r.calls), ("done", "Page p1 says hello.", 1));
    let g = seen.lock().unwrap();
    let run = g.tools.iter().find(|(p, _, _)| p == "/run").expect("the tool ran through the gateway");
    assert_eq!(run.1, "Bearer gw-secret");
    assert_eq!((run.2["job"]["tenantKey"].clone(), run.2["job"]["ownerEmail"].clone(), run.2["tool"].clone()), (json!("dga"), json!("ann@example.org"), json!("read_page")));
    assert_eq!((run.2["job"]["ownerUserId"].clone(), run.2["job"]["engine"].clone(), run.2["job"]["documentId"].clone()), (json!("7"), json!("strapi"), json!("j1")), "Studio gets the job's whole identity to re-check the owner");
    assert!(st.0.read_dir().map(|mut d| d.next().is_none()).unwrap_or(true), "the snapshot is cleared when the job is done");
}

#[test]
fn a_write_runs_at_draft_level_but_an_outside_call_is_held_back_and_declined() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let edit = r#"{"tool":"edit_page","args":{"id":"p1","title":"New"}}"#;
    let (model, gw) = (start_model(vec![PLAN, edit, DONE], seen.clone()), start_gateway(seen.clone()));
    run_job(&job("j2", Autonomy::Draft), Config::default(), &model, &gw, &mut store("write"), 40).unwrap();
    let ran = |g: &Seen, tool: &str| g.tools.iter().any(|(p, _, b)| p == "/run" && b["tool"] == tool);
    assert!(ran(&seen.lock().unwrap(), "edit_page"), "at draft level a write tool is offered and runs");

    let seen = Arc::new(Mutex::new(Seen::default()));
    let mail = r#"{"tool":"send_email","args":{"to":"x@example.org"}}"#;
    let (model, gw) = (start_model(vec![PLAN, mail, DONE], seen.clone()), start_gateway(seen.clone()));
    let r = run_job(&job("j2b", Autonomy::DraftSubmit), Config::default(), &model, &gw, &mut store("outside"), 40).unwrap();
    assert_eq!(r.stop, "done");
    assert!(!ran(&seen.lock().unwrap(), "send_email"), "an outside tool needs a yes the policy cannot get in the background: declined, never sent to the gateway");
}

#[test]
fn tools_above_the_autonomy_level_are_not_offered_and_unknown_ones_count_as_the_strictest() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let gw = start_gateway(seen.clone());
    let j = job("lists", Autonomy::Draft);
    let listed = gw.list(&j).unwrap();
    let names = |a: Autonomy| webx_agent::job::offered_tools(gw.list(&j).unwrap(), a).len();
    assert_eq!(listed.len(), 4);
    assert_eq!((names(Autonomy::Off), names(Autonomy::Read), names(Autonomy::Suggest), names(Autonomy::Draft), names(Autonomy::DraftSubmit)), (0, 1, 1, 2, 3));
    assert!(seen.lock().unwrap().tools.iter().all(|(p, _, b)| p != "/tools" || b["job"]["tenantKey"] == "dga"), "the list is asked for with the job's identity");
    // "mystery" has an unknown risk word: never offered at any level
    assert!(listed.iter().any(|(t, r)| format!("{t:?}").contains("mystery") && *r == microagent::Risk::Money));
}

#[test]
fn asking_for_a_tool_that_was_not_offered_is_refused_and_the_job_can_still_finish() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let mail = r#"{"tool":"send_email","args":{"to":"x@example.org"}}"#;
    let (model, gw) = (start_model(vec![PLAN, mail, DONE], seen.clone()), start_gateway(seen.clone()));
    let r = run_job(&job("j3", Autonomy::Read), Config::default(), &model, &gw, &mut store("notoffered"), 40).unwrap();
    assert_eq!(r.stop, "done");
    assert!(seen.lock().unwrap().tools.iter().all(|(p, _, _)| p != "/run"), "send_email is not a tool of a read-only job");
}

#[test]
fn autonomy_off_runs_nothing() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let (model, gw) = (start_model(vec![DONE], seen.clone()), start_gateway(seen.clone()));
    let r = run_job(&job("j4", Autonomy::Off), Config::default(), &model, &gw, &mut store("off"), 40).unwrap();
    assert_eq!(r.stop, "declined");
    let g = seen.lock().unwrap();
    assert_eq!((g.model_calls, g.tools.len()), (0, 0));
}

#[test]
fn a_job_paused_after_a_slice_resumes_from_its_snapshot() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let (model, gw) = (start_model(vec![PLAN, READ, DONE], seen.clone()), start_gateway(seen.clone()));
    let mut st = store("resume");
    let first = run_job(&job("j5", Autonomy::Draft), Config::default(), &model, &gw, &mut st, 2).unwrap();
    assert_eq!(first.stop, "paused");
    assert!(!st.0.read_dir().unwrap().next().is_none(), "the snapshot stays");
    let calls_before = seen.lock().unwrap().model_calls;
    // a new worker process: new clients, same store
    let second = run_job(&job("j5", Autonomy::Draft), Config::default(), &model, &gw, &mut st, 40).unwrap();
    assert!(second.resumed);
    assert_eq!((second.stop.as_str(), second.summary.as_str()), ("done", "Page p1 says hello."));
    assert!(seen.lock().unwrap().model_calls > calls_before, "it carried on with the model, not from the beginning");
    assert_eq!(seen.lock().unwrap().tools.iter().filter(|(p, _, _)| p == "/run").count(), 1, "the tool ran once across both slices");
}

#[test]
fn a_model_that_keeps_failing_ends_the_job_as_failed() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let (model, gw) = (start_model(vec!["this is not json at all"], seen.clone()), start_gateway(seen.clone()));
    let r = run_job(&job("j6", Autonomy::Draft), Config::default(), &model, &gw, &mut store("fails"), 40).unwrap();
    assert!(r.stop.starts_with("failed"), "{}", r.stop);
}
