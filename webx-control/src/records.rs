//! Bookkeeping records (docs/target-architecture.md, track C3): the small typed
//! collections Studio's governance keeps about a workspace, such as custom roles,
//! page templates and page versions. Each is a set of JSON documents in one
//! table, addressed by collection and `documentId`. Unlike the audit log they
//! can be changed and deleted. Rows come back in the shape Strapi gives them,
//! so governance reads and writes them unchanged.
//!
//! Only collections named in `COLLECTIONS` exist: a collection moves here by being
//! added to that list and switched on in Studio, one at a time.
use rusqlite::{params_from_iter, types::Value as Sql, Connection};
use serde_json::{json, Map, Value};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,
  document_id TEXT NOT NULL UNIQUE,
  tenant_key TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_collection_tenant ON records(collection, tenant_key);
-- a reference number (a complaint's or an application's) names one row of its collection: a visitor tracks by it
CREATE UNIQUE INDEX IF NOT EXISTS records_ref ON records(collection, json_extract(data, '$.ref')) WHERE json_extract(data, '$.ref') IS NOT NULL;
";

/// The collections served here, by the route name Studio uses (the content type's singular name).
pub const COLLECTIONS: [&str; 9] = ["custom-role", "page-template", "page-version", "consent-log", "complaint", "application", "registration", "contact-message", "agent-thread"];

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}
pub fn known(collection: &str) -> bool {
    COLLECTIONS.contains(&collection)
}

/// fields kept in their own columns, not in the data document
const RESERVED: [&str; 4] = ["id", "documentId", "createdAt", "updatedAt"];

fn field_ok(f: &str) -> bool {
    !f.is_empty() && f.len() <= 64 && f.chars().next().unwrap().is_ascii_alphabetic() && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// SQL for a field: a column, or a path into the data document
fn expr(field: &str) -> Result<String, String> {
    Ok(match field {
        "id" => "id".into(),
        "documentId" => "document_id".into(),
        "tenantKey" => "tenant_key".into(),
        "createdAt" => "created_at".into(),
        "updatedAt" => "updated_at".into(),
        f if field_ok(f) => format!("json_extract(data, '$.{f}')"),
        f => return Err(format!("unsupported field {f}")),
    })
}

fn row_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let data: String = r.get(3)?;
    let mut o = match serde_json::from_str::<Value>(&data) {
        Ok(Value::Object(m)) => m,
        _ => Map::new(),
    };
    let mut out = Map::new();
    out.insert("id".into(), json!(r.get::<_, i64>(0)?));
    out.insert("documentId".into(), json!(r.get::<_, String>(1)?));
    if let Some(t) = r.get::<_, Option<String>>(2)? {
        o.insert("tenantKey".into(), json!(t));
    }
    out.extend(o);
    out.insert("createdAt".into(), json!(r.get::<_, String>(4)?));
    out.insert("updatedAt".into(), json!(r.get::<_, String>(5)?));
    Ok(Value::Object(out))
}
const COLS: &str = "id, document_id, tenant_key, data, created_at, updated_at";

pub fn new_document_id() -> String {
    crate::audit::new_document_id()
}

fn payload(v: &Value) -> Result<Map<String, Value>, String> {
    let mut m = v.as_object().ok_or("a record is an object")?.clone();
    for k in RESERVED {
        m.remove(k);
    }
    Ok(m)
}
fn tenant_of(m: &Map<String, Value>) -> Result<Option<String>, String> {
    match m.get("tenantKey") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.clone())),
        _ => Err("tenantKey must be a string".into()),
    }
}

pub fn create(conn: &Connection, collection: &str, v: &Value, now: &str) -> Result<Value, String> {
    let mut m = payload(v)?;
    let tenant = tenant_of(&m)?;
    m.remove("tenantKey");
    let doc = new_document_id();
    conn.execute(
        "INSERT INTO records(collection, document_id, tenant_key, data, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
        rusqlite::params![collection, doc, tenant, Value::Object(m).to_string(), now],
    )
    .map_err(e)?;
    get(conn, collection, &doc)?.ok_or_else(|| "record vanished".to_string())
}

