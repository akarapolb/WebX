//! The mail the control plane owes (docs/target-architecture.md, track C5, decision D15): the acknowledgement a citizen gets
//! for a complaint, an application or a registration, and the notice staff get of a new complaint. A port of what the four
//! Strapi types sent from their lifecycles, with the same Thai texts.
//!
//! A mail is first written to an outbox, then sent by a loop in the background (mailer.rs), so a slow or absent mail server
//! never delays or fails a visitor's submission, and a mail that cannot be sent yet is retried with growing waits. The
//! recipient, subject and text are personal data, so they are **encrypted while they wait** and wiped once the mail is sent:
//! what stays is the kind, the workspace, and the times.
use crate::pii::Pii;
use rusqlite::{types::Value as Sql, Connection};
use serde_json::{json, Value};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS outbox(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  tenant_key TEXT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  next_try_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_ms INTEGER
);
CREATE INDEX IF NOT EXISTS outbox_due ON outbox(sent_ms, next_try_ms);
";

/// Tries before a mail is given up on (kept, encrypted, for an operator to see; purged after a week).
pub const MAX_ATTEMPTS: i64 = 8;
const GIVE_UP_KEPT_MS: i64 = 7 * 24 * 60 * 60 * 1000;

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

pub struct Mail {
    pub kind: &'static str,
    pub tenant_key: Option<String>,
    pub to: String,
    pub subject: String,
    pub text: String,
}

fn s<'a>(row: &'a Value, k: &str) -> &'a str {
    row.get(k).and_then(Value::as_str).unwrap_or("")
}
fn or_dash<'a>(v: &'a str) -> &'a str {
    if v.is_empty() {
        "-"
    } else {
        v
    }
}

/// The mails a new form row calls for, from the row as its reader sees it (personal data in the clear, with the `ref` or
/// `username` the server made). `staff` is where a complaint is reported to (WEBX_COMPLAINT_NOTIFY_EMAIL). The texts are
/// Strapi's, word for word.
pub fn notices(collection: &str, row: &Value, staff: Option<&str>) -> Vec<Mail> {
    let tenant = row.get("tenantKey").and_then(Value::as_str).map(str::to_string);
    let email = s(row, "email");
    let mut out = vec![];
    match collection {
        "complaint" => {
            let (reference, subject) = (s(row, "ref"), s(row, "subject"));
            let anonymous = row.get("anonymous").and_then(Value::as_bool).unwrap_or(false);
            if let Some(to) = staff.filter(|t| !t.is_empty()) {
                let reporter = if anonymous { "ไม่ประสงค์ออกนาม".to_string() } else { format!("{} / {}", or_dash(s(row, "name")), or_dash(email)) };
                out.push(Mail {
                    kind: "complaint-staff",
                    tenant_key: tenant.clone(),
                    to: to.to_string(),
                    subject: format!("[ร้องเรียนใหม่] {reference} — {subject}"),
                    text: format!("มีเรื่องร้องเรียน/แจ้งเบาะแสใหม่\nเลขอ้างอิง: {reference}\nประเภท: {}\nหัวข้อ: {}\nผู้แจ้ง: {reporter}", or_dash(s(row, "type")), or_dash(subject)),
                });
            }
            if !email.is_empty() && !anonymous {
                out.push(Mail {
                    kind: "complaint-ack",
                    tenant_key: tenant,
                    to: email.to_string(),
                    subject: format!("รับเรื่องร้องเรียนแล้ว ({reference})"),
                    text: format!("เราได้รับเรื่องร้องเรียนของท่านแล้ว\nหมายเลขอ้างอิง: {reference}\nหัวข้อ: {}\nติดตามสถานะได้ที่หน้า \"ติดตามเรื่องร้องเรียน\" ของเว็บไซต์", or_dash(subject)),
                });
            }
        }
        "application" if !email.is_empty() => out.push(Mail {
            kind: "application-ack",
            tenant_key: tenant,
            to: email.to_string(),
            subject: format!("รับใบสมัครงานแล้ว ({})", s(row, "ref")),
            text: format!("ขอบคุณที่สมัครงานกับ สพร.\nหมายเลขอ้างอิง: {}\nตำแหน่ง: {}\nตรวจสอบสถานะได้ที่หน้า \"ตรวจสอบสถานะใบสมัคร\" ของเว็บไซต์", s(row, "ref"), or_dash(s(row, "position"))),
        }),
        "registration" if !email.is_empty() => out.push(Mail {
            kind: "registration-welcome",
            tenant_key: tenant,
            to: email.to_string(),
            subject: format!("ลงทะเบียนผู้ใช้งานสำเร็จ ({})", s(row, "username")),
            text: format!("ยินดีต้อนรับสู่ระบบของ สพร.\nชื่อผู้ใช้: {}\nกรุณาเข้าสู่ระบบด้วยรหัสผ่านที่ท่านตั้งไว้", s(row, "username")),
        }),
        _ => {}
    }
    out
}

