//! The visitors' routes (docs/target-architecture.md, track C5, decision D12): what a visitor's browser calls
//! without signing in. First the cookie-consent log, a port of Strapi's `POST /api/consent-logs?tenant=`.
//! A consent record is evidence (PDPA), so it is stored as given, with only the size limits that keep an anonymous
//! caller from filling the disk, and a per-address rate limit.
use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// What one address may log per window.
pub const RATE_LIMIT: u32 = 30;
pub const RATE_WINDOW_MS: i64 = 60_000;
/// Past this many tracked addresses the table is swept of expired windows.
const SWEEP_AT: usize = 10_000;

#[derive(Default)]
pub struct RateLimiter {
    windows: HashMap<String, (i64, u32)>,
}

impl RateLimiter {
    /// Count one request from `who` at `now`; false when it is over the limit for the current window.
    #[cfg(test)]
    pub fn allow(&mut self, who: &str, now: i64) -> bool {
        self.allow_up_to(who, now, RATE_LIMIT)
    }

    /// The same with a limit of the route's own (the assistant's calls are dearer than a cookie choice).
    pub fn allow_up_to(&mut self, who: &str, now: i64, limit: u32) -> bool {
        if self.windows.len() > SWEEP_AT {
            self.windows.retain(|_, (start, _)| now - *start < RATE_WINDOW_MS);
        }
        let w = self.windows.entry(who.to_string()).or_insert((now, 0));
        if now - w.0 >= RATE_WINDOW_MS {
            *w = (now, 0);
        }
        w.1 += 1;
        w.1 <= limit
    }
}

fn text(d: &Value, k: &str, max: usize) -> Result<Option<String>, String> {
    match d.get(k) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.chars().take(max).collect())),
        _ => Err(format!("{k} must be text")),
    }
}

/// A consent log body, `{data: {consentId, action, categories, language, path, userAgent}}` (or the fields bare),
/// as the document to store. Unknown fields are dropped; text is cut at its limit; `categories` must be an object of
/// modest size.
pub fn consent_document(body: &Value, tenant_key: &str) -> Result<Value, String> {
    let d = body.get("data").unwrap_or(body);
    if !d.is_object() {
        return Err("data must be an object".into());
    }
    let mut o = Map::new();
    o.insert("tenantKey".into(), json!(tenant_key));
    for (k, max) in [("consentId", 64), ("action", 32), ("language", 16), ("path", 512), ("userAgent", 512)] {
        if let Some(s) = text(d, k, max)? {
            o.insert(k.into(), json!(s));
        }
    }
    match d.get("categories") {
        None | Some(Value::Null) => {}
        Some(c @ Value::Object(_)) if c.to_string().len() <= 2048 => {
            o.insert("categories".into(), c.clone());
        }
        _ => return Err("categories must be an object of at most 2 KB".into()),
    }
    if !o.contains_key("action") {
        return Err("action is required".into());
    }
    Ok(Value::Object(o))
}

/// How the dashboards class a consent action, as Strapi's analytics counts it: accept, reject, or custom.
pub fn consent_class(action: &str) -> &'static str {
    let a = action.to_lowercase();
    if a.contains("accept") || a == "all" || a == "opt-in" {
        "accept"
    } else if a.contains("reject") || a == "none" || a == "opt-out" {
        "reject"
    } else {
        "custom"
    }
}

/// `{total, accept, reject, custom}` from the counts of each action (a row without one counts as custom).
pub fn consent_summary(counts: &[(Option<String>, usize)]) -> Value {
    let (mut accept, mut reject, mut custom) = (0, 0, 0);
    for (action, n) in counts {
        match consent_class(action.as_deref().unwrap_or("")) {
            "accept" => accept += n,
            "reject" => reject += n,
            _ => custom += n,
        }
    }
    json!({"total": accept + reject + custom, "accept": accept, "reject": reject, "custom": custom})
}

/// The development origins Strapi's CORS already allows for the public site.
const DEV_ORIGINS: [&str; 4] = ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:3100", "http://localhost:8095"];

/// The browser origins that may call the visitors' routes: the development ones plus `extra` (WEBX_PUBLIC_SITE_ORIGINS,
/// comma-separated, a trailing slash ignored). `*` allows any origin, which is safe here: these routes are anonymous and
/// take no cookies.
pub fn allowed_origins(extra: &str) -> Vec<String> {
    let mut v: Vec<String> = DEV_ORIGINS.iter().map(|s| s.to_string()).collect();
    v.extend(extra.split(',').map(|s| s.trim().trim_end_matches('/').to_string()).filter(|s| !s.is_empty()));
    v
}

