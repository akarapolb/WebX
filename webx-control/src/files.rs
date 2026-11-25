//! Files a visitor attaches to a complaint or an application (docs/target-architecture.md, track C5, decision D14: where they
//! live). A port of what Strapi's upload plugin did for the two `submit` routes, with the checks Strapi did not make: a
//! public upload takes only documents and images, whose content must match their extension, and is never served inline.
//!
//! The file is kept in the control plane's own database, **encrypted at rest** with the same key as the form fields
//! (`iv || ciphertext || tag`), because a whistleblower's attachment is personal data too. Studio fetches it through the
//! internal API; nothing here is public.
use crate::pii::Pii;
use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  tenant_key TEXT,
  collection TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
";

/// The size a visitor may upload (Strapi's check was the same 5 MB).
pub const MAX_PUBLIC: usize = 5 * 1024 * 1024;
const MAX_NAME: usize = 120;

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

/// A file name that is safe to keep and to put in a header: no directory part, no control characters or quotes, at most 120
/// characters with its extension kept.
pub fn clean_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let s: String = base.chars().filter(|c| !c.is_control() && !matches!(c, '"' | '\\' | ';' | '<' | '>' | '|' | '*' | '?' | ':')).collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let s = s.trim_matches('.').trim().to_string();
    if s.is_empty() {
        return "file".into();
    }
    if s.chars().count() <= MAX_NAME {
        return s;
    }
    let ext = s.rsplit_once('.').map(|(_, x)| x).filter(|x| x.len() <= 8).map(|x| format!(".{x}")).unwrap_or_default();
    let stem: String = s.chars().take(MAX_NAME - ext.chars().count()).collect();
    format!("{stem}{ext}")
}

/// A Content-Disposition for a download: always an attachment (never shown inline), with the name as an ASCII fallback and,
/// percent-encoded, as UTF-8 (RFC 5987) so a Thai file name survives.
pub fn disposition(name: &str) -> String {
    let ascii: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') { c } else { '_' }).collect();
    let mut enc = String::new();
    for b in name.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_') {
            enc.push(b as char);
        } else {
            enc.push_str(&format!("%{b:02X}"));
        }
    }
    format!("attachment; filename=\"{ascii}\"; filename*=UTF-8''{enc}")
}

/// The type a public upload may have, by extension: documents and images, nothing that a browser or an office suite would run.
pub fn mime_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "odt" => "application/vnd.oasis.opendocument.text",
        "ods" => "application/vnd.oasis.opendocument.spreadsheet",
        "odp" => "application/vnd.oasis.opendocument.presentation",
        "rtf" => "application/rtf",
        "txt" => "text/plain; charset=utf-8",
        "csv" => "text/csv; charset=utf-8",
        _ => return None,
    })
}

/// Whether the first bytes are what the extension says (a renamed program is not a PDF).
fn sniff_ok(ext: &str, b: &[u8]) -> bool {
    match ext {
        "pdf" => b.starts_with(b"%PDF-"),
        "png" => b.starts_with(&[0x89, b'P', b'N', b'G']),
        "jpg" | "jpeg" => b.starts_with(&[0xFF, 0xD8, 0xFF]),
        "gif" => b.starts_with(b"GIF8"),
        "webp" => b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP",
        "docx" | "xlsx" | "pptx" | "odt" | "ods" | "odp" => b.starts_with(b"PK"),
        "doc" | "xls" | "ppt" => b.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]),
        "rtf" => b.starts_with(b"{\\rtf"),
        "txt" | "csv" => !b.iter().take(8192).any(|&x| x == 0),
        _ => false,
    }
}

/// What a public upload must be: not empty, at most 5 MB, a document or an image whose content matches its extension.
/// Returns the clean name and the type to serve it as (the client's own claim is never used).
pub fn validate(raw_name: &str, bytes: &[u8]) -> Result<(String, &'static str), String> {
    if bytes.is_empty() {
        return Err("ไฟล์ว่างเปล่า".into());
    }
    if bytes.len() > MAX_PUBLIC {
        return Err("ไฟล์เกิน 5MB".into());
    }
    let name = clean_name(raw_name);
    let ext = name.rsplit_once('.').map(|(_, x)| x.to_lowercase()).unwrap_or_default();
    let Some(mime) = mime_for(&ext) else { return Err("ประเภทไฟล์ไม่รองรับ (รับเฉพาะ PDF รูปภาพ และเอกสาร Office/ข้อความ)".into()) };
    if !sniff_ok(&ext, bytes) {
        return Err("เนื้อไฟล์ไม่ตรงกับนามสกุลไฟล์".into());
    }
    Ok((name, mime))
}

/// Keep a file (encrypted). Returns what a record keeps of it: `{documentId, name, mime, size}`.
pub fn store(conn: &Connection, p: &Pii, tenant_key: &str, collection: &str, name: &str, mime: &str, bytes: &[u8], now: &str) -> Result<Value, String> {
    let doc = crate::records::new_document_id();
    let sealed = p.encrypt_bytes(bytes)?;
    conn.execute(
        "INSERT INTO files(document_id, tenant_key, collection, name, mime, size, sha256, data, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![doc, tenant_key, collection, name, mime, bytes.len() as i64, hex(&Sha256::digest(bytes)), sealed, now],
    )
    .map_err(e)?;
    Ok(json!({"documentId": doc, "name": name, "mime": mime, "size": bytes.len()}))
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub struct Stored {
    pub name: String,
    pub mime: String,
    pub tenant_key: Option<String>,
    /// the form it was attached to (complaint, application), so a reader can be checked against that form's permissions
    pub collection: Option<String>,
    pub bytes: Vec<u8>,
}

/// A file, decrypted.
pub fn load(conn: &Connection, p: &Pii, document_id: &str) -> Result<Option<Stored>, String> {
    let mut st = conn.prepare("SELECT name, mime, tenant_key, collection, data FROM files WHERE document_id = ?1").map_err(e)?;
    let mut rows = st.query_map([document_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Vec<u8>>(4)?))).map_err(e)?;
    match rows.next().transpose().map_err(e)? {
        Some((name, mime, tenant_key, collection, data)) => Ok(Some(Stored { name, mime, tenant_key, collection, bytes: p.decrypt_bytes(&data)? })),
        None => Ok(None),
    }
}

