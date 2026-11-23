//! R4: the media library of the write API (/write/_media). Files live in the
//! uploads folder under one folder per tenant, so the read side's /uploads
//! route serves them unchanged; their metadata (name, mime, caption, alt text,
//! tags) is in the store's `media` table. Every call is scoped to the tenant of
//! the bearer token; another tenant's asset is a 404.
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS media(
  id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL UNIQUE, tenant TEXT NOT NULL,
  name TEXT NOT NULL, mime TEXT NOT NULL, file TEXT NOT NULL, size INTEGER NOT NULL,
  caption TEXT, alt TEXT, tags TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS media_tenant ON media(tenant, id);
";

pub struct Asset {
    pub id: i64,
    pub document_id: String,
    pub name: String,
    pub mime: String,
    pub file: String,
    pub size: i64,
    pub caption: Option<String>,
    pub alt: Option<String>,
    pub tags: Option<String>,
}

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

/// Letters, digits, dot, dash and underscore only; no path can come out of it.
pub fn safe(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' }).collect();
    let s = s.trim_start_matches('.').to_string();
    if s.is_empty() { "file".into() } else { s.chars().take(100).collect() }
}

pub fn url_of(tenant: &str, file: &str) -> String {
    format!("/uploads/{}/{}", safe(tenant), file)
}

pub fn to_json(tenant: &str, a: &Asset) -> Value {
    let url = url_of(tenant, &a.file);
    json!({"id": a.id, "documentId": a.document_id, "url": url, "thumbnailUrl": url, "mime": a.mime, "name": a.name,
        "size": a.size, "caption": a.caption, "alt": a.alt, "tags": a.tags})
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Asset> {
    Ok(Asset { id: r.get(0)?, document_id: r.get(1)?, name: r.get(2)?, mime: r.get(3)?, file: r.get(4)?, size: r.get(5)?, caption: r.get(6)?, alt: r.get(7)?, tags: r.get(8)? })
}
const COLS: &str = "id, document_id, name, mime, file, size, caption, alt, tags";

pub fn insert(conn: &Connection, tenant: &str, document_id: &str, name: &str, mime: &str, file: &str, size: i64, now: &str) -> Result<Asset, String> {
    conn.execute("INSERT INTO media(document_id, tenant, name, mime, file, size, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", params![document_id, tenant, name, mime, file, size, now]).map_err(e)?;
    get(conn, tenant, document_id)?.ok_or_else(|| "media: row vanished".to_string())
}

pub fn get(conn: &Connection, tenant: &str, document_id: &str) -> Result<Option<Asset>, String> {
    conn.query_row(&format!("SELECT {COLS} FROM media WHERE tenant=?1 AND document_id=?2"), params![tenant, document_id], row).optional().map_err(e)
}

/// Newest first; `search` matches name, caption, alt text and tags (case-insensitive).
pub fn list(conn: &Connection, tenant: &str, search: Option<&str>, page: usize, size: usize) -> Result<(Vec<Asset>, usize), String> {
    let like = format!("%{}%", search.unwrap_or("").replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let filter = "tenant=?1 AND (?2='%%' OR name LIKE ?2 ESCAPE '\\' OR caption LIKE ?2 ESCAPE '\\' OR alt LIKE ?2 ESCAPE '\\' OR tags LIKE ?2 ESCAPE '\\')";
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM media WHERE {filter}"), params![tenant, like], |r| r.get(0)).map_err(e)?;
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM media WHERE {filter} ORDER BY id DESC LIMIT ?3 OFFSET ?4")).map_err(e)?;
    let rows = st.query_map(params![tenant, like, size as i64, ((page - 1) * size) as i64], row).map_err(e)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(e)?);
    }
    Ok((out, total as usize))
}

/// A key that is absent from `patch` is left alone; an explicit null clears it.
pub fn update(conn: &Connection, tenant: &str, document_id: &str, patch: &Value) -> Result<Option<Asset>, String> {
    if get(conn, tenant, document_id)?.is_none() {
        return Ok(None);
    }
    for (key, col) in [("caption", "caption"), ("alt", "alt"), ("tags", "tags")] {
        if let Some(v) = patch.get(key) {
            let val: Option<&str> = v.as_str();
            if !v.is_null() && val.is_none() {
                return Err(format!("{key} must be text or null"));
            }
            conn.execute(&format!("UPDATE media SET {col}=?1 WHERE tenant=?2 AND document_id=?3"), params![val, tenant, document_id]).map_err(e)?;
        }
    }
    get(conn, tenant, document_id)
}

/// Deletes the row and returns it (the caller removes the file).
pub fn remove(conn: &Connection, tenant: &str, document_id: &str) -> Result<Option<Asset>, String> {
    let a = get(conn, tenant, document_id)?;
    if a.is_some() {
        conn.execute("DELETE FROM media WHERE tenant=?1 AND document_id=?2", params![tenant, document_id]).map_err(e)?;
    }
    Ok(a)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }
    fn add(c: &Connection, tenant: &str, id: &str, name: &str) -> Asset {
        insert(c, tenant, id, name, "image/png", &format!("{id}-{name}"), 3, "2026-01-01T00:00:00.000Z").unwrap()
    }

    #[test]
    fn names_cannot_escape_the_folder() {
        assert_eq!(safe("../../etc/passwd"), "_.._etc_passwd");
        assert!(!safe("a/b\\c").contains('/') && !safe("a/b\\c").contains('\\'));
        assert_eq!(safe(""), "file");
        assert_eq!(safe("..."), "file");
        assert_eq!(safe("รูป ภาพ.png"), "_______.png");
    }

    #[test]
    fn list_is_per_tenant_newest_first_and_searchable() {
        let c = db();
        add(&c, "dga", "a1", "logo.png");
        add(&c, "dga", "a2", "banner.png");
        add(&c, "pea", "b1", "logo.png");
        let (rows, total) = list(&c, "dga", None, 1, 25).unwrap();
        assert_eq!((total, rows[0].document_id.as_str()), (2, "a2"));
        update(&c, "dga", "a1", &json!({"caption": "Our Logo", "tags": "brand"})).unwrap();
        assert_eq!(list(&c, "dga", Some("brand"), 1, 25).unwrap().1, 1);
        assert_eq!(list(&c, "dga", Some("our logo"), 1, 25).unwrap().1, 1);
        assert_eq!(list(&c, "dga", Some("100%"), 1, 25).unwrap().1, 0, "wildcards are literal");
        assert_eq!(list(&c, "dga", None, 2, 1).unwrap().0.len(), 1);
    }

    #[test]
    fn update_leaves_absent_keys_and_null_clears() {
        let c = db();
        add(&c, "dga", "a1", "x.png");
        update(&c, "dga", "a1", &json!({"caption": "c", "alt": "a"})).unwrap();
        let a = update(&c, "dga", "a1", &json!({"alt": null})).unwrap().unwrap();
        assert_eq!((a.caption.as_deref(), a.alt.as_deref()), (Some("c"), None));
        assert!(update(&c, "dga", "a1", &json!({"caption": 5})).is_err());
    }

    #[test]
    fn another_tenant_sees_nothing() {
        let c = db();
        add(&c, "dga", "a1", "x.png");
        assert!(get(&c, "pea", "a1").unwrap().is_none());
        assert!(update(&c, "pea", "a1", &json!({"caption": "x"})).unwrap().is_none());
        assert!(remove(&c, "pea", "a1").unwrap().is_none());
        assert!(get(&c, "dga", "a1").unwrap().is_some());
        assert_eq!(remove(&c, "dga", "a1").unwrap().unwrap().file, "a1-x.png");
        assert!(get(&c, "dga", "a1").unwrap().is_none());
    }
}
