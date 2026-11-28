//! The form inboxes (docs/target-architecture.md, track C5, decisions D6 and D12): complaints, job applications,
//! registrations and contact messages, for every workspace whatever its engine. A port of the four Strapi types
//! (strapi-cms/src/api/{complaint,application,registration,contact-message}): what a visitor may send, the reference
//! number or username the server makes, and the fields it forces (a visitor cannot set a complaint's stage, register as
//! already verified, or mark a message handled). Personal data is encrypted at rest (pii.rs); the rows live in the records
//! store (records.rs) under the collections named here.
use crate::pii::{self, Pii};
use crate::records;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

pub const COLLECTIONS: [&str; 4] = ["complaint", "application", "registration", "contact-message"];

pub fn is_form(collection: &str) -> bool {
    COLLECTIONS.contains(&collection)
}

#[derive(Clone, Copy)]
enum Kind {
    /// text, cut at this many characters
    Text(usize),
    Email,
    Bool,
    /// an object, at most this many bytes of JSON
    Json(usize),
}

use Kind::*;

/// What a visitor may send, per collection: the field, its kind, whether it is required.
fn spec(collection: &str) -> &'static [(&'static str, Kind, bool)] {
    match collection {
        "complaint" => &[("type", Text(200), false), ("subject", Text(300), false), ("agency", Text(200), false), ("detail", Text(10_000), false), ("anonymous", Bool, false), ("name", Text(200), false), ("email", Email, false), ("phone", Text(50), false), ("date", Text(32), false)],
        "application" => &[("jobId", Text(100), false), ("position", Text(200), false), ("name", Text(200), false), ("email", Email, false), ("phone", Text(50), false), ("note", Text(5_000), false), ("date", Text(32), false), ("extra", Json(4_096), false)],
        "registration" => &[("username", Text(100), false), ("utype", Text(100), false), ("email", Email, false), ("firstname", Text(200), false), ("lastname", Text(200), false), ("nidMasked", Text(20), false), ("phone", Text(50), false), ("extra", Json(4_096), false)],
        "contact-message" => &[("name", Text(200), true), ("email", Email, false), ("phone", Text(50), false), ("subject", Text(300), false), ("message", Text(10_000), true)],
        _ => &[],
    }
}

pub(crate) fn email_ok(s: &str) -> bool {
    let Some((local, domain)) = s.split_once('@') else { return false };
    s.len() <= 254 && !s.chars().any(char::is_whitespace) && !local.is_empty() && !domain.contains('@') && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

/// A visitor's submission as the document to store: only the fields the form has, cut at their limits, with the fields the
/// server owns set here. `body` is `{data: {...}}` or the fields bare. An empty email is allowed (it is optional); a malformed
/// one, a field of the wrong type, or a missing required field is refused.
pub fn clean(collection: &str, body: &Value) -> Result<Map<String, Value>, String> {
    let d = body.get("data").unwrap_or(body);
    let Some(d) = d.as_object() else { return Err("data must be an object".into()) };
    let mut out = Map::new();
    for (field, kind, required) in spec(collection) {
        let v = d.get(*field).filter(|v| !v.is_null());
        match (kind, v) {
            (_, None) => {}
            (Text(max), Some(Value::String(s))) => {
                out.insert((*field).into(), json!(s.chars().take(*max).collect::<String>()));
            }
            (Email, Some(Value::String(s))) => {
                let s = s.trim();
                if !s.is_empty() && !email_ok(s) {
                    return Err(format!("{field} is not an e-mail address"));
                }
                out.insert((*field).into(), json!(s));
            }
            (Bool, Some(Value::Bool(b))) => {
                out.insert((*field).into(), json!(b));
            }
            // a form field posted as text arrives as "true"/"false"
            (Bool, Some(Value::String(s))) if s == "true" || s == "false" => {
                out.insert((*field).into(), json!(s == "true"));
            }
            (Json(max), Some(o @ Value::Object(_))) if o.to_string().len() <= *max => {
                out.insert((*field).into(), o.clone());
            }
            (Json(max), Some(_)) => return Err(format!("{field} must be an object of at most {max} bytes")),
            (Bool, Some(_)) => return Err(format!("{field} must be true or false")),
            (_, Some(_)) => return Err(format!("{field} must be text")),
        }
        if *required && out.get(*field).and_then(Value::as_str).map_or(true, |s| s.trim().is_empty()) {
            return Err(format!("{field} is required"));
        }
    }
    // a complaint that is anonymous carries no one's details, whatever was sent
    if collection == "complaint" && out.get("anonymous") == Some(&json!(true)) {
        for f in ["name", "email", "phone"] {
            out.insert(f.into(), json!(""));
        }
    }
    // what the server owns, whatever a visitor sent
    match collection {
        "complaint" | "application" => {
            out.insert("stage".into(), json!(0));
        }
        "registration" => {
            out.insert("verified".into(), json!(false));
        }
        "contact-message" => {
            out.insert("handled".into(), json!(false));
        }
        _ => {}
    }
    Ok(out)
}

/// The kind a collection's reference numbers name (the CMP of `DGA-CMP-2569-123456`), or None when it has none. The part
/// before it is the workspace's own prefix (form_settings.rs: DGA unless it has one, ORST or RS for a WordPress tenant).
fn ref_kind(collection: &str) -> Option<&'static str> {
    match collection {
        "complaint" => Some("CMP"),
        "application" => Some("JOB"),
        _ => None,
    }
}

