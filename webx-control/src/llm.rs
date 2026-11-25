//! One call to an OpenAI-compatible `/chat/completions` endpoint (the LiteLLM proxy in platform/webx/litellm, or anything
//! speaking the same protocol), and the small HTTP reads the assistant makes of a content engine. A port of
//! strapi-cms/src/utils/llm.ts with the same settings, so one environment file serves both:
//!
//!   LITELLM_URL         proxy base URL, e.g. http://localhost:4000 (unset = no LLM)
//!   LITELLM_KEY         bearer key (master or per-tenant virtual key)
//!   LITELLM_MODEL       model alias, default "webx-default"
//!   LITELLM_ASK_MODEL   model for the public site assistant (default: LITELLM_MODEL)
//!   LITELLM_TIMEOUT_MS  give up after this long, default 20000
//!
//! Calls are blocking (ureq with rustls): run them off the async runtime.
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct LlmConfig {
    pub url: String,
    pub key: String,
    pub model: String,
    pub timeout_ms: u64,
}

/// The LLM settings from an environment lookup: None when LITELLM_URL is unset. `ask` picks the model for the site assistant.
pub fn config(env: &dyn Fn(&str) -> Option<String>, ask: bool) -> Option<LlmConfig> {
    let url = env("LITELLM_URL").unwrap_or_default().trim().trim_end_matches('/').to_string();
    if url.is_empty() {
        return None;
    }
    let nonempty = |k: &str| env(k).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let model = if ask { nonempty("LITELLM_ASK_MODEL") } else { None }.or_else(|| nonempty("LITELLM_MODEL")).unwrap_or_else(|| "webx-default".into());
    Some(LlmConfig { url, key: env("LITELLM_KEY").unwrap_or_default(), model, timeout_ms: env("LITELLM_TIMEOUT_MS").and_then(|v| v.trim().parse().ok()).filter(|n| *n > 0).unwrap_or(20_000) })
}

/// One chat call: a system message and a prompt. Errors on a non-2xx answer (`llm 500`), a timeout or a malformed reply; an
/// answer with no content is an empty string.
pub fn chat(cfg: &LlmConfig, system: &str, prompt: &str, max_tokens: u32) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_millis(cfg.timeout_ms)).build();
    let mut req = agent.post(&format!("{}/chat/completions", cfg.url)).set("Content-Type", "application/json");
    if !cfg.key.is_empty() {
        req = req.set("Authorization", &format!("Bearer {}", cfg.key));
    }
    let body = json!({"model": cfg.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}], "max_tokens": max_tokens, "temperature": 0.4});
    let resp = req.send_json(body).map_err(|e| match e {
        ureq::Error::Status(code, _) => format!("llm {code}"),
        other => other.to_string(),
    })?;
    let v: Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string())
}

/// A GET that answers JSON, with a time limit.
pub fn get_json(url: &str, timeout_ms: u64) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_millis(timeout_ms)).build();
    let resp = agent.get(url).set("Accept", "application/json").call().map_err(|e| match e {
        ureq::Error::Status(code, _) => format!("HTTP {code}"),
        other => other.to_string(),
    })?;
    resp.into_json().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let m: HashMap<String, String> = pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        move |k| m.get(k).cloned()
    }

    #[test]
    fn no_litellm_url_means_no_llm_and_the_ask_model_and_timeout_are_configurable() {
        assert!(config(&env(&[]), false).is_none());
        assert!(config(&env(&[("LITELLM_URL", "  ")]), true).is_none());
        let e = env(&[("LITELLM_URL", "http://127.0.0.1:4000/"), ("LITELLM_KEY", "sk-test"), ("LITELLM_ASK_MODEL", "webx-thai"), ("LITELLM_TIMEOUT_MS", "300")]);
        let ask = config(&e, true).unwrap();
        assert_eq!((ask.url.as_str(), ask.key.as_str(), ask.model.as_str(), ask.timeout_ms), ("http://127.0.0.1:4000", "sk-test", "webx-thai", 300));
        assert_eq!(config(&e, false).unwrap().model, "webx-default", "the general calls do not use the ask model");
        assert_eq!(config(&env(&[("LITELLM_URL", "http://x"), ("LITELLM_ASK_MODEL", ""), ("LITELLM_MODEL", "m1")]), true).unwrap().model, "m1");
        assert_eq!(config(&env(&[("LITELLM_URL", "http://x"), ("LITELLM_TIMEOUT_MS", "nope")]), false).unwrap().timeout_ms, 20_000);
    }
}
