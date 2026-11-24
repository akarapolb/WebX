//! webx-agent: the assistant's worker.
//!
//!   webx-agent serve [--once] [--worker-id w1] [--poll-seconds 5] [--max-steps 40] [--default-cap 2] [--heartbeat-ms 20000]
//!       Lease jobs from the queue in webx-control and run them. Needs WEBX_CONTROL_URL and WEBX_CONTROL_SERVICE_TOKEN.
//!       --once claims what is runnable, runs it, and exits (for tests and cron).
//!
//!   webx-agent run ...   run one job from the command line, snapshots in a folder (see below)
//!
//!   webx-agent run --goal "Summarise last month's audit log" --tenant dga --owner ann@example.org --owner-user-id 7 \
//!       [--engine strapi] [--required-level read] [--policy-snapshot '<json>'] [--lang en] [--autonomy draft] [--id job-1] [--state ./agent-state] [--max-steps 40]
//!
//! Environment (both commands): LITELLM_URL, LITELLM_KEY (optional), LITELLM_MODEL (default webx-default),
//!              WEBX_TOOLS_URL, WEBX_TOOLS_SECRET.
use microagent::Config;
use webx_agent::serve::{serve_forever, serve_once, ServeConfig};
use webx_agent::{run_job, Autonomy, ControlClient, FileStore, Job, ModelClient, ToolGateway};

fn arg(name: &str) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == &format!("--{name}")).and_then(|i| args.get(i + 1).cloned())
}
fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| {
        eprintln!("{name} is required");
        std::process::exit(2);
    })
}

fn clients() -> (ModelClient, ToolGateway) {
    (
        ModelClient { url: env("LITELLM_URL"), key: std::env::var("LITELLM_KEY").ok().filter(|k| !k.is_empty()), model: std::env::var("LITELLM_MODEL").unwrap_or_else(|_| "webx-default".into()) },
        ToolGateway { base: env("WEBX_TOOLS_URL"), secret: env("WEBX_TOOLS_SECRET") },
    )
}

fn serve() {
    let control = ControlClient { base: env("WEBX_CONTROL_URL"), token: env("WEBX_CONTROL_SERVICE_TOKEN") };
    let (model, gateway) = clients();
    let num = |n: &str, d: u64| arg(n).and_then(|v| v.parse::<u64>().ok()).unwrap_or(d);
    let cfg = ServeConfig {
        worker_id: arg("worker-id").unwrap_or_else(|| format!("worker-{}", std::process::id())),
        max_steps: num("max-steps", 40) as u32,
        default_cap: num("default-cap", 2) as i64,
        heartbeat_every: std::time::Duration::from_millis(num("heartbeat-ms", 20_000)),
        ..ServeConfig::default()
    };
    if std::env::args().any(|a| a == "--once") {
        match serve_once(&control, &model, &gateway, &cfg) {
            Ok(n) => eprintln!("[webx-agent] ran {n} job(s)"),
            Err(e) => {
                eprintln!("[webx-agent] {e}");
                std::process::exit(1);
            }
        }
        return;
    }
    eprintln!("[webx-agent] {} serving the queue at {}", cfg.worker_id, control.base);
    serve_forever(&control, &model, &gateway, &cfg, std::time::Duration::from_secs(num("poll-seconds", 5)));
}

fn main() {
    if std::env::args().nth(1).as_deref() == Some("serve") {
        return serve();
    }
    if std::env::args().nth(1).as_deref() != Some("run") {
        eprintln!("usage: webx-agent serve [--once] | webx-agent run --goal <text> --tenant <key> --owner <email> --owner-user-id <id> [--engine strapi] [--required-level read] [--autonomy draft] [--id <id>] [--state <dir>] [--max-steps 40]");
        std::process::exit(2);
    }
    let need = |n: &str| arg(n).unwrap_or_else(|| { eprintln!("--{n} is required"); std::process::exit(2); });
    let job = Job {
        id: arg("id").unwrap_or_else(|| format!("job-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis())),
        tenant: need("tenant"),
        owner: need("owner"),
        owner_user_id: need("owner-user-id"),
        engine: arg("engine").unwrap_or_else(|| "strapi".into()),
        required_level: arg("required-level").unwrap_or_else(|| "read".into()),
        policy_snapshot: arg("policy-snapshot").and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::Value::Null),
        lang: arg("lang").unwrap_or_else(|| "en".into()),
        goal: need("goal"),
        context: arg("context").unwrap_or_default(),
        autonomy: Autonomy::parse(&arg("autonomy").unwrap_or_else(|| "read".into())),
    };
    let (model, gateway) = clients();
    let mut store = FileStore(arg("state").unwrap_or_else(|| "agent-state".into()).into());
    let max_steps = arg("max-steps").and_then(|v| v.parse().ok()).unwrap_or(40);
    match run_job(&job, Config::default(), &model, &gateway, &mut store, max_steps) {
        Ok(r) => {
            println!("{}: {}", r.stop, r.summary);
            eprintln!("[webx-agent] {} step(s), {} tool call(s){}", r.steps, r.calls, if r.resumed { ", resumed" } else { "" });
            std::process::exit(if r.stop == "done" || r.stop == "paused" { 0 } else { 1 });
        }
        Err(e) => {
            eprintln!("[webx-agent] {e}");
            std::process::exit(1);
        }
    }
}
