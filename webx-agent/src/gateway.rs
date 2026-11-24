//! The model and the tools, over HTTP.
use microagent::{Kind, ModelRequest, Risk, Tool, ToolCall, ToolOutput};
use serde_json::{json, Value};
use std::time::Duration;

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(10)).timeout(Duration::from_secs(120)).build()
}

/// An OpenAI-compatible chat endpoint (LiteLLM). `url` is the base (`http://litellm:4000/v1`) or the full
/// `.../chat/completions` address.
pub struct ModelClient {
    pub url: String,
    pub key: Option<String>,
    pub model: String,
}

impl ModelClient {
    pub fn endpoint(&self) -> String {
        let u = self.url.trim_end_matches('/');
        if u.ends_with("/chat/completions") { u.to_string() } else { format!("{u}/chat/completions") }
    }

    pub fn ask(&self, req: &ModelRequest) -> Result<String, String> {
        let mut r = agent().post(&self.endpoint());
        if let Some(k) = &self.key {
            r = r.set("Authorization", &format!("Bearer {k}"));
        }
        let body = json!({
            "model": self.model,
            "messages": [{"role": "system", "content": req.system}, {"role": "user", "content": req.prompt}],
            "max_tokens": req.max_tokens,
            "temperature": 0.2,
        });
        let resp: Value = r.send_json(body).map_err(|e| format!("model call failed: {e}"))?.into_json().map_err(|e| format!("model answer is not JSON: {e}"))?;
        resp["choices"][0]["message"]["content"].as_str().map(str::to_owned).ok_or_else(|| "model answer has no text".to_string())
    }
}

/// Risk from the gateway's own word. A word this crate does not know is treated as `Money`, the strictest
/// class, so a tool of an unknown kind is never run by accident.
pub fn parse_risk(s: &str) -> Risk {
    match s {
        "read" => Risk::Read,
        "create" => Risk::Create,
        "write" => Risk::Write,
        "outside" => Risk::Outside,
        _ => Risk::Money,
    }
}

fn parse_kind(s: &str) -> Kind {
    match s {
        "text" => Kind::Text,
        "number" => Kind::Number,
        "bool" => Kind::Bool,
        "list" => Kind::List,
        "object" => Kind::Object,
        _ => Kind::Any,
    }
}

/// Studio's governed tools, behind two calls:
///   GET  {base}/tools?tenantKey=&ownerEmail=   -> {"data": [{name, help, risk, args: [{name, kind, help, required}]}]}
///   POST {base}/run  {tenantKey, ownerEmail, tool, args} -> {"ok": bool, "text": string}
/// Both carry `Authorization: Bearer <secret>`. The gateway applies the owner's permissions; the tools it lists
/// are the ones that tenant and owner may use, with each tool's risk class set from those permissions (D13).
pub struct ToolGateway {
    pub base: String,
    pub secret: String,
}

impl ToolGateway {
    fn url(&self, path: &str) -> String {
        format!("{}/{}", self.base.trim_end_matches('/'), path)
    }

    pub fn list(&self, tenant: &str, owner: &str) -> Result<Vec<(Tool, Risk)>, String> {
        let resp: Value = agent()
            .get(&self.url("tools"))
            .set("Authorization", &format!("Bearer {}", self.secret))
            .query("tenantKey", tenant)
            .query("ownerEmail", owner)
            .call()
            .map_err(|e| format!("tool list failed: {e}"))?
            .into_json()
            .map_err(|e| format!("tool list is not JSON: {e}"))?;
        let mut out = Vec::new();
        for t in resp["data"].as_array().ok_or("tool list has no data")? {
            let name = t["name"].as_str().ok_or("a tool has no name")?;
            let risk = parse_risk(t["risk"].as_str().unwrap_or(""));
            let mut tool = Tool::new(name, t["help"].as_str().unwrap_or("")).risk(risk);
            for a in t["args"].as_array().cloned().unwrap_or_default() {
                let (n, k, h) = (a["name"].as_str().unwrap_or(""), parse_kind(a["kind"].as_str().unwrap_or("")), a["help"].as_str().unwrap_or(""));
                tool = if a["required"].as_bool().unwrap_or(true) { tool.arg(n, k, h) } else { tool.opt(n, k, h) };
            }
            out.push((tool, risk));
        }
        Ok(out)
    }

    pub fn run(&self, tenant: &str, owner: &str, call: &ToolCall) -> ToolOutput {
        let sent = agent()
            .post(&self.url("run"))
            .set("Authorization", &format!("Bearer {}", self.secret))
            .send_json(json!({"tenantKey": tenant, "ownerEmail": owner, "tool": call.name, "args": call.args}));
        match sent {
            Ok(r) => match r.into_json::<Value>() {
                Ok(v) => {
                    let text = v["text"].as_str().unwrap_or("").to_string();
                    if v["ok"].as_bool().unwrap_or(false) { ToolOutput::ok(text) } else { ToolOutput::error(text) }
                }
                Err(e) => ToolOutput::error(format!("tool answer is not JSON: {e}")),
            },
            Err(e) => ToolOutput::error(format!("tool call failed: {e}")),
        }
    }
}
