//! The tenant registry: which organisations exist, which content engine each
//! uses, and what the public site shows about them. SQLite, one row per tenant.
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub const ENGINES: [&str; 3] = ["strapi", "wordpress", "rust"];
const VERSION: i64 = 1;

const DDL: &str = "
CREATE TABLE tenants(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  engine TEXT NOT NULL,
  public_template TEXT NOT NULL,
  engine_url TEXT,
  resolve TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
";

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

pub fn open(path: &str) -> Result<Connection, String> {
    let fresh = path == ":memory:" || !std::path::Path::new(path).exists();
    let conn = Connection::open(path).map_err(e)?;
    if fresh {
        conn.execute_batch(DDL).map_err(e)?;
        conn.execute_batch(&format!("PRAGMA user_version = {VERSION};")).map_err(e)?;
    } else {
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
        if v != VERSION {
            return Err(format!("registry: unsupported database version {v} (expected {VERSION})"));
        }
    }
    Ok(conn)
}

pub fn valid_key(k: &str) -> bool {
    let b = k.as_bytes();
    (2..=32).contains(&b.len()) && b[0].is_ascii_alphanumeric() && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

pub struct Tenant {
    pub key: String,
    pub engine: String,
    pub public_template: String,
    pub engine_url: Option<String>,
    pub resolve: Value,
}

impl Tenant {
    /// The admin view of a tenant.
    pub fn to_json(&self) -> Value {
        json!({"key": self.key, "engine": self.engine, "publicTemplate": self.public_template, "engineUrl": self.engine_url, "resolve": self.resolve})
    }
}

/// The public list, as Strapi's /api/tenants/keys answers it.
pub fn keys(conn: &Connection) -> Result<Value, String> {
    let mut st = conn.prepare("SELECT key, engine, public_template FROM tenants ORDER BY seq").map_err(e)?;
    let rows = st
        .query_map([], |r| Ok(json!({"key": r.get::<_, String>(0)?, "engine": r.get::<_, String>(1)?, "publicTemplate": r.get::<_, String>(2)?})))
        .map_err(e)?;
    let mut data = Vec::new();
    for r in rows {
        data.push(r.map_err(e)?);
    }
    Ok(json!({"data": data}))
}

/// What the public site shows about one tenant (name, brand, contact, footer).
pub fn resolve(conn: &Connection, key: &str) -> Result<Option<Value>, String> {
    let s: Option<String> = conn.query_row("SELECT resolve FROM tenants WHERE key=?1", params![key], |r| r.get(0)).optional().map_err(e)?;
    s.map(|s| serde_json::from_str(&s).map_err(e)).transpose()
}

/// The first tenant created, which a request that names no tenant gets.
pub fn default_key(conn: &Connection) -> Option<String> {
    conn.query_row("SELECT key FROM tenants ORDER BY seq LIMIT 1", [], |r| r.get(0)).ok()
}

pub fn get(conn: &Connection, key: &str) -> Result<Option<Tenant>, String> {
    let row = conn
        .query_row("SELECT key, engine, public_template, engine_url, resolve FROM tenants WHERE key=?1", params![key], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, String>(4)?))
        })
        .optional()
        .map_err(e)?;
    match row {
        None => Ok(None),
        Some((key, engine, public_template, engine_url, r)) => Ok(Some(Tenant { key, engine, public_template, engine_url, resolve: serde_json::from_str(&r).map_err(e)? })),
    }
}

pub fn list(conn: &Connection) -> Result<Vec<Tenant>, String> {
    let keys: Vec<String> = {
        let mut st = conn.prepare("SELECT key FROM tenants ORDER BY seq").map_err(e)?;
        let rows = st.query_map([], |r| r.get::<_, String>(0)).map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)?
    };
    let mut out = Vec::new();
    for k in keys {
        if let Some(t) = get(conn, &k)? {
            out.push(t);
        }
    }
    Ok(out)
}

/// Create or replace a tenant; true when it is new. `body` is
/// {engine, publicTemplate, engineUrl?, resolve?}.
pub fn upsert(conn: &Connection, key: &str, body: &Value, now: &str) -> Result<bool, String> {
    if !valid_key(key) {
        return Err("key must be 2-32 characters of a-z, 0-9 and -, starting with a letter or digit".into());
    }
    let engine = body["engine"].as_str().ok_or("engine is required")?;
    if !ENGINES.contains(&engine) {
        return Err(format!("engine must be one of {}", ENGINES.join(", ")));
    }
    let template = body["publicTemplate"].as_str().filter(|t| !t.is_empty()).ok_or("publicTemplate is required")?;
    let url = match &body["engineUrl"] {
        Value::Null => None,
        Value::String(u) if u.starts_with("http://") || u.starts_with("https://") => Some(u.clone()),
        _ => return Err("engineUrl must be an http(s) URL".into()),
    };
    let resolve = match &body["resolve"] {
        Value::Null => json!({"key": key}),
        v if v.is_object() => v.clone(),
        _ => return Err("resolve must be an object".into()),
    };
    let existed = get(conn, key)?.is_some();
    conn.execute(
        "INSERT INTO tenants(key, engine, public_template, engine_url, resolve, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)
         ON CONFLICT(key) DO UPDATE SET engine=?2, public_template=?3, engine_url=?4, resolve=?5, updated_at=?6",
        params![key, engine, template, url, resolve.to_string(), now],
    )
    .map_err(e)?;
    Ok(!existed)
}