/// What to answer in Access-Control-Allow-Origin for a request that came from `origin`; None when it is not allowed.
pub fn allow_origin(allowed: &[String], origin: Option<&str>) -> Option<String> {
    if allowed.iter().any(|a| a == "*") {
        return Some("*".into());
    }
    origin.filter(|o| allowed.iter().any(|a| a == o)).map(str::to_string)
}

/// Whether a path is one a visitor's browser calls (CORS applies); the sign-in check Studio makes server to server is not.
pub fn is_visitor_path(path: &str) -> bool {
    path.starts_with("/api/") && !path.starts_with("/api/auth/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_consent_body_is_kept_as_given_with_the_workspace_stamped_on() {
        let b = json!({"data": {"consentId": "c1", "action": "accept_all", "categories": {"necessary": true, "analytics": true}, "language": "th", "path": "/pea", "userAgent": "UA", "extra": "dropped"}});
        let d = consent_document(&b, "pea").unwrap();
        assert_eq!(d["tenantKey"], "pea");
        assert_eq!(d["action"], "accept_all");
        assert_eq!(d["categories"]["analytics"], true);
        assert!(d.get("extra").is_none());
        assert_eq!(consent_document(&json!({"action": "reject"}), "dga").unwrap()["action"], "reject", "fields may come bare");
    }

    #[test]
    fn long_text_is_cut_and_bad_shapes_are_refused() {
        let long = "x".repeat(2000);
        let d = consent_document(&json!({"data": {"action": "custom", "path": long, "userAgent": long}}), "dga").unwrap();
        assert_eq!(d["path"].as_str().unwrap().len(), 512);
        assert!(consent_document(&json!({"data": {"path": "/"}}), "dga").is_err(), "an action is needed");
        assert!(consent_document(&json!({"data": {"action": 3}}), "dga").is_err());
        assert!(consent_document(&json!({"data": {"action": "a", "categories": [1]}}), "dga").is_err());
        assert!(consent_document(&json!({"data": {"action": "a", "categories": {"k": long.repeat(2)}}}), "dga").is_err());
        assert!(consent_document(&json!("nope"), "dga").is_err());
    }

    #[test]
    fn consent_actions_are_classed_as_the_dashboards_count_them() {
        for a in ["accept_all", "ACCEPT", "all", "opt-in"] { assert_eq!(consent_class(a), "accept", "{a}"); }
        for a in ["reject", "reject_all", "none", "opt-out"] { assert_eq!(consent_class(a), "reject", "{a}"); }
        for a in ["custom", "", "save"] { assert_eq!(consent_class(a), "custom", "{a}"); }
        let s = consent_summary(&[(Some("accept_all".into()), 4), (Some("reject".into()), 2), (Some("custom".into()), 1), (None, 3)]);
        assert_eq!((s["total"].as_u64(), s["accept"].as_u64(), s["reject"].as_u64(), s["custom"].as_u64()), (Some(10), Some(4), Some(2), Some(4)));
    }

    #[test]
    fn origins_come_from_the_environment_and_only_listed_ones_are_allowed() {
        let a = allowed_origins(" https://pea.example.go.th/ ,https://nbtc.example.go.th,");
        assert_eq!(allow_origin(&a, Some("https://pea.example.go.th")).as_deref(), Some("https://pea.example.go.th"), "a trailing slash in the setting is ignored");
        assert_eq!(allow_origin(&a, Some("http://localhost:3100")).as_deref(), Some("http://localhost:3100"), "development origins are always allowed");
        assert_eq!(allow_origin(&a, Some("https://evil.example.com")), None);
        assert_eq!(allow_origin(&a, None), None, "a request with no Origin header (a server) gets no CORS answer");
        assert_eq!(allow_origin(&allowed_origins("*"), Some("https://anything.example")).as_deref(), Some("*"));
        assert!(is_visitor_path("/api/consent-logs") && is_visitor_path("/api/tenants/resolve"));
        assert!(!is_visitor_path("/api/auth/me") && !is_visitor_path("/internal/records/consent-log") && !is_visitor_path("/admin/tenants"));
    }

    #[test]
    fn an_address_is_limited_per_window_and_others_are_not_affected() {
        let mut r = RateLimiter::default();
        for _ in 0..RATE_LIMIT {
            assert!(r.allow("1.2.3.4", 1000));
        }
        assert!(!r.allow("1.2.3.4", 2000), "over the limit inside the window");
        assert!(r.allow("5.6.7.8", 2000));
        assert!(r.allow("1.2.3.4", 1000 + RATE_WINDOW_MS), "a new window starts fresh");
    }
}
