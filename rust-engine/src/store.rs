//! The engine's own durable store (docs/target-architecture.md, track R2).
//!
//! A snapshot exported from Strapi is one JSON document. This module keeps the
//! same document in SQLite, one row per entry, so the engine can start from its
//! own database instead of an export file, and so later milestones (the write
//! API, R3) have somewhere to put what editors save. The read logic is
//! unchanged: `read_doc` rebuilds the document and the engine serves it from
//! memory exactly as it serves a snapshot.
//!
//! Tables (user_version 1):
//!   meta(key, value)                 every top-level key except data/schema/special, as JSON
//!   schema_items(kind, name, value)  kind "types" or "components"; value is the JSON schema map
//!   special(key, value)              tenants/keys, tenants/resolve answers, as Strapi gave them
//!   entries(type, tenant, locale, seq, document_id, data)
//!                                    data is the entry's JSON text, verbatim, so key order is kept;
//!                                    seq keeps export order (id ascending)
use rusqlite::{params, Connection};
use serde_json::{Map, Value};

const VERSION: i64 = 1;

const DDL: &str = "
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE schema_items(kind TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind, name));
CREATE TABLE special(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE entries(
  type TEXT NOT NULL, tenant TEXT NOT NULL, locale TEXT NOT NULL, seq INTEGER NOT NULL,
  document_id TEXT, data TEXT NOT NULL,
  PRIMARY KEY(type, tenant, locale, seq)
);
CREATE INDEX entries_document ON entries(type, document_id);
";

/// Stored in `meta` under this key; never part of the rebuilt document's own keys.
const SHAPE_KEY: &str = "__data_shape";

fn e<E: std::fmt::Display>(x: E) -> String { x.to_string() }

/// `data` with every list of entries replaced by an empty list.
fn shape_of(v: &Value) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().map(|(k, x)| (k.clone(), shape_of(x))).collect()),
        Value::Array(_) => Value::Array(Vec::new()),
        other => other.clone(),
    }
}

/// Write the snapshot document into an empty database. Returns the entry count.
pub fn write_doc(conn: &mut Connection, doc: &Value) -> Result<usize, String> {
    let tx = conn.transaction().map_err(e)?;
    tx.execute_batch(DDL).map_err(e)?;
    tx.execute_batch(&format!("PRAGMA user_version = {VERSION};")).map_err(e)?;

    let obj = doc.as_object().ok_or("store: the snapshot is not an object")?;
    for (k, v) in obj {
        if matches!(k.as_str(), "data" | "schema" | "special") { continue; }
        tx.execute("INSERT INTO meta(key, value) VALUES (?1, ?2)", params![k, v.to_string()]).map_err(e)?;
    }
    for kind in ["types", "components"] {
        if let Some(items) = doc["schema"].get(kind).and_then(Value::as_object) {
            for (name, v) in items {
                tx.execute("INSERT INTO schema_items(kind, name, value) VALUES (?1, ?2, ?3)", params![kind, name, v.to_string()]).map_err(e)?;
            }
        }
    }
    if let Some(special) = doc.get("special").and_then(Value::as_object) {
        for (k, v) in special {
            tx.execute("INSERT INTO special(key, value) VALUES (?1, ?2)", params![k, v.to_string()]).map_err(e)?;
        }
    }

    // A collection with no entries must still exist (the read API answers 200 with an
    // empty list, not 404), so the shape of `data` is stored with every list emptied.
    if let Some(data) = doc.get("data") {
        tx.execute("INSERT INTO meta(key, value) VALUES (?1, ?2)", params![SHAPE_KEY, shape_of(data).to_string()]).map_err(e)?;
    }

    let mut count = 0usize;
    if let Some(data) = doc.get("data").and_then(Value::as_object) {
        let mut ins = tx.prepare("INSERT INTO entries(type, tenant, locale, seq, document_id, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").map_err(e)?;
        for (plural, tenants) in data {
            for (tenant, locales) in tenants.as_object().ok_or("store: data.<type> is not an object")? {
                for (locale, rows) in locales.as_object().ok_or("store: data.<type>.<tenant> is not an object")? {
                    for (seq, row) in rows.as_array().ok_or("store: data.<type>.<tenant>.<locale> is not an array")?.iter().enumerate() {
                        ins.execute(params![plural, tenant, locale, seq as i64, row["documentId"].as_str(), row.to_string()]).map_err(e)?;
                        count += 1;
                    }
                }
            }
        }
    }
    tx.commit().map_err(e)?;
    Ok(count)
}