pub fn remove(conn: &Connection, key: &str) -> Result<bool, String> {
    Ok(conn.execute("DELETE FROM tenants WHERE key=?1", params![key]).map_err(e)? > 0)
}

/// Fill the registry from a rust-engine snapshot (its `special` answers are what
/// Strapi gave for /api/tenants/keys and /resolve). Returns the count.
pub fn import(conn: &Connection, snapshot: &Value, now: &str) -> Result<usize, String> {
    let keys = snapshot["special"]["tenants/keys"]["data"].as_array().ok_or("snapshot has no special.tenants/keys")?;
    let mut n = 0;
    for k in keys {
        let key = k["key"].as_str().ok_or("tenant without key")?;
        let resolve = snapshot["special"]["tenants/resolve"][key]["data"].clone();
        upsert(conn, key, &json!({"engine": k["engine"], "publicTemplate": k["publicTemplate"], "resolve": resolve}), now)?;
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        open(":memory:").unwrap()
    }
    const NOW: &str = "2026-01-01T00:00:00.000Z";

    #[test]
    fn keys_keep_creation_order_and_shape() {
        let c = db();
        upsert(&c, "dga", &json!({"engine": "strapi", "publicTemplate": "gov-portal"}), NOW).unwrap();
        upsert(&c, "orst", &json!({"engine": "wordpress", "publicTemplate": "orst"}), NOW).unwrap();
        assert_eq!(
            keys(&c).unwrap(),
            json!({"data": [
                {"key": "dga", "engine": "strapi", "publicTemplate": "gov-portal"},
                {"key": "orst", "engine": "wordpress", "publicTemplate": "orst"}]})
        );
        assert_eq!(default_key(&c).as_deref(), Some("dga"));
    }

    #[test]
    fn resolve_returns_what_was_stored_with_key_order_kept() {
        let c = db();
        upsert(&c, "dga", &json!({"engine": "strapi", "publicTemplate": "t", "resolve": {"key": "dga", "name": "ก", "brand": {"zeta": 1, "alpha": 2}}}), NOW).unwrap();
        assert_eq!(resolve(&c, "dga").unwrap().unwrap().to_string(), "{\"key\":\"dga\",\"name\":\"ก\",\"brand\":{\"zeta\":1,\"alpha\":2}}");
        assert!(resolve(&c, "nope").unwrap().is_none());
    }

    #[test]
    fn upsert_replaces_and_keeps_position() {
        let c = db();
        assert!(upsert(&c, "a1", &json!({"engine": "strapi", "publicTemplate": "t"}), NOW).unwrap());
        upsert(&c, "b1", &json!({"engine": "strapi", "publicTemplate": "t"}), NOW).unwrap();
        assert!(!upsert(&c, "a1", &json!({"engine": "rust", "publicTemplate": "t2", "engineUrl": "http://x:1"}), NOW).unwrap());
        let t = get(&c, "a1").unwrap().unwrap();
        assert_eq!((t.engine.as_str(), t.public_template.as_str(), t.engine_url.as_deref()), ("rust", "t2", Some("http://x:1")));
        assert_eq!(default_key(&c).as_deref(), Some("a1"));
    }

    #[test]
    fn bad_input_is_refused() {
        let c = db();
        let ok = json!({"engine": "strapi", "publicTemplate": "t"});
        let long = "a".repeat(33);
        for key in ["", "a", "A1", "has space", "-x", "../x", long.as_str()] {
            assert!(upsert(&c, key, &ok, NOW).is_err(), "{key}");
        }
        assert!(upsert(&c, "ok", &json!({"engine": "mysql", "publicTemplate": "t"}), NOW).is_err());
        assert!(upsert(&c, "ok", &json!({"engine": "rust"}), NOW).is_err());
        assert!(upsert(&c, "ok", &json!({"engine": "rust", "publicTemplate": "t", "engineUrl": "ftp://x"}), NOW).is_err());
        assert!(upsert(&c, "ok", &json!({"engine": "rust", "publicTemplate": "t", "resolve": "x"}), NOW).is_err());
        assert!(list(&c).unwrap().is_empty());
    }

    #[test]
    fn remove_and_import() {
        let c = db();
        let snap = json!({"special": {"tenants/keys": {"data": [{"key": "dga", "engine": "strapi", "publicTemplate": "gov-portal"}]},
            "tenants/resolve": {"dga": {"data": {"key": "dga", "name": "x"}}}}});
        assert_eq!(import(&c, &snap, NOW).unwrap(), 1);
        assert_eq!(resolve(&c, "dga").unwrap().unwrap()["name"], "x");
        assert!(remove(&c, "dga").unwrap());
        assert!(!remove(&c, "dga").unwrap());
    }
}