pub fn remove(conn: &Connection, document_id: &str) -> Result<bool, String> {
    Ok(conn.execute("DELETE FROM files WHERE document_id = ?1", [document_id]).map_err(e)? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    const NOW: &str = "2026-11-25T10:00:00.000Z";
    const PDF: &[u8] = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n";

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }

    #[test]
    fn names_lose_their_directory_and_anything_unsafe_but_keep_thai_and_the_extension() {
        assert_eq!(clean_name("C:\\Users\\x\\หลักฐาน 1.pdf"), "หลักฐาน 1.pdf");
        assert_eq!(clean_name("../../etc/passwd"), "passwd");
        assert_eq!(clean_name("a\"b;c<d>e|f*g?h:i.pdf"), "abcdefghi.pdf");
        assert_eq!(clean_name("  many   spaces .pdf "), "many spaces .pdf");
        assert_eq!(clean_name("...."), "file");
        assert_eq!(clean_name(""), "file");
        assert_eq!(clean_name("evil\r\nX-Header: 1.pdf"), "evilX-Header 1.pdf", "no header injection through a name");
        let long = format!("{}.pdf", "ก".repeat(300));
        let n = clean_name(&long);
        assert!(n.chars().count() <= 120 && n.ends_with(".pdf"), "{n}");
    }

    #[test]
    fn only_documents_and_images_whose_content_matches_are_taken() {
        assert_eq!(validate("หลักฐาน.PDF", PDF).unwrap(), ("หลักฐาน.PDF".to_string(), "application/pdf"));
        assert!(validate("a.png", &[0x89, b'P', b'N', b'G', 0, 0]).is_ok());
        assert!(validate("a.jpg", &[0xFF, 0xD8, 0xFF, 0xE0]).is_ok());
        assert!(validate("a.docx", b"PK\x03\x04rest").is_ok());
        assert!(validate("a.txt", "ข้อความไทย\n".as_bytes()).is_ok());
        assert!(validate("a.txt", b"binary\0data").unwrap_err().contains("ไม่ตรง"), "a text file with a NUL is not text");
        assert!(validate("virus.exe", b"MZ\x90\x00").unwrap_err().contains("ไม่รองรับ"));
        assert!(validate("page.html", b"<script>alert(1)</script>").is_err());
        assert!(validate("image.svg", b"<svg onload=alert(1)>").is_err());
        assert!(validate("noextension", PDF).is_err());
        assert!(validate("renamed.pdf", b"MZ\x90\x00 this is a program").unwrap_err().contains("ไม่ตรง"), "a program renamed .pdf");
        assert!(validate("a.pdf", b"").unwrap_err().contains("ว่าง"));
        assert!(validate("a.pdf", &vec![b'%'; MAX_PUBLIC + 1]).unwrap_err().contains("5MB"));
    }

    #[test]
    fn a_file_is_kept_encrypted_and_comes_back_whole() {
        let c = db();
        let p = Pii::from_base64(KEY).unwrap();
        let meta = store(&c, &p, "pea", "complaint", "หลักฐาน.pdf", "application/pdf", PDF, NOW).unwrap();
        assert_eq!((meta["name"].as_str(), meta["mime"].as_str(), meta["size"].as_u64()), (Some("หลักฐาน.pdf"), Some("application/pdf"), Some(PDF.len() as u64)));
        let raw: Vec<u8> = c.query_row("SELECT data FROM files", [], |r| r.get(0)).unwrap();
        assert!(!raw.windows(5).any(|w| w == b"%PDF-"), "the content is not in the database in the clear");
        assert_eq!(raw.len(), 12 + PDF.len() + 16, "iv, ciphertext, tag");
        let got = load(&c, &p, meta["documentId"].as_str().unwrap()).unwrap().unwrap();
        assert_eq!((got.bytes.as_slice(), got.name.as_str(), got.tenant_key.as_deref(), got.collection.as_deref()), (PDF, "หลักฐาน.pdf", Some("pea"), Some("complaint")));
        let other = Pii::from_base64(&base64_of(&[9u8; 32])).unwrap();
        assert!(load(&c, &other, meta["documentId"].as_str().unwrap()).is_err(), "another key cannot read it");
        assert!(load(&c, &p, "nope").unwrap().is_none());
        assert!(remove(&c, meta["documentId"].as_str().unwrap()).unwrap());
        assert!(!remove(&c, meta["documentId"].as_str().unwrap()).unwrap());
    }

    #[test]
    fn a_download_is_always_an_attachment_with_a_name_that_survives_thai() {
        let d = disposition("หลักฐาน 1.pdf");
        assert!(d.starts_with("attachment; filename=\"") && d.contains("filename*=UTF-8''%E0%B8%AB"), "{d}");
        assert!(d.contains(" 1.pdf") && !d.contains('\n') && !d.contains('\r'));
        assert_eq!(disposition("a.pdf"), "attachment; filename=\"a.pdf\"; filename*=UTF-8''a.pdf");
    }

    fn base64_of(b: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(b)
    }
}
