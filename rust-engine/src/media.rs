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
  caption TEXT, alt TEXT, tags TEXT, created_at TEXT NOT NULL,
  width INTEGER, height INTEGER
);
CREATE INDEX IF NOT EXISTS media_tenant ON media(tenant, id);
";

/// Creates the table, and adds width/height to a table made before they existed.
pub fn ensure(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(DDL).map_err(e)?;
    let mut st = conn.prepare("PRAGMA table_info(media)").map_err(e)?;
    let cols: Vec<String> = st.query_map([], |r| r.get::<_, String>(1)).map_err(e)?.filter_map(Result::ok).collect();
    drop(st);
    for c in ["width", "height"] {
        if !cols.iter().any(|x| x == c) {
            conn.execute_batch(&format!("ALTER TABLE media ADD COLUMN {c} INTEGER;")).map_err(e)?;
        }
    }
    Ok(())
}

/// Width and height in pixels, read from the header of a PNG, GIF, JPEG or
/// WebP file; None for anything else (or a damaged header).
pub fn dimensions(b: &[u8]) -> Option<(u32, u32)> {
    let be32 = |i: usize| b.get(i..i + 4).map(|x| u32::from_be_bytes([x[0], x[1], x[2], x[3]]));
    let le16 = |i: usize| b.get(i..i + 2).map(|x| u16::from_le_bytes([x[0], x[1]]) as u32);
    let le24 = |i: usize| b.get(i..i + 3).map(|x| x[0] as u32 | (x[1] as u32) << 8 | (x[2] as u32) << 16);
    let dims = |w: u32, h: u32| if w > 0 && h > 0 { Some((w, h)) } else { None };
    if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        return if b.get(12..16) == Some(b"IHDR") { dims(be32(16)?, be32(20)?) } else { None };
    }
    if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        return dims(le16(6)?, le16(8)?);
    }
    if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        return match b.get(12..16)? {
            b"VP8X" => dims(le24(24)? + 1, le24(27)? + 1),
            b"VP8L" => {
                if *b.get(20)? != 0x2f { return None; }
                let v = u32::from_le_bytes([*b.get(21)?, *b.get(22)?, *b.get(23)?, *b.get(24)?]);
                dims((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1)
            }
            b"VP8 " => {
                if b.get(23..26)? != [0x9d, 0x01, 0x2a] { return None; }
                dims(le16(26)? & 0x3fff, le16(28)? & 0x3fff)
            }
            _ => None,
        };
    }
    if b.starts_with(&[0xff, 0xd8]) {
        let mut i = 2;
        while i + 4 <= b.len() {
            if b[i] != 0xff { return None; }
            let m = b[i + 1];
            if m == 0xff { i += 1; continue; }
            if m == 0xd8 || m == 0x01 || (0xd0..=0xd7).contains(&m) { i += 2; continue; }
            let len = u16::from_be_bytes([b[i + 2], b[i + 3]]) as usize;
            // SOF0-SOF15 except DHT (c4), JPG (c8) and DAC (cc)
            if (0xc0..=0xcf).contains(&m) && ![0xc4, 0xc8, 0xcc].contains(&m) {
                let h = b.get(i + 5..i + 7)?;
                let w = b.get(i + 7..i + 9)?;
                return dims(u16::from_be_bytes([w[0], w[1]]) as u32, u16::from_be_bytes([h[0], h[1]]) as u32);
            }
            i += 2 + len;
        }
    }
    None
}

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
    pub width: Option<i64>,
    pub height: Option<i64>,
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
        "size": a.size, "width": a.width, "height": a.height, "caption": a.caption, "alt": a.alt, "tags": a.tags})
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Asset> {
    Ok(Asset { id: r.get(0)?, document_id: r.get(1)?, name: r.get(2)?, mime: r.get(3)?, file: r.get(4)?, size: r.get(5)?, caption: r.get(6)?, alt: r.get(7)?, tags: r.get(8)?, width: r.get(9)?, height: r.get(10)? })
}
const COLS: &str = "id, document_id, name, mime, file, size, caption, alt, tags, width, height";

#[allow(clippy::too_many_arguments)]
pub fn insert(conn: &Connection, tenant: &str, document_id: &str, name: &str, mime: &str, file: &str, size: i64, dims: Option<(u32, u32)>, now: &str) -> Result<Asset, String> {
    let (w, h) = dims.map_or((None, None), |(w, h)| (Some(w as i64), Some(h as i64)));
    conn.execute("INSERT INTO media(document_id, tenant, name, mime, file, size, created_at, width, height) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", params![document_id, tenant, name, mime, file, size, now, w, h]).map_err(e)?;
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
        ensure(&c).unwrap();
        c
    }
    fn add(c: &Connection, tenant: &str, id: &str, name: &str) -> Asset {
        insert(c, tenant, id, name, "image/png", &format!("{id}-{name}"), 3, None, "2026-01-01T00:00:00.000Z").unwrap()
    }

    #[test]
    fn dimensions_from_headers() {
        let png = [&b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"[..], &[0, 0, 1, 0, 0, 0, 0, 0x80]].concat();
        assert_eq!(dimensions(&png), Some((256, 128)));
        assert_eq!(dimensions(b"GIF89a\x20\x00\x10\x00"), Some((32, 16)));
        // JPEG: SOI, an APP0 segment, then SOF0 (height 20, width 30)
        let jpg = [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 3];
        assert_eq!(dimensions(&jpg), Some((30, 20)));
        // WebP: VP8X (canvas 100 x 50), VP8L (64 x 32), VP8 lossy (40 x 24)
        let mut x = b"RIFF\0\0\0\0WEBPVP8X\x0a\0\0\0\0\0\0\0".to_vec();
        x.extend([99, 0, 0, 49, 0, 0]);
        assert_eq!(dimensions(&x), Some((100, 50)));
        let v = 63u32 | (31 << 14);
        let mut l = b"RIFF\0\0\0\0WEBPVP8L\0\0\0\0\x2f".to_vec();
        l.extend(v.to_le_bytes());
        assert_eq!(dimensions(&l), Some((64, 32)));
        let mut p = b"RIFF\0\0\0\0WEBPVP8 \0\0\0\0\0\0\0".to_vec();
        p.extend([0x9d, 0x01, 0x2a, 40, 0, 24, 0]);
        assert_eq!(dimensions(&p), Some((40, 24)));
        assert_eq!(dimensions(b"not an image"), None);
        assert_eq!(dimensions(&png[..20]), None, "truncated");
        assert_eq!(dimensions(&[]), None);
    }

    #[test]
    fn dimensions_are_stored_and_returned() {
        let c = db();
        let a = insert(&c, "dga", "a1", "x.png", "image/png", "f", 3, Some((30, 20)), "2026-01-01T00:00:00.000Z").unwrap();
        let j = to_json("dga", &a);
        assert_eq!((j["width"].as_i64(), j["height"].as_i64()), (Some(30), Some(20)));
        assert!(to_json("dga", &add(&c, "dga", "a2", "y.pdf"))["width"].is_null());
    }

    #[test]
    fn an_old_table_without_dimensions_is_upgraded() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE media(id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL UNIQUE, tenant TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, file TEXT NOT NULL, size INTEGER NOT NULL, caption TEXT, alt TEXT, tags TEXT, created_at TEXT NOT NULL);
            INSERT INTO media(document_id, tenant, name, mime, file, size, created_at) VALUES ('o','dga','n','image/png','f',1,'t');").unwrap();
        ensure(&c).unwrap();
        ensure(&c).unwrap();
        assert!(get(&c, "dga", "o").unwrap().unwrap().width.is_none());
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
