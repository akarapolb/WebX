//! The audit log (docs/target-architecture.md, track C3): who did what, in which
//! workspace, when. Append-only: rows are added and read, never changed or
//! deleted. Rows have the shape Strapi's `audit-log` type has, so Studio's
//! governance code reads and writes them unchanged.
use rusqlite::{params_from_iter, types::Value as Sql, Connection};
use serde_json::{json, Value};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  action TEXT, content_type TEXT, entry_id TEXT, admin_email TEXT, tenant_key TEXT,
  at TEXT, actor TEXT, target_ref TEXT, method TEXT, path TEXT, tokens INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_tenant_at ON audit(tenant_key, at);
CREATE INDEX IF NOT EXISTS audit_action ON audit(action, tenant_key, at);
";

/// (field name in the API, column, numeric?)
const FIELDS: [(&str, &str, bool); 14] = [
    ("id", "id", true),
    ("documentId", "document_id", false),
    ("action", "action", false),
    ("contentType", "content_type", false),
    ("entryId", "entry_id", false),
    ("adminEmail", "admin_email", false),
    ("tenantKey", "tenant_key", false),
    ("at", "at", false),
    ("actor", "actor", false),
    ("targetRef", "target_ref", false),
    ("method", "method", false),
    ("path", "path", false),
    ("tokens", "tokens", true),
    ("createdAt", "created_at", false),
];
const TEXT_SEARCH: [&str; 8] = ["action", "content_type", "entry_id", "admin_email", "tenant_key", "actor", "target_ref", "path"];

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}
fn column(field: &str) -> Option<(&'static str, bool)> {
    FIELDS.iter().find(|(f, _, _)| *f == field).map(|(_, c, n)| (*c, *n))
}

pub fn new_document_id() -> String {
    let mut b = [0u8; 24];
    getrandom::getrandom(&mut b).expect("random bytes");
    b.iter().map(|x| "abcdefghijklmnopqrstuvwxyz0123456789".as_bytes()[(*x as usize) % 36] as char).collect()
}

fn text(v: &Value, k: &str) -> Option<String> {
    match v.get(k) {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

/// Append a row. `row` is a Strapi-shaped audit entry; `now` stamps createdAt unless
/// the row (an import) carries its own. Returns the stored row.
pub fn create(conn: &Connection, row: &Value, now: &str) -> Result<Value, String> {
    if !row.is_object() {
        return Err("an audit row is an object".into());
    }
    let action = text(row, "action").filter(|a| !a.is_empty()).ok_or("action is required")?;
    let tokens = match row.get("tokens") {
        None | Some(Value::Null) => None,
        Some(v) => Some(v.as_i64().ok_or("tokens must be an integer")?),
    };
    let doc = text(row, "documentId").unwrap_or_else(new_document_id);
    conn.execute(
        "INSERT INTO audit(document_id, action, content_type, entry_id, admin_email, tenant_key, at, actor, target_ref, method, path, tokens, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        rusqlite::params![
            doc, action, text(row, "contentType"), text(row, "entryId"), text(row, "adminEmail"), text(row, "tenantKey"), text(row, "at").or_else(|| Some(now.to_string())),
            text(row, "actor"), text(row, "targetRef"), text(row, "method"), text(row, "path"), tokens, text(row, "createdAt").unwrap_or_else(|| now.to_string())
        ],
    )
    .map_err(e)?;
    get(conn, &doc)?.ok_or_else(|| "audit: row vanished".to_string())
}

fn row_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let s = |i: usize| -> rusqlite::Result<Value> { Ok(r.get::<_, Option<String>>(i)?.map(Value::String).unwrap_or(Value::Null)) };
    let created: String = r.get(13)?;
    Ok(json!({
        "id": r.get::<_, i64>(0)?, "documentId": r.get::<_, String>(1)?,
        "action": s(2)?, "contentType": s(3)?, "entryId": s(4)?, "adminEmail": s(5)?, "tenantKey": s(6)?,
        "at": s(7)?, "actor": s(8)?, "targetRef": s(9)?, "method": s(10)?, "path": s(11)?,
        "tokens": r.get::<_, Option<i64>>(12)?, "createdAt": created, "updatedAt": created,
    }))
}
const COLS: &str = "id, document_id, action, content_type, entry_id, admin_email, tenant_key, at, actor, target_ref, method, path, tokens, created_at";

