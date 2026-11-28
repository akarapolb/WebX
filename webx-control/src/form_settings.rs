//! A workspace's own settings for its form inboxes (decision D6): the prefix of its reference numbers and the address a new
//! complaint is reported to. WordPress gave each tenant its own (ORST-CMP-2569-123456, RS-CMP-...; a staff address per tenant),
//! where Strapi used DGA- and one address for everyone. A workspace whose forms move here from WordPress keeps its own by
//! setting them; one that sets nothing gets what Strapi gave: the prefix "DGA" and WEBX_COMPLAINT_NOTIFY_EMAIL.
//!
//!   GET|PUT|DELETE /admin/tenants/<key>/forms   {refPrefix, notifyEmail}   (main.rs, the admin token)
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS form_settings(
  tenant_key TEXT PRIMARY KEY,
  ref_prefix TEXT,
  notify_email TEXT,
  updated_at TEXT NOT NULL
);
";

/// The prefix of a workspace's reference numbers when it has none of its own, as Strapi makes them.
pub const DEFAULT_PREFIX: &str = "DGA";

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Settings {
    pub ref_prefix: Option<String>,
    pub notify_email: Option<String>,
}

impl Settings {
    pub fn to_json(&self) -> Value {
        json!({"refPrefix": self.ref_prefix, "notifyEmail": self.notify_email})
    }
}

fn e(err: rusqlite::Error) -> String {
    err.to_string()
}

/// A workspace's settings; all unset when it has none.
pub fn get(conn: &Connection, key: &str) -> Result<Settings, String> {
    conn.query_row("SELECT ref_prefix, notify_email FROM form_settings WHERE tenant_key=?1", params![key], |r| {
        Ok(Settings { ref_prefix: r.get(0)?, notify_email: r.get(1)? })
    })
    .optional()
    .map(Option::unwrap_or_default)
    .map_err(e)
}

/// Whether the workspace has settings of its own.
pub fn exists(conn: &Connection, key: &str) -> Result<bool, String> {
    conn.query_row("SELECT 1 FROM form_settings WHERE tenant_key=?1", params![key], |_| Ok(())).optional().map(|r| r.is_some()).map_err(e)
}

/// The prefix the workspace's reference numbers start with: its own, else "DGA". A database error gives "DGA" too, so a
/// visitor's submission never fails on it.
pub fn ref_prefix(conn: &Connection, key: &str) -> String {
    get(conn, key).ok().and_then(|s| s.ref_prefix).unwrap_or_else(|| DEFAULT_PREFIX.to_string())
}

/// Where a new complaint of the workspace is reported to: its own address, else the deployment's (WEBX_COMPLAINT_NOTIFY_EMAIL).
pub fn notify_email(conn: &Connection, key: &str, deployment: Option<&str>) -> Option<String> {
    get(conn, key).ok().and_then(|s| s.notify_email).or_else(|| deployment.map(str::to_string))
}