/// A migration: the row keeps its own documentId and times. Returns false when it is already there.
pub fn import(conn: &Connection, collection: &str, v: &Value, now: &str) -> Result<bool, String> {
    let doc = v.get("documentId").and_then(Value::as_str).filter(|d| !d.is_empty()).ok_or("an imported record needs its documentId")?;
    if get(conn, collection, doc)?.is_some() || conn.query_row("SELECT 1 FROM records WHERE document_id=?1", [doc], |_| Ok(())).is_ok() {
        return Ok(false);
    }
    let mut m = payload(v)?;
    let tenant = tenant_of(&m)?;
    m.remove("tenantKey");
    let created = v.get("createdAt").and_then(Value::as_str).unwrap_or(now);
    let updated = v.get("updatedAt").and_then(Value::as_str).unwrap_or(created);
    conn.execute(
        "INSERT INTO records(collection, document_id, tenant_key, data, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![collection, doc, tenant, Value::Object(m).to_string(), created, updated],
    )
    .map_err(e)?;
    Ok(true)
}

pub fn get(conn: &Connection, collection: &str, document_id: &str) -> Result<Option<Value>, String> {
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM records WHERE collection=?1 AND document_id=?2")).map_err(e)?;
    let mut rows = st.query_map([collection, document_id], row_json).map_err(e)?;
    rows.next().transpose().map_err(e)
}

/// Merge `v`'s fields into the record (as Strapi's update does); null clears a field.
pub fn update(conn: &Connection, collection: &str, document_id: &str, v: &Value, now: &str) -> Result<Option<Value>, String> {
    let Some(cur) = get(conn, collection, document_id)? else { return Ok(None) };
    let patch = payload(v)?;
    let mut m = payload(&cur)?;
    for (k, val) in patch {
        m.insert(k, val);
    }
    let tenant = tenant_of(&m)?;
    m.remove("tenantKey");
    conn.execute(
        "UPDATE records SET tenant_key=?1, data=?2, updated_at=?3 WHERE collection=?4 AND document_id=?5",
        rusqlite::params![tenant, Value::Object(m).to_string(), now, collection, document_id],
    )
    .map_err(e)?;
    get(conn, collection, document_id)
}

pub fn remove(conn: &Connection, collection: &str, document_id: &str) -> Result<bool, String> {
    Ok(conn.execute("DELETE FROM records WHERE collection=?1 AND document_id=?2", [collection, document_id]).map_err(e)? > 0)
}

/// The row of a collection with this reference number (`json_extract(data, '$.ref')`, the indexed expression) in this workspace.
pub fn find_by_ref(conn: &Connection, collection: &str, tenant_key: &str, reference: &str) -> Result<Option<Value>, String> {
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM records WHERE collection=?1 AND json_extract(data, '$.ref')=?2 AND tenant_key=?3")).map_err(e)?;
    let mut rows = st.query_map([collection, reference, tenant_key], row_json).map_err(e)?;
    rows.next().transpose().map_err(e)
}

pub struct Filter {
    pub field: String,
    pub op: String,
    pub value: String,
}
pub struct Query {
    pub filters: Vec<Filter>,
    pub sort: Option<(String, bool)>,
    pub page: usize,
    pub page_size: usize,
}

fn like(s: &str) -> String {
    format!("%{}%", s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

pub fn list(conn: &Connection, collection: &str, q: &Query) -> Result<(Vec<Value>, usize), String> {
    let mut wh = vec!["collection = ?".to_string()];
    let mut args: Vec<Sql> = vec![Sql::Text(collection.to_string())];
    for f in &q.filters {
        let x = expr(&f.field)?;
        let num = f.value.parse::<f64>().ok();
        match f.op.as_str() {
            "eq" => { wh.push(format!("CAST({x} AS TEXT) = ?")); args.push(Sql::Text(f.value.clone())); }
            "ne" => { wh.push(format!("({x} IS NULL OR CAST({x} AS TEXT) <> ?)")); args.push(Sql::Text(f.value.clone())); }
            "contains" => { wh.push(format!("CAST({x} AS TEXT) LIKE ? ESCAPE '\\'")); args.push(Sql::Text(like(&f.value))); }
            op @ ("gte" | "lte") => {
                let sym = if op == "gte" { ">=" } else { "<=" };
                // ordering a number: 9 comes before 10; dates and ids order as text
                match num {
                    Some(n) if f.field != "documentId" && f.field != "createdAt" && f.field != "updatedAt" => { wh.push(format!("CAST({x} AS REAL) {sym} ?")); args.push(Sql::Real(n)); }
                    _ => { wh.push(format!("CAST({x} AS TEXT) {sym} ?")); args.push(Sql::Text(f.value.clone())); }
                }
            }
            other => return Err(format!("unsupported filter operator {other}")),
        }
    }
    let where_sql = format!(" WHERE {}", wh.join(" AND "));
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM records{where_sql}"), params_from_iter(args.iter()), |r| r.get(0)).map_err(e)?;
    let (sf, desc) = q.sort.clone().unwrap_or(("id".into(), false));
    let dir = if desc { "DESC" } else { "ASC" };
    let sql = format!("SELECT {COLS} FROM records{where_sql} ORDER BY {} {dir}, id {dir} LIMIT ? OFFSET ?", expr(&sf)?);
    args.push(Sql::Integer(q.page_size as i64));
    args.push(Sql::Integer(((q.page - 1) * q.page_size) as i64));
    let mut st = conn.prepare(&sql).map_err(e)?;
    let rows = st.query_map(params_from_iter(args.iter()), row_json).map_err(e)?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(e)?); }
    Ok((out, total as usize))
}