/// Rebuild the snapshot document from the database.
pub fn read_doc(conn: &Connection) -> Result<Value, String> {
    let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
    if v != VERSION { return Err(format!("store: unsupported database version {v} (expected {VERSION}); run `import` again")); }
    let parse = |s: String| -> Result<Value, String> { serde_json::from_str(&s).map_err(e) };

    let mut doc = Map::new();
    let mut st = conn.prepare("SELECT key, value FROM meta ORDER BY rowid").map_err(e)?;
    for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(e)? {
        let (k, s) = r.map_err(e)?;
        doc.insert(k, parse(s)?);
    }

    let mut schema = Map::new();
    for kind in ["types", "components"] { schema.insert(kind.into(), Value::Object(Map::new())); }
    let mut st = conn.prepare("SELECT kind, name, value FROM schema_items ORDER BY rowid").map_err(e)?;
    for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))).map_err(e)? {
        let (kind, name, s) = r.map_err(e)?;
        if let Some(Value::Object(m)) = schema.get_mut(&kind) { m.insert(name, parse(s)?); }
    }
    doc.insert("schema".into(), Value::Object(schema));

    let mut special = Map::new();
    let mut st = conn.prepare("SELECT key, value FROM special ORDER BY rowid").map_err(e)?;
    for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(e)? {
        let (k, s) = r.map_err(e)?;
        special.insert(k, parse(s)?);
    }
    doc.insert("special".into(), Value::Object(special));

    // data[type][tenant][locale] = rows in export order, starting from the stored shape so
    // collections, tenants and locales that have no entries are still there
    let mut data: Map<String, Value> = match doc.remove(SHAPE_KEY) {
        Some(Value::Object(m)) => m,
        _ => Map::new(),
    };
    let mut st = conn.prepare("SELECT type, tenant, locale, data FROM entries ORDER BY type, tenant, locale, seq").map_err(e)?;
    for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))).map_err(e)? {
        let (plural, tenant, locale, s) = r.map_err(e)?;
        let by_tenant = data.entry(plural).or_insert_with(|| Value::Object(Map::new()));
        let by_locale = by_tenant.as_object_mut().unwrap().entry(tenant).or_insert_with(|| Value::Object(Map::new()));
        let rows = by_locale.as_object_mut().unwrap().entry(locale).or_insert_with(|| Value::Array(Vec::new()));
        rows.as_array_mut().unwrap().push(parse(s)?);
    }
    doc.insert("data".into(), Value::Object(data));
    Ok(Value::Object(doc))
}

/// Create a fresh database file from a snapshot document (replaces any file at `path`).
pub fn import(doc: &Value, path: &str) -> Result<usize, String> {
    let _ = std::fs::remove_file(path);
    if let Some(dir) = std::path::Path::new(path).parent() { if !dir.as_os_str().is_empty() { std::fs::create_dir_all(dir).map_err(e)?; } }
    let mut conn = Connection::open(path).map_err(e)?;
    write_doc(&mut conn, doc)
}

/// Load the snapshot document from a database file.
pub fn load(path: &str) -> Result<Value, String> {
    if !std::path::Path::new(path).exists() { return Err(format!("store: no database at {path}; run `import` first")); }
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
    read_doc(&conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn doc() -> Value {
        json!({
            "format": 1, "defaultTenant": "dga", "tenants": ["dga", "hub"], "exportedAt": "2026-11-23T00:00:00Z", "source": "test",
            "schema": {"types": {"pages": {"attrs": {"cover": {"type": "media"}}}}, "components": {"block.hero": {"attrs": {}}}},
            "special": {"tenants/keys": {"data": [{"key": "dga"}]}, "tenants/resolve": {"dga": {"data": {"key": "dga"}}}},
            "data": {
                "pages": {"hub": {"th": [
                    {"id": 1, "documentId": "a", "slug": "home", "title": "บ้าน", "z": 1, "a": 2},
                    {"id": 2, "documentId": "b", "slug": "about"}
                ], "en": [{"id": 3, "documentId": "a", "slug": "home", "title": "Home"}]}},
                "faqs": {"dga": {"th": [{"id": 9, "documentId": "q", "question": "?"}]}},
                "datasets": {"dga": {"th": [], "en": []}},
                "galleries": {}
            }
        })
    }

    #[test]
    fn round_trip_keeps_the_document_and_the_key_order() {
        let mut conn = Connection::open_in_memory().unwrap();
        let n = write_doc(&mut conn, &doc()).unwrap();
        assert_eq!(n, 4);
        let back = read_doc(&conn).unwrap();
        assert_eq!(back, doc());
        // an entry's own key order is what makes builds byte-identical
        assert_eq!(
            serde_json::to_string(&back["data"]["pages"]["hub"]["th"][0]).unwrap(),
            serde_json::to_string(&doc()["data"]["pages"]["hub"]["th"][0]).unwrap()
        );
    }

    #[test]
    fn empty_collections_survive_the_round_trip() {
        // the read API answers 200 with an empty list for these, never 404
        let mut conn = Connection::open_in_memory().unwrap();
        write_doc(&mut conn, &doc()).unwrap();
        let back = read_doc(&conn).unwrap();
        assert_eq!(back["data"]["datasets"], json!({"dga": {"th": [], "en": []}}));
        assert_eq!(back["data"]["galleries"], json!({}));
        assert!(back.get(SHAPE_KEY).is_none(), "the shape row is not a document key");
    }

    #[test]
    fn entries_keep_export_order() {
        let mut conn = Connection::open_in_memory().unwrap();
        write_doc(&mut conn, &doc()).unwrap();
        let back = read_doc(&conn).unwrap();
        let slugs: Vec<&str> = back["data"]["pages"]["hub"]["th"].as_array().unwrap().iter().map(|r| r["slug"].as_str().unwrap()).collect();
        assert_eq!(slugs, ["home", "about"]);
    }

    #[test]
    fn a_database_from_another_version_is_refused() {
        let mut conn = Connection::open_in_memory().unwrap();
        write_doc(&mut conn, &doc()).unwrap();
        conn.execute_batch("PRAGMA user_version = 99;").unwrap();
        assert!(read_doc(&conn).unwrap_err().contains("unsupported database version 99"));
    }

    #[test]
    fn import_then_load_through_a_file() {
        let path = std::env::temp_dir().join(format!("webx-store-test-{}.db", std::process::id()));
        let p = path.to_str().unwrap();
        assert_eq!(import(&doc(), p).unwrap(), 4);
        assert_eq!(load(p).unwrap(), doc());
        assert_eq!(import(&doc(), p).unwrap(), 4, "importing again replaces the database");
        let _ = std::fs::remove_file(&path);
    }
}