/// Queue a mail (its recipient, subject and text encrypted) to be sent as soon as the loop next runs.
pub fn enqueue(conn: &Connection, p: &Pii, m: &Mail, now_ms: i64) -> Result<String, String> {
    let doc = crate::records::new_document_id();
    conn.execute(
        "INSERT INTO outbox(document_id, kind, tenant_key, to_addr, subject, body, created_ms, next_try_ms) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        rusqlite::params![doc, m.kind, m.tenant_key, p.encrypt(&m.to)?, p.encrypt(&m.subject)?, p.encrypt(&m.text)?, now_ms],
    )
    .map_err(e)?;
    Ok(doc)
}

pub struct Pending {
    pub id: i64,
    pub to: String,
    pub subject: String,
    pub text: String,
    pub attempts: i64,
}

/// Mails that are due: not sent, not given up on, their wait over. At most `limit`, oldest first.
pub fn due(conn: &Connection, p: &Pii, now_ms: i64, limit: usize) -> Result<Vec<Pending>, String> {
    let mut st = conn
        .prepare("SELECT id, to_addr, subject, body, attempts FROM outbox WHERE sent_ms IS NULL AND attempts < ?1 AND next_try_ms <= ?2 ORDER BY next_try_ms, id LIMIT ?3")
        .map_err(e)?;
    let rows = st
        .query_map(rusqlite::params![MAX_ATTEMPTS, now_ms, limit as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?)))
        .map_err(e)?;
    let mut out = vec![];
    for r in rows {
        let (id, to, subject, text, attempts) = r.map_err(e)?;
        out.push(Pending { id, to: p.decrypt(&to)?, subject: p.decrypt(&subject)?, text: p.decrypt(&text)?, attempts });
    }
    Ok(out)
}

/// Sent: the recipient, subject and text are wiped; the kind, workspace and times stay.
pub fn mark_sent(conn: &Connection, id: i64, now_ms: i64) -> Result<(), String> {
    conn.execute("UPDATE outbox SET sent_ms = ?1, to_addr = '', subject = '', body = '', last_error = NULL WHERE id = ?2", rusqlite::params![now_ms, id]).map_err(e)?;
    Ok(())
}

/// An error message with anything that looks like an e-mail address replaced, so a mail server that echoes the recipient back does
/// not leave an address in a log or in the outbox.
pub fn scrub(message: &str) -> String {
    message.split_whitespace().map(|w| if w.contains('@') { "<address>" } else { w }).collect::<Vec<_>>().join(" ")
}