/// How many rows a collection has, inside an optional workspace and creation window `[from, before)`.
pub fn count(conn: &Connection, collection: &str, tenant: Option<&str>, from: Option<&str>, before: Option<&str>) -> Result<usize, String> {
    let mut wh = vec!["collection = ?".to_string()];
    let mut args: Vec<Sql> = vec![Sql::Text(collection.to_string())];
    if let Some(t) = tenant { wh.push("tenant_key = ?".into()); args.push(Sql::Text(t.into())); }
    if let Some(f) = from { wh.push("created_at >= ?".into()); args.push(Sql::Text(f.into())); }
    if let Some(b) = before { wh.push("created_at < ?".into()); args.push(Sql::Text(b.into())); }
    let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM records WHERE {}", wh.join(" AND ")), params_from_iter(args.iter()), |r| r.get(0)).map_err(e)?;
    Ok(n as usize)
}

/// How many rows of a collection hold each value of one field (its text; None where the field is absent), inside an
/// optional workspace and creation window `[from, before)` (times as `jobs::iso` writes them): the numbers behind an
/// analytics screen without reading every row.
pub fn count_by(conn: &Connection, collection: &str, field: &str, tenant: Option<&str>, from: Option<&str>, before: Option<&str>) -> Result<Vec<(Option<String>, usize)>, String> {
    let x = expr(field)?;
    let mut wh = vec!["collection = ?".to_string()];
    let mut args: Vec<Sql> = vec![Sql::Text(collection.to_string())];
    if let Some(t) = tenant { wh.push("tenant_key = ?".into()); args.push(Sql::Text(t.into())); }
    if let Some(f) = from { wh.push("created_at >= ?".into()); args.push(Sql::Text(f.into())); }
    if let Some(b) = before { wh.push("created_at < ?".into()); args.push(Sql::Text(b.into())); }
    let sql = format!("SELECT CAST({x} AS TEXT), COUNT(*) FROM records WHERE {} GROUP BY 1", wh.join(" AND "));
    let mut st = conn.prepare(&sql).map_err(e)?;
    let rows = st.query_map(params_from_iter(args.iter()), |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)? as usize))).map_err(e)?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(e)?); }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: &str = "2026-11-24T10:00:00.000Z";
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }
    fn q(filters: &[(&str, &str, &str)]) -> Query {
        Query { filters: filters.iter().map(|(f, o, v)| Filter { field: f.to_string(), op: o.to_string(), value: v.to_string() }).collect(), sort: None, page: 1, page_size: 25 }
    }

    #[test]
    fn a_record_round_trips_in_strapis_shape() {
        let c = db();
        let r = create(&c, "custom-role", &json!({"tenantKey": "dga", "roleKey": "editor-lite", "name": "Lite", "permissions": {"a": [1, 2]}, "id": 99, "documentId": "x"}), NOW).unwrap();
        assert_eq!(r["tenantKey"], "dga");
        assert_eq!(r["permissions"], json!({"a": [1, 2]}));
        assert_eq!(r["createdAt"], NOW);
        assert_ne!(r["documentId"], "x", "callers cannot choose ids");
        assert!(r["id"].as_i64().unwrap() >= 1);
        assert_eq!(get(&c, "custom-role", r["documentId"].as_str().unwrap()).unwrap().unwrap(), r);
    }

    #[test]
    fn an_import_keeps_ids_and_times_and_can_run_again() {
        let c = db();
        let row = json!({"documentId": "abc", "tenantKey": "dga", "name": "N", "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-02-01T00:00:00.000Z", "id": 7});
        assert!(import(&c, "page-template", &row, NOW).unwrap());
        assert!(!import(&c, "page-template", &row, NOW).unwrap(), "already there");
        let got = get(&c, "page-template", "abc").unwrap().unwrap();
        assert_eq!((got["createdAt"].clone(), got["updatedAt"].clone(), got["name"].clone()), (json!("2026-01-01T00:00:00.000Z"), json!("2026-02-01T00:00:00.000Z"), json!("N")));
        assert!(import(&c, "page-template", &json!({"name": "no id"}), NOW).is_err());
    }

    #[test]
    fn update_merges_and_null_clears() {
        let c = db();
        let r = create(&c, "page-template", &json!({"tenantKey": "dga", "key": "t1", "name": "A", "description": "d"}), NOW).unwrap();
        let id = r["documentId"].as_str().unwrap();
        let u = update(&c, "page-template", id, &json!({"name": "B", "description": null}), "2026-11-24T11:00:00.000Z").unwrap().unwrap();
        assert_eq!((u["name"].clone(), u["key"].clone(), u["description"].clone()), (json!("B"), json!("t1"), Value::Null));
        assert_eq!((u["createdAt"].clone(), u["updatedAt"].clone()), (json!(NOW), json!("2026-11-24T11:00:00.000Z")));
        assert!(update(&c, "page-template", "nope", &json!({}), NOW).unwrap().is_none());
    }

    #[test]
    fn collections_do_not_see_each_other_and_delete_works() {
        let c = db();
        let a = create(&c, "custom-role", &json!({"tenantKey": "dga", "name": "x"}), NOW).unwrap();
        create(&c, "page-version", &json!({"tenantKey": "dga", "label": "v1"}), NOW).unwrap();
        assert_eq!(list(&c, "custom-role", &q(&[])).unwrap().1, 1);
        assert!(get(&c, "page-version", a["documentId"].as_str().unwrap()).unwrap().is_none());
        assert!(remove(&c, "custom-role", a["documentId"].as_str().unwrap()).unwrap());
        assert!(!remove(&c, "custom-role", a["documentId"].as_str().unwrap()).unwrap());
        assert_eq!(list(&c, "custom-role", &q(&[])).unwrap().1, 0);
    }

    #[test]
    fn filters_on_columns_and_on_fields_of_the_document() {
        let c = db();
        create(&c, "page-version", &json!({"tenantKey": "dga", "documentRef": "p1", "label": "first", "n": 9}), NOW).unwrap();
        create(&c, "page-version", &json!({"tenantKey": "dga", "documentRef": "p2", "label": "second", "n": 10}), NOW).unwrap();
        create(&c, "page-version", &json!({"tenantKey": "pea", "documentRef": "p1", "label": "third", "n": 11}), NOW).unwrap();
        assert_eq!(list(&c, "page-version", &q(&[("tenantKey", "eq", "dga")])).unwrap().1, 2);
        assert_eq!(list(&c, "page-version", &q(&[("tenantKey", "eq", "dga"), ("documentRef", "eq", "p1")])).unwrap().1, 1);
        assert_eq!(list(&c, "page-version", &q(&[("label", "contains", "ir")])).unwrap().1, 2);
        assert_eq!(list(&c, "page-version", &q(&[("tenantKey", "ne", "dga")])).unwrap().1, 1);
        assert_eq!(list(&c, "page-version", &q(&[("n", "gte", "10")])).unwrap().1, 2, "numbers order as numbers");
        assert!(list(&c, "page-version", &q(&[("tenant.key", "eq", "x")])).is_err(), "no relation paths");
        assert!(list(&c, "page-version", &q(&[("a'); DROP TABLE records;--", "eq", "x")])).is_err());
    }

    #[test]
    fn a_reference_number_finds_its_row_in_its_workspace_and_is_unique_in_its_collection() {
        let c = db();
        create(&c, "complaint", &json!({"tenantKey": "pea", "ref": "DGA-CMP-2569-111111", "subject": "mine"}), NOW).unwrap();
        create(&c, "application", &json!({"tenantKey": "pea", "ref": "DGA-CMP-2569-111111"}), NOW).unwrap();
        assert_eq!(find_by_ref(&c, "complaint", "pea", "DGA-CMP-2569-111111").unwrap().unwrap()["subject"], "mine");
        assert!(find_by_ref(&c, "complaint", "dga", "DGA-CMP-2569-111111").unwrap().is_none(), "another workspace does not find it");
        assert!(find_by_ref(&c, "complaint", "pea", "DGA-CMP-2569-999999").unwrap().is_none());
        assert!(find_by_ref(&c, "registration", "pea", "DGA-CMP-2569-111111").unwrap().is_none(), "nor does another collection");
        let dup = create(&c, "complaint", &json!({"tenantKey": "dga", "ref": "DGA-CMP-2569-111111"}), NOW).unwrap_err();
        assert!(dup.contains("UNIQUE"), "{dup}");
        create(&c, "complaint", &json!({"tenantKey": "dga", "subject": "no ref at all"}), NOW).unwrap();
        create(&c, "complaint", &json!({"tenantKey": "dga", "subject": "and another with none"}), NOW).unwrap();
    }

    #[test]
    fn a_plain_count_respects_the_workspace_and_the_window() {
        let c = db();
        for (t, at) in [("pea", "2026-10-31T23:59:59.999Z"), ("pea", "2026-11-02T10:00:00.000Z"), ("dga", "2026-11-03T10:00:00.000Z")] {
            create(&c, "complaint", &json!({"tenantKey": t}), at).unwrap();
        }
        create(&c, "application", &json!({"tenantKey": "pea"}), "2026-11-04T10:00:00.000Z").unwrap();
        assert_eq!(count(&c, "complaint", None, None, None).unwrap(), 3);
        assert_eq!(count(&c, "complaint", Some("pea"), None, None).unwrap(), 2);
        assert_eq!(count(&c, "complaint", Some("pea"), Some("2026-11-01T00:00:00.000Z"), Some("2026-12-01T00:00:00.000Z")).unwrap(), 1);
        assert_eq!(count(&c, "application", None, None, None).unwrap(), 1);
        assert_eq!(count(&c, "registration", None, None, None).unwrap(), 0);
    }

    #[test]
    fn counts_group_by_a_field_inside_a_workspace_and_a_window() {
        let c = db();
        for (t, a, at) in [("pea", "accept_all", "2026-10-31T23:59:59.999Z"), ("pea", "accept_all", "2026-11-02T10:00:00.000Z"), ("pea", "reject", "2026-11-03T10:00:00.000Z"), ("dga", "reject", "2026-11-03T11:00:00.000Z")] {
            create(&c, "consent-log", &json!({"tenantKey": t, "action": a}), at).unwrap();
        }
        create(&c, "consent-log", &json!({"tenantKey": "pea"}), "2026-11-04T10:00:00.000Z").unwrap();
        create(&c, "page-version", &json!({"tenantKey": "pea", "action": "x"}), "2026-11-04T10:00:00.000Z").unwrap();
        let all = count_by(&c, "consent-log", "action", None, None, None).unwrap();
        assert_eq!(all.iter().map(|(_, n)| n).sum::<usize>(), 5, "every row of the collection, none of another");
        let pea = count_by(&c, "consent-log", "action", Some("pea"), None, None).unwrap();
        assert_eq!(pea.iter().find(|(a, _)| a.as_deref() == Some("accept_all")).unwrap().1, 2);
        assert!(pea.iter().any(|(a, n)| a.is_none() && *n == 1), "a row without the field is counted under None");
        let nov = count_by(&c, "consent-log", "action", Some("pea"), Some("2026-11-01T00:00:00.000Z"), Some("2026-12-01T00:00:00.000Z")).unwrap();
        assert_eq!(nov.iter().map(|(_, n)| n).sum::<usize>(), 3, "the window is from-inclusive, before-exclusive");
        assert!(count_by(&c, "consent-log", "bad field!", None, None, None).is_err());
    }

    #[test]
    fn sorts_and_pages_with_a_total() {
        let c = db();
        for n in 1..=5 {
            create(&c, "page-version", &json!({"tenantKey": "dga", "label": format!("v{n}"), "n": n}), &format!("2026-11-24T10:00:0{n}.000Z")).unwrap();
        }
        let mut query = q(&[]);
        query.sort = Some(("createdAt".into(), true));
        query.page_size = 2;
        query.page = 2;
        let (rows, total) = list(&c, "page-version", &query).unwrap();
        assert_eq!(total, 5);
        assert_eq!(rows.iter().map(|r| r["label"].as_str().unwrap().to_string()).collect::<Vec<_>>(), ["v3", "v2"]);
    }
}