/// A prefix as reference numbers carry it: a capital letter, then capitals or digits, 2 to 12 characters (DGA, ORST, RS, PEA).
pub fn valid_prefix(p: &str) -> bool {
    let b = p.as_bytes();
    (2..=12).contains(&b.len()) && b[0].is_ascii_uppercase() && b.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

/// Store the workspace's settings from `{refPrefix, notifyEmail}`: a PUT replaces them, so a field left out or null is unset.
/// Returns whether they are new.
pub fn put(conn: &Connection, key: &str, body: &Value, now_iso: &str) -> Result<bool, String> {
    let Some(obj) = body.as_object() else { return Err("the body must be an object".into()) };
    if let Some(k) = obj.keys().find(|k| !matches!(k.as_str(), "refPrefix" | "notifyEmail")) {
        return Err(format!("unknown field {k}: give refPrefix and notifyEmail"));
    }
    let text = |f: &str| -> Result<Option<String>, String> {
        match obj.get(f) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(s)) if s.trim().is_empty() => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.trim().to_string())),
            Some(_) => Err(format!("{f} must be a string")),
        }
    };
    let prefix = text("refPrefix")?;
    if let Some(p) = &prefix {
        if !valid_prefix(p) {
            return Err("refPrefix: a capital letter, then capitals or digits, 2 to 12 characters (ORST, RS)".into());
        }
    }
    let notify = text("notifyEmail")?;
    if let Some(m) = &notify {
        if !crate::forms::email_ok(m) {
            return Err("notifyEmail is not an e-mail address".into());
        }
    }
    let created = !exists(conn, key)?;
    conn.execute(
        "INSERT INTO form_settings(tenant_key, ref_prefix, notify_email, updated_at) VALUES (?1,?2,?3,?4)
         ON CONFLICT(tenant_key) DO UPDATE SET ref_prefix=?2, notify_email=?3, updated_at=?4",
        params![key, prefix, notify, now_iso],
    )
    .map_err(e)?;
    Ok(created)
}

/// Forget the workspace's settings. Returns whether it had any.
pub fn delete(conn: &Connection, key: &str) -> Result<bool, String> {
    conn.execute("DELETE FROM form_settings WHERE tenant_key=?1", params![key]).map(|n| n > 0).map_err(e)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }

    #[test]
    fn a_workspace_without_settings_gets_what_strapi_gave() {
        let c = db();
        assert_eq!(get(&c, "pea").unwrap(), Settings::default());
        assert_eq!(ref_prefix(&c, "pea"), "DGA");
        assert_eq!(notify_email(&c, "pea", Some("staff@dga.or.th")).as_deref(), Some("staff@dga.or.th"));
        assert_eq!(notify_email(&c, "pea", None), None);
    }

    #[test]
    fn its_own_prefix_and_address_win() {
        let c = db();
        assert!(put(&c, "royalsociety", &json!({"refPrefix": "RS", "notifyEmail": "staff@royalsociety.example"}), "t1").unwrap());
        assert_eq!(ref_prefix(&c, "royalsociety"), "RS");
        assert_eq!(notify_email(&c, "royalsociety", Some("staff@dga.or.th")).as_deref(), Some("staff@royalsociety.example"));
        assert_eq!(ref_prefix(&c, "orst"), "DGA", "another workspace is not affected");
        // a PUT replaces: what it leaves out is unset again
        assert!(!put(&c, "royalsociety", &json!({"refPrefix": "RS"}), "t2").unwrap());
        assert_eq!(notify_email(&c, "royalsociety", Some("staff@dga.or.th")).as_deref(), Some("staff@dga.or.th"));
        assert!(delete(&c, "royalsociety").unwrap());
        assert!(!delete(&c, "royalsociety").unwrap());
        assert_eq!(ref_prefix(&c, "royalsociety"), "DGA");
    }

    #[test]
    fn bad_settings_are_refused() {
        let c = db();
        for bad in [
            json!({"refPrefix": "rs"}),
            json!({"refPrefix": "R"}),
            json!({"refPrefix": "1RS"}),
            json!({"refPrefix": "ROYAL-SOCIETY"}),
            json!({"refPrefix": "TOOLONGPREFIX1"}),
            json!({"refPrefix": 5}),
            json!({"notifyEmail": "staff"}),
            json!({"notifyEmail": "a b@c.d"}),
            json!({"colour": "red"}),
            json!(["RS"]),
        ] {
            assert!(put(&c, "orst", &bad, "t").is_err(), "{bad}");
        }
        assert!(!exists(&c, "orst").unwrap(), "nothing was stored");
        assert!(put(&c, "orst", &json!({"refPrefix": " ORST ", "notifyEmail": ""}), "t").is_ok(), "trimmed; an empty address is unset");
        assert_eq!(get(&c, "orst").unwrap(), Settings { ref_prefix: Some("ORST".into()), notify_email: None });
    }
}