pub fn get(conn: &Connection, document_id: &str) -> Result<Option<Value>, String> {
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM audit WHERE document_id=?1")).map_err(e)?;
    let mut rows = st.query_map([document_id], row_json).map_err(e)?;
    rows.next().transpose().map_err(e)
}

pub struct Filter {
    pub field: String,
    pub op: String,
    pub value: String,
}

pub struct Query {
    pub filters: Vec<Filter>,
    /// full-text search over the text columns
    pub q: Option<String>,
    /// (field, descending); newest first by default
    pub sort: (String, bool),
    pub page: usize,
    pub page_size: usize,
}

fn like(s: &str) -> String {
    format!("%{}%", s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

pub fn list(conn: &Connection, q: &Query) -> Result<(Vec<Value>, usize), String> {
    let mut wh: Vec<String> = Vec::new();
    let mut args: Vec<Sql> = Vec::new();
    for f in &q.filters {
        let (col, numeric) = column(&f.field).ok_or_else(|| format!("unknown audit field {}", f.field))?;
        let val = if numeric { Sql::Integer(f.value.parse::<i64>().map_err(|_| format!("{} needs a number", f.field))?) } else { Sql::Text(f.value.clone()) };
        match f.op.as_str() {
            "eq" => { wh.push(format!("{col} = ?")); args.push(val); }
            "ne" => { wh.push(format!("({col} IS NULL OR {col} <> ?)")); args.push(val); }
            "gte" => { wh.push(format!("{col} >= ?")); args.push(val); }
            "lte" => { wh.push(format!("{col} <= ?")); args.push(val); }
            "contains" => { wh.push(format!("{col} LIKE ? ESCAPE '\\'")); args.push(Sql::Text(like(&f.value))); }
            other => return Err(format!("unsupported filter operator {other}")),
        }
    }
    if let Some(s) = q.q.as_deref().filter(|s| !s.is_empty()) {
        let any: Vec<String> = TEXT_SEARCH.iter().map(|c| format!("{c} LIKE ? ESCAPE '\\'")).collect();
        wh.push(format!("({})", any.join(" OR ")));
        for _ in TEXT_SEARCH { args.push(Sql::Text(like(s))); }
    }
    let where_sql = if wh.is_empty() { String::new() } else { format!(" WHERE {}", wh.join(" AND ")) };
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM audit{where_sql}"), params_from_iter(args.iter()), |r| r.get(0)).map_err(e)?;
    let (sort_col, _) = column(&q.sort.0).ok_or_else(|| format!("unknown audit field {}", q.sort.0))?;
    let dir = if q.sort.1 { "DESC" } else { "ASC" };
    let sql = format!("SELECT {COLS} FROM audit{where_sql} ORDER BY {sort_col} {dir}, id {dir} LIMIT ? OFFSET ?");
    args.push(Sql::Integer(q.page_size as i64));
    args.push(Sql::Integer(((q.page - 1) * q.page_size) as i64));
    let mut st = conn.prepare(&sql).map_err(e)?;
    let rows = st.query_map(params_from_iter(args.iter()), row_json).map_err(e)?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(e)?); }
    Ok((out, total as usize))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }
    const NOW: &str = "2026-11-23T10:00:00.000Z";
    fn add(c: &Connection, action: &str, tenant: &str, at: &str) -> Value {
        create(c, &json!({"action": action, "tenantKey": tenant, "adminEmail": "a@x", "at": at, "contentType": "api::faq.faq"}), NOW).unwrap()
    }
    fn q(filters: &[(&str, &str, &str)]) -> Query {
        Query { filters: filters.iter().map(|(f, o, v)| Filter { field: f.to_string(), op: o.to_string(), value: v.to_string() }).collect(), q: None, sort: ("at".into(), true), page: 1, page_size: 25 }
    }

    #[test]
    fn rows_come_back_in_strapis_shape() {
        let c = db();
        let r = create(&c, &json!({"action": "agent_run_usage", "tenantKey": "dga", "tokens": 120, "actor": "agent"}), NOW).unwrap();
        assert_eq!(r["action"], "agent_run_usage");
        assert_eq!(r["tokens"], 120);
        assert_eq!(r["createdAt"], NOW);
        assert_eq!(r["at"], NOW, "at defaults to now");
        assert!(r["documentId"].as_str().unwrap().len() == 24 && r["id"].as_i64().unwrap() >= 1);
        assert_eq!(r["path"], Value::Null);
    }

    #[test]
    fn filters_scope_by_tenant_action_and_time() {
        let c = db();
        add(&c, "agent_run", "dga", "2026-11-01T00:00:00.000Z");
        add(&c, "agent_run", "dga", "2026-10-31T23:59:59.000Z");
        add(&c, "agent_run", "pea", "2026-11-05T00:00:00.000Z");
        add(&c, "signup", "dga", "2026-11-06T00:00:00.000Z");
        let (rows, total) = list(&c, &q(&[("tenantKey", "eq", "dga"), ("action", "eq", "agent_run"), ("at", "gte", "2026-11-01T00:00:00.000Z")])).unwrap();
        assert_eq!((total, rows.len()), (1, 1));
        assert_eq!(list(&c, &q(&[("action", "ne", "agent_run")])).unwrap().1, 1);
        assert_eq!(list(&c, &q(&[("action", "contains", "run")])).unwrap().1, 3);
        assert_eq!(list(&c, &q(&[("at", "lte", "2026-10-31T23:59:59.000Z")])).unwrap().1, 1);
    }

    #[test]
    fn sorts_newest_first_and_paginates_with_total() {
        let c = db();
        for d in 1..=5 { add(&c, "x", "dga", &format!("2026-11-0{d}T00:00:00.000Z")); }
        let mut query = q(&[]);
        query.page_size = 2;
        query.page = 2;
        let (rows, total) = list(&c, &query).unwrap();
        assert_eq!(total, 5);
        assert_eq!(rows[0]["at"], "2026-11-03T00:00:00.000Z");
        query.sort = ("at".into(), false);
        query.page = 1;
        assert_eq!(list(&c, &query).unwrap().0[0]["at"], "2026-11-01T00:00:00.000Z");
    }

    #[test]
    fn search_and_wildcards_are_literal() {
        let c = db();
        add(&c, "custom_role_create", "dga", NOW);
        add(&c, "signup", "dga", NOW);
        let mut query = q(&[]);
        query.q = Some("ROLE".into());
        assert_eq!(list(&c, &query).unwrap().1, 1);
        query.q = Some("%".into());
        assert_eq!(list(&c, &query).unwrap().1, 0);
    }

    #[test]
    fn tokens_sum_by_listing_and_numeric_filters() {
        let c = db();
        for t in [10, 20, 30] { create(&c, &json!({"action": "agent_run_usage", "tenantKey": "dga", "tokens": t}), NOW).unwrap(); }
        let (rows, _) = list(&c, &q(&[("tokens", "gte", "20")])).unwrap();
        assert_eq!(rows.iter().map(|r| r["tokens"].as_i64().unwrap()).sum::<i64>(), 50);
        assert!(list(&c, &q(&[("tokens", "eq", "many")])).is_err());
    }

    #[test]
    fn bad_input_is_refused() {
        let c = db();
        assert!(create(&c, &json!({"tenantKey": "dga"}), NOW).is_err(), "action is required");
        assert!(create(&c, &json!("x"), NOW).is_err());
        assert!(create(&c, &json!({"action": "a", "tokens": "x"}), NOW).is_err());
        assert!(list(&c, &q(&[("nosuch", "eq", "1")])).is_err());
        assert!(list(&c, &q(&[("action", "regex", "1")])).is_err());
        let mut sorted = q(&[]);
        sorted.sort = ("id; DROP TABLE audit".into(), true);
        assert!(list(&c, &sorted).is_err(), "sort is a whitelist");
    }

    #[test]
    fn an_import_keeps_its_own_id_and_time() {
        let c = db();
        let r = create(&c, &json!({"documentId": "abc123", "action": "signup", "createdAt": "2026-01-01T00:00:00.000Z", "at": "2026-01-01T00:00:00.000Z"}), NOW).unwrap();
        assert_eq!((r["documentId"].as_str(), r["createdAt"].as_str()), (Some("abc123"), Some("2026-01-01T00:00:00.000Z")));
        assert!(create(&c, &json!({"documentId": "abc123", "action": "signup"}), NOW).is_err(), "no duplicate ids");
    }
}