fn random_below(n: u32) -> u32 {
    // rejection sampling over a u32, so no value is likelier than another
    let limit = u32::MAX - (u32::MAX % n);
    loop {
        let mut b = [0u8; 4];
        getrandom::getrandom(&mut b).expect("random bytes");
        let x = u32::from_le_bytes(b);
        if x < limit {
            return x % n;
        }
    }
}

/// `DGA-CMP-<Buddhist year>-<6 digits>`, as Strapi makes them (`prefix` is `DGA-CMP` there; `ORST-CMP` for a workspace whose
/// own prefix is ORST).
pub fn gen_ref(prefix: &str, year_be: i64) -> String {
    format!("{prefix}-{year_be}-{}", 100_000 + random_below(899_999))
}

/// A username from the e-mail's local part (letters, digits, dots, dashes, underscores; 16 characters at most) and 4 digits.
pub fn gen_username(email: &str) -> String {
    let local: String = email.split('@').next().unwrap_or("").chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')).take(16).collect();
    format!("{}{}", if local.is_empty() { "user" } else { &local }, 1000 + random_below(9000))
}

/// The Buddhist-era year of an ISO time (`2026-11-25T...` -> 2569).
pub fn year_be(iso: &str) -> i64 {
    iso.get(0..4).and_then(|y| y.parse::<i64>().ok()).unwrap_or(1970) + 543
}