/// Not sent: one more attempt counted, the next try after a wait that doubles (a minute, two, four... at most an hour).
pub fn mark_failed(conn: &Connection, id: i64, error: &str, now_ms: i64) -> Result<(), String> {
    let attempts: i64 = conn.query_row("SELECT attempts FROM outbox WHERE id = ?1", [id], |r| r.get(0)).map_err(e)?;
    let wait = (60_000i64 << attempts.min(6)).min(60 * 60 * 1000);
    conn.execute(
        "UPDATE outbox SET attempts = attempts + 1, next_try_ms = ?1, last_error = ?2 WHERE id = ?3",
        rusqlite::params![now_ms + wait, scrub(error).chars().take(300).collect::<String>(), id],
    )
    .map_err(e)?;
    Ok(())
}

/// Drop mails given up on more than a week ago (they still hold encrypted personal data).
pub fn purge(conn: &Connection, now_ms: i64) -> Result<usize, String> {
    conn.execute("DELETE FROM outbox WHERE sent_ms IS NULL AND attempts >= ?1 AND next_try_ms < ?2", rusqlite::params![MAX_ATTEMPTS, now_ms - GIVE_UP_KEPT_MS]).map_err(e)
}

/// What an operator sees: counts, and the recent rows without any address or text.
pub fn summary(conn: &Connection, tenant: Option<&str>, limit: usize) -> Result<Value, String> {
    let (cond, args): (&str, Vec<Sql>) = match tenant {
        Some(t) => (" WHERE tenant_key = ?", vec![Sql::Text(t.to_string())]),
        None => ("", vec![]),
    };
    let count = |extra: &str| -> Result<i64, String> {
        let sql = format!("SELECT COUNT(*) FROM outbox{}{extra}", if cond.is_empty() && !extra.is_empty() { " WHERE 1=1" } else { cond });
        conn.query_row(&sql, rusqlite::params_from_iter(args.iter()), |r| r.get(0)).map_err(e)
    };
    let total = count("")?;
    let sent = count(" AND sent_ms IS NOT NULL")?;
    let failed = count(&format!(" AND sent_ms IS NULL AND attempts >= {MAX_ATTEMPTS}"))?;
    let mut st = conn
        .prepare(&format!("SELECT document_id, kind, tenant_key, created_ms, attempts, last_error, sent_ms FROM outbox{cond} ORDER BY id DESC LIMIT {limit}"))
        .map_err(e)?;
    let rows = st
        .query_map(rusqlite::params_from_iter(args.iter()), |r| {
            Ok(json!({"documentId": r.get::<_, String>(0)?, "kind": r.get::<_, String>(1)?, "tenantKey": r.get::<_, Option<String>>(2)?, "createdMs": r.get::<_, i64>(3)?, "attempts": r.get::<_, i64>(4)?, "lastError": r.get::<_, Option<String>>(5)?, "sentMs": r.get::<_, Option<i64>>(6)?}))
        })
        .map_err(e)?;
    let mut recent = vec![];
    for r in rows {
        recent.push(r.map_err(e)?);
    }
    Ok(json!({"total": total, "sent": sent, "pending": total - sent - failed, "failed": failed, "recent": recent}))
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }
    fn pii() -> Pii {
        Pii::from_base64(KEY).unwrap()
    }

    #[test]
    fn a_complaint_notifies_staff_and_acknowledges_the_citizen_in_strapis_words() {
        let row = json!({"tenantKey": "pea", "ref": "DGA-CMP-2569-123456", "type": "ทุจริต", "subject": "ขอตรวจสอบ", "name": "สมชาย", "email": "s@x.th", "anonymous": false});
        let mails = notices("complaint", &row, Some("staff@dga.or.th"));
        assert_eq!(mails.iter().map(|m| m.kind).collect::<Vec<_>>(), ["complaint-staff", "complaint-ack"]);
        assert_eq!(mails[0].to, "staff@dga.or.th");
        assert_eq!(mails[0].subject, "[ร้องเรียนใหม่] DGA-CMP-2569-123456 — ขอตรวจสอบ");
        assert_eq!(mails[0].text, "มีเรื่องร้องเรียน/แจ้งเบาะแสใหม่\nเลขอ้างอิง: DGA-CMP-2569-123456\nประเภท: ทุจริต\nหัวข้อ: ขอตรวจสอบ\nผู้แจ้ง: สมชาย / s@x.th");
        assert_eq!(mails[1].to, "s@x.th");
        assert_eq!(mails[1].subject, "รับเรื่องร้องเรียนแล้ว (DGA-CMP-2569-123456)");
        assert!(mails[1].text.contains("หมายเลขอ้างอิง: DGA-CMP-2569-123456") && mails[1].text.contains("ติดตามเรื่องร้องเรียน"));
        assert_eq!(mails[0].tenant_key.as_deref(), Some("pea"));
    }

    #[test]
    fn an_anonymous_complaint_is_reported_to_staff_without_a_name_and_acknowledged_to_no_one() {
        let row = json!({"ref": "R", "subject": "s", "anonymous": true, "name": "", "email": ""});
        let mails = notices("complaint", &row, Some("staff@x.th"));
        assert_eq!(mails.len(), 1);
        assert!(mails[0].text.ends_with("ผู้แจ้ง: ไม่ประสงค์ออกนาม"));
        assert!(notices("complaint", &row, None).is_empty(), "no staff address and no citizen address: nothing to send");
        let named = json!({"ref": "R", "subject": "s", "email": "c@x.th", "anonymous": true});
        assert_eq!(notices("complaint", &named, None).len(), 0, "an anonymous complaint is never acknowledged, even if an address got in");
    }

    #[test]
    fn an_application_and_a_registration_get_their_confirmation_and_a_form_without_an_address_gets_none() {
        let a = notices("application", &json!({"ref": "DGA-JOB-2569-111111", "position": "นักพัฒนา", "email": "a@x.th"}), None);
        assert_eq!((a[0].kind, a[0].subject.as_str()), ("application-ack", "รับใบสมัครงานแล้ว (DGA-JOB-2569-111111)"));
        assert_eq!(a[0].text, "ขอบคุณที่สมัครงานกับ สพร.\nหมายเลขอ้างอิง: DGA-JOB-2569-111111\nตำแหน่ง: นักพัฒนา\nตรวจสอบสถานะได้ที่หน้า \"ตรวจสอบสถานะใบสมัคร\" ของเว็บไซต์");
        let r = notices("registration", &json!({"username": "nok1234", "email": "n@x.th"}), None);
        assert_eq!((r[0].kind, r[0].subject.as_str()), ("registration-welcome", "ลงทะเบียนผู้ใช้งานสำเร็จ (nok1234)"));
        assert!(notices("application", &json!({"ref": "R"}), None).is_empty());
        assert!(notices("registration", &json!({"username": "u"}), None).is_empty());
        assert!(notices("contact-message", &json!({"email": "c@x.th"}), Some("staff@x.th")).is_empty(), "a contact message sends no mail, as in Strapi");
    }

    #[test]
    fn a_queued_mail_is_encrypted_while_it_waits_and_wiped_when_sent() {
        let c = db();
        let p = pii();
        let m = Mail { kind: "complaint-ack", tenant_key: Some("pea".into()), to: "citizen@example.com".into(), subject: "รับเรื่องแล้ว".into(), text: "เนื้อความ".into() };
        enqueue(&c, &p, &m, 1_000).unwrap();
        let raw: String = c.query_row("SELECT to_addr || subject || body FROM outbox", [], |r| r.get(0)).unwrap();
        assert!(!raw.contains("citizen@example.com") && !raw.contains("เนื้อความ"), "nothing readable at rest");
        let due = due(&c, &p, 1_000, 10).unwrap();
        assert_eq!((due.len(), due[0].to.as_str(), due[0].subject.as_str(), due[0].text.as_str()), (1, "citizen@example.com", "รับเรื่องแล้ว", "เนื้อความ"));
        mark_sent(&c, due[0].id, 2_000).unwrap();
        let (to, body, sent): (String, String, Option<i64>) = c.query_row("SELECT to_addr, body, sent_ms FROM outbox", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
        assert_eq!((to.as_str(), body.as_str(), sent), ("", "", Some(2_000)), "the address and text are gone once it is sent");
        assert!(super::due(&c, &p, 99_999, 10).unwrap().is_empty(), "a sent mail is not due again");
    }

    #[test]
    fn a_failed_mail_waits_longer_each_time_and_is_given_up_on_after_eight() {
        let c = db();
        let p = pii();
        enqueue(&c, &p, &Mail { kind: "complaint-ack", tenant_key: None, to: "a@x.th".into(), subject: "s".into(), text: "t".into() }, 0).unwrap();
        let mut now = 0i64;
        let mut waits = vec![];
        for _ in 0..MAX_ATTEMPTS {
            let d = due(&c, &p, now, 10).unwrap();
            assert_eq!(d.len(), 1, "due at {now}");
            mark_failed(&c, d[0].id, "connection refused", now).unwrap();
            let next: i64 = c.query_row("SELECT next_try_ms FROM outbox", [], |r| r.get(0)).unwrap();
            waits.push(next - now);
            assert!(due(&c, &p, now, 10).unwrap().is_empty(), "not due again straight away");
            now = next;
        }
        assert_eq!(waits, [60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000, 3_600_000], "doubling to an hour");
        assert!(due(&c, &p, now + 10_000_000, 10).unwrap().is_empty(), "given up on after {MAX_ATTEMPTS} tries");
        let s = summary(&c, None, 10).unwrap();
        assert_eq!((s["failed"].as_i64(), s["pending"].as_i64(), s["sent"].as_i64()), (Some(1), Some(0), Some(0)));
        assert_eq!(s["recent"][0]["lastError"], "connection refused");
        assert_eq!(purge(&c, now + 1).unwrap(), 0, "kept for a week so an operator can see it");
        assert_eq!(purge(&c, now + GIVE_UP_KEPT_MS + 1).unwrap(), 1);
    }

    #[test]
    fn an_address_a_mail_server_echoes_is_not_kept() {
        assert_eq!(scrub("permanent error (550): <somchai@example.com> no such user"), "permanent error (550): <address> no such user");
        assert_eq!(scrub("user@x.th, other@y.th rejected"), "<address> <address> rejected");
        assert_eq!(scrub("connection refused"), "connection refused");
        let c = db();
        let p = pii();
        enqueue(&c, &p, &Mail { kind: "complaint-ack", tenant_key: None, to: "a@x.th".into(), subject: "s".into(), text: "t".into() }, 0).unwrap();
        let d = due(&c, &p, 0, 1).unwrap();
        mark_failed(&c, d[0].id, "550 <a@x.th> unknown", 0).unwrap();
        let kept: String = c.query_row("SELECT last_error FROM outbox", [], |r| r.get(0)).unwrap();
        assert_eq!(kept, "550 <address> unknown");
    }

    #[test]
    fn the_summary_counts_by_state_for_one_workspace_or_all_and_shows_no_addresses() {
        let c = db();
        let p = pii();
        for (t, kind) in [("pea", "complaint-ack"), ("pea", "application-ack"), ("dga", "complaint-ack")] {
            enqueue(&c, &p, &Mail { kind, tenant_key: Some(t.into()), to: "secret@x.th".into(), subject: "s".into(), text: "t".into() }, 0).unwrap();
        }
        let first = due(&c, &p, 0, 1).unwrap();
        mark_sent(&c, first[0].id, 5).unwrap();
        let all = summary(&c, None, 10).unwrap();
        assert_eq!((all["total"].as_i64(), all["sent"].as_i64(), all["pending"].as_i64()), (Some(3), Some(1), Some(2)));
        let pea = summary(&c, Some("pea"), 10).unwrap();
        assert_eq!(pea["total"], 2);
        assert!(!all.to_string().contains("secret@x.th"));
    }
}