/// Store a form row: the server's defaults (a reference number, a starting stage, a username), the personal data
/// encrypted, and a retry with a new reference when the random one is taken. Returns the stored row, still encrypted.
pub fn create(conn: &Connection, p: &Pii, collection: &str, mut doc: Map<String, Value>, now_iso: &str) -> Result<Value, String> {
    if !doc.contains_key("stage") && ref_kind(collection).is_some() {
        doc.insert("stage".into(), json!(0));
    }
    if collection == "registration" && doc.get("username").and_then(Value::as_str).map_or(true, str::is_empty) {
        let name = gen_username(doc.get("email").and_then(Value::as_str).unwrap_or(""));
        doc.insert("username".into(), json!(name));
    }
    // a password never reaches the database, whoever sent it
    doc.remove("password");
    doc.remove("password2");
    // the workspace's own prefix (form_settings.rs), then the kind: ORST-CMP-2569-123456
    let generate = ref_kind(collection).filter(|_| doc.get("ref").and_then(Value::as_str).map_or(true, str::is_empty)).map(|kind| {
        let workspace = doc.get("tenantKey").and_then(Value::as_str).unwrap_or("");
        format!("{}-{kind}", crate::form_settings::ref_prefix(conn, workspace))
    });
    let mut last = String::new();
    for _ in 0..8 {
        let mut row = doc.clone();
        if let Some(prefix) = &generate {
            row.insert("ref".into(), json!(gen_ref(prefix, year_be(now_iso))));
        }
        pii::seal(p, collection, &mut row, false)?;
        match records::create(conn, collection, &Value::Object(row), now_iso) {
            Ok(stored) => return Ok(stored),
            Err(m) if generate.is_some() && m.contains("UNIQUE") => last = m,
            Err(m) => return Err(m),
        }
    }
    Err(format!("no free reference number after 8 tries: {last}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    const NOW: &str = "2026-11-25T10:00:00.000Z";

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(records::DDL).unwrap();
        c
    }

    #[test]
    fn a_complaint_keeps_its_fields_cut_at_their_limits_and_drops_the_rest() {
        let long = "x".repeat(20_000);
        let d = clean("complaint", &json!({"data": {"type": "ทุจริต", "subject": "s", "detail": long, "name": "N", "email": " a@b.co ", "phone": "081", "date": "25/11/2569", "stage": 3, "steps": [1], "ref": "FORGED", "tenantKey": "dga", "extra": 1}})).unwrap();
        assert_eq!(d["detail"].as_str().unwrap().chars().count(), 10_000);
        assert_eq!(d["email"], "a@b.co", "an e-mail address is trimmed");
        assert_eq!((d["stage"].as_i64(), d.get("steps"), d.get("ref"), d.get("tenantKey"), d.get("extra")), (Some(0), None, None, None, None), "the stage is the server's, and a visitor's own ref, steps and workspace are not taken");
        assert_eq!(d["type"], "ทุจริต");
        assert!(clean("complaint", &json!({"subject": "bare fields too"})).is_ok());
    }

    #[test]
    fn an_anonymous_complaint_carries_no_details() {
        for flag in [json!(true), json!("true")] {
            let d = clean("complaint", &json!({"data": {"anonymous": flag, "name": "N", "email": "a@b.co", "phone": "1", "subject": "s"}})).unwrap();
            assert_eq!((d["name"].as_str(), d["email"].as_str(), d["phone"].as_str(), d["anonymous"].as_bool()), (Some(""), Some(""), Some(""), Some(true)));
        }
        let d = clean("complaint", &json!({"data": {"anonymous": false, "name": "N"}})).unwrap();
        assert_eq!(d["name"], "N");
    }

    #[test]
    fn the_server_owns_stage_verified_and_handled() {
        assert_eq!(clean("registration", &json!({"data": {"verified": true, "username": "u"}})).unwrap()["verified"], false, "a visitor cannot register as already verified");
        assert_eq!(clean("contact-message", &json!({"data": {"name": "N", "message": "m", "handled": true}})).unwrap()["handled"], false);
        assert_eq!(clean("application", &json!({"data": {"stage": 9}})).unwrap()["stage"], 0);
    }

    #[test]
    fn a_contact_message_needs_a_name_and_a_message() {
        assert!(clean("contact-message", &json!({"data": {"name": "N", "message": "m"}})).is_ok());
        assert_eq!(clean("contact-message", &json!({"data": {"name": "N"}})).unwrap_err(), "message is required");
        assert_eq!(clean("contact-message", &json!({"data": {"name": "  ", "message": "m"}})).unwrap_err(), "name is required");
    }

    #[test]
    fn bad_types_and_addresses_are_refused() {
        assert_eq!(clean("complaint", &json!({"data": {"subject": 5}})).unwrap_err(), "subject must be text");
        assert_eq!(clean("complaint", &json!({"data": {"anonymous": "yes"}})).unwrap_err(), "anonymous must be true or false");
        assert_eq!(clean("application", &json!({"data": {"extra": "x"}})).unwrap_err(), "extra must be an object of at most 4096 bytes");
        assert!(clean("application", &json!({"data": {"extra": {"k": "y".repeat(5000)}}})).is_err());
        assert!(clean("application", &json!({"data": {"extra": {"k": "v"}}})).is_ok());
        for bad in ["nobody", "a@b", "@b.co", "a@@b.co", "a b@c.co", "a@.co", "a@b."] {
            assert!(clean("complaint", &json!({"data": {"email": bad}})).is_err(), "{bad}");
        }
        assert!(clean("complaint", &json!({"data": {"email": ""}})).is_ok(), "an empty e-mail is allowed: it is optional");
        assert!(clean("complaint", &json!("nope")).is_err());
    }

    #[test]
    fn references_and_usernames_have_strapis_shape() {
        let r = gen_ref("DGA-CMP", 2569);
        assert!(regex_like(&r, "DGA-CMP-2569-", 6), "{r}");
        let u = gen_username("somchai.j@example.com");
        assert!(u.starts_with("somchai.j") && u.len() == "somchai.j".len() + 4 && u[u.len() - 4..].parse::<u32>().is_ok(), "{u}");
        assert!(gen_username("").starts_with("user"));
        assert!(gen_username("ชื่อไทย@x.th").starts_with("user"), "letters outside ASCII are left out");
        assert_eq!(gen_username("averyveryveryverylongname@x.th").len(), 16 + 4);
        assert_eq!(year_be("2026-11-25T10:00:00.000Z"), 2569);
        let digits: Vec<u32> = (0..200).map(|_| gen_ref("X", 1).rsplit('-').next().unwrap().parse().unwrap()).collect();
        assert!(digits.iter().all(|n| (100_000..=999_998).contains(n)));
    }

    fn regex_like(s: &str, prefix: &str, digits: usize) -> bool {
        s.strip_prefix(prefix).is_some_and(|rest| rest.len() == digits && rest.bytes().all(|b| b.is_ascii_digit()))
    }

    #[test]
    fn a_workspace_with_its_own_prefix_gets_its_own_reference_numbers() {
        // decision D6: a WordPress tenant keeps the prefix WordPress gave it (form_settings.rs); the others keep DGA
        let c = db();
        c.execute_batch(crate::form_settings::DDL).unwrap();
        crate::form_settings::put(&c, "royalsociety", &json!({"refPrefix": "RS"}), NOW).unwrap();
        let p = Pii::from_base64(KEY).unwrap();
        let stored = |collection: &str, workspace: &str| {
            let mut doc = clean(collection, &json!({"subject": "s", "position": "p", "name": "N"})).unwrap();
            doc.insert("tenantKey".into(), json!(workspace));
            create(&c, &p, collection, doc, NOW).unwrap()["ref"].as_str().unwrap().to_string()
        };
        assert!(regex_like(&stored("complaint", "royalsociety"), "RS-CMP-2569-", 6));
        assert!(regex_like(&stored("application", "royalsociety"), "RS-JOB-2569-", 6));
        assert!(regex_like(&stored("complaint", "pea"), "DGA-CMP-2569-", 6), "no prefix of its own: Strapi's");
    }

    #[test]
    fn the_four_inboxes_are_forms_and_nothing_else_is() {
        for c in COLLECTIONS {
            assert!(is_form(c) && !pii::fields_of(c).is_empty(), "{c}");
        }
        assert!(!is_form("consent-log") && !is_form("page-template"));
    }

    #[test]
    fn a_stored_complaint_has_a_reference_a_stage_and_encrypted_details_and_a_taken_reference_is_retried() {
        let c = db();
        let p = Pii::from_base64(KEY).unwrap();
        let mut doc = clean("complaint", &json!({"data": {"subject": "s", "name": "สมชาย", "email": "a@b.co"}})).unwrap();
        doc.insert("tenantKey".into(), json!("pea"));
        let row = create(&c, &p, "complaint", doc.clone(), NOW).unwrap();
        let reference = row["ref"].as_str().unwrap();
        assert!(reference.starts_with("DGA-CMP-2569-"));
        assert!(pii::looks_encrypted(row["name"].as_str().unwrap()) && pii::looks_encrypted(row["email"].as_str().unwrap()), "stored encrypted");
        assert_eq!((row["stage"].as_i64(), row["tenantKey"].as_str(), row["subject"].as_str()), (Some(0), Some("pea"), Some("s")));
        let mut shown = row.clone();
        pii::open(&p, "complaint", &mut shown).unwrap();
        assert_eq!((shown["name"].as_str(), shown["email"].as_str()), (Some("สมชาย"), Some("a@b.co")));
        // a different reference each time, and the unique index means a taken one cannot be stored twice
        let other = create(&c, &p, "complaint", doc.clone(), NOW).unwrap();
        assert_ne!(other["ref"], row["ref"]);
        let mut same = doc.clone();
        same.insert("ref".into(), json!(reference));
        let err = create(&c, &p, "complaint", same, NOW).unwrap_err();
        assert!(err.contains("UNIQUE"), "a reference given by the caller is not silently replaced: {err}");
    }

    #[test]
    fn a_registration_gets_a_username_and_never_keeps_a_password() {
        let c = db();
        let p = Pii::from_base64(KEY).unwrap();
        let mut doc = clean("registration", &json!({"data": {"email": "nok@example.com", "firstname": "นก", "lastname": "ใจดี"}})).unwrap();
        doc.insert("password".into(), json!("hunter2"));
        doc.insert("tenantKey".into(), json!("dga"));
        let row = create(&c, &p, "registration", doc, NOW).unwrap();
        assert!(row["username"].as_str().unwrap().starts_with("nok"));
        assert!(row.get("password").is_none());
        assert_eq!(row["verified"], false);
        assert!(pii::looks_encrypted(row["firstname"].as_str().unwrap()) && pii::looks_encrypted(row["lastname"].as_str().unwrap()));
        assert!(row.get("ref").is_none(), "a registration has no reference number");
    }
}
