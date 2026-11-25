//! Search statistics (docs/target-architecture.md, track C5, decision D12): what visitors type into the public site's search
//! box, counted anonymously. A port of strapi-cms/src/api/search-stat: one row per workspace, language and normalised query,
//! with how often it was searched, how many results the last time, and how often it found nothing. It never stores who searched
//! (no address, user agent, cookie or path), and drops a query that looks like personal data instead of storing it.
use crate::records::Query;
use rusqlite::{params_from_iter, types::Value as Sql, Connection};
use serde_json::{json, Value};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS search_stats(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  tenant_key TEXT NOT NULL,
  locale TEXT NOT NULL,
  query TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  results INTEGER NOT NULL DEFAULT 0,
  zero_count INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_key, locale, query)
);
";

/// How many different queries one workspace keeps. Past it a query not seen before is dropped (ones already there still
/// count), so an anonymous caller typing endless distinct words cannot fill the disk.
pub const MAX_DISTINCT: usize = 20_000;
const MAX_QUERY: usize = 100;

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

fn looks_like_email(s: &str) -> bool {
    s.split_whitespace().any(|tok| {
        let c: Vec<char> = tok.chars().collect();
        c.iter().enumerate().any(|(i, &ch)| {
            if ch != '@' || i == 0 || c[i - 1] == '@' {
                return false;
            }
            // text, a dot, text: some '.' with a character before it and one after it
            let rest: Vec<char> = c[i + 1..].iter().copied().take_while(|&x| x != '@').collect();
            rest.iter().enumerate().any(|(j, &x)| x == '.' && j >= 1 && j + 1 < rest.len())
        })
    })
}

/// A number of 9 or more digits, with or without single spaces or dashes between the groups (a phone, national ID or
/// account number); a list or range of years such as "2566-2570" is not one.
fn looks_like_number(s: &str) -> bool {
    let c: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < c.len() {
        if !c[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let mut groups: Vec<usize> = vec![];
        loop {
            let start = i;
            while i < c.len() && c[i].is_ascii_digit() {
                i += 1;
            }
            groups.push(i - start);
            if i + 1 < c.len() && (c[i] == '-' || c[i].is_whitespace()) && c[i + 1].is_ascii_digit() {
                i += 1;
            } else {
                break;
            }
        }
        if groups.iter().sum::<usize>() >= 9 && !groups.iter().all(|&g| g == 4) {
            return true;
        }
    }
    false
}

/// A visitor's search as it is stored: single spaces, trimmed, lower case, at most 100 characters. None (do not store) for an
/// empty query or one that looks like personal data. A port of strapi-cms/src/utils/search-query.ts, without its Unicode
/// NFC step (Thai text is unchanged by it; a Latin letter typed as a base plus a combining mark would be counted apart).
pub fn normalise_query(q: &str) -> Option<String> {
    let s: String = q.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase().chars().take(MAX_QUERY).collect();
    if s.is_empty() || looks_like_email(&s) || looks_like_number(&s) {
        return None;
    }
    Some(s)
}

/// Count one search. Returns false when it was dropped because the workspace already keeps `cap` different queries.
pub fn log(conn: &Connection, tenant_key: &str, query: &str, locale: &str, results: i64, cap: usize, now: &str) -> Result<bool, String> {
    let zero = if results == 0 { 1 } else { 0 };
    let changed = conn
        .execute(
            "UPDATE search_stats SET count = count + 1, results = ?1, zero_count = zero_count + ?2, last_at = ?3, updated_at = ?3 WHERE tenant_key = ?4 AND locale = ?5 AND query = ?6",
            rusqlite::params![results, zero, now, tenant_key, locale, query],
        )
        .map_err(e)?;
    if changed > 0 {
        return Ok(true);
    }
    let have: i64 = conn.query_row("SELECT COUNT(*) FROM search_stats WHERE tenant_key = ?1", [tenant_key], |r| r.get(0)).map_err(e)?;
    if have as usize >= cap {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO search_stats(document_id, tenant_key, locale, query, count, results, zero_count, last_at, created_at, updated_at) VALUES (?1,?2,?3,?4,1,?5,?6,?7,?7,?7)",
        rusqlite::params![crate::records::new_document_id(), tenant_key, locale, query, results, zero, now],
    )
    .map_err(e)?;
    Ok(true)
}

fn row_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "documentId": r.get::<_, String>(1)?,
        "tenantKey": r.get::<_, String>(2)?,
        "locale": r.get::<_, String>(3)?,
        "query": r.get::<_, String>(4)?,
        "count": r.get::<_, i64>(5)?,
        "results": r.get::<_, i64>(6)?,
        "zeroCount": r.get::<_, i64>(7)?,
        "lastAt": r.get::<_, String>(8)?,
        "createdAt": r.get::<_, String>(9)?,
        "updatedAt": r.get::<_, String>(10)?,
    }))
}
const COLS: &str = "id, document_id, tenant_key, locale, query, count, results, zero_count, last_at, created_at, updated_at";

fn like(s: &str) -> String {
    format!("%{}%", s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

/// Rows in Strapi's shape, with a total. Filters: `tenantKey` and `locale` (eq), `query` (contains). Sorts: count (the
/// default, most searched first), results, zeroCount, lastAt, query, createdAt, id.
pub fn list(conn: &Connection, q: &Query) -> Result<(Vec<Value>, usize), String> {
    let mut wh: Vec<String> = vec![];
    let mut args: Vec<Sql> = vec![];
    for f in &q.filters {
        match (f.field.as_str(), f.op.as_str()) {
            ("tenantKey", "eq") => { wh.push("tenant_key = ?".into()); args.push(Sql::Text(f.value.clone())); }
            ("locale", "eq") => { wh.push("locale = ?".into()); args.push(Sql::Text(f.value.clone())); }
            ("query", "contains") => { wh.push("query LIKE ? ESCAPE '\\'".into()); args.push(Sql::Text(like(&f.value))); }
            (field, op) => return Err(format!("unsupported filter {field}:{op}")),
        }
    }
    let where_sql = if wh.is_empty() { String::new() } else { format!(" WHERE {}", wh.join(" AND ")) };
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM search_stats{where_sql}"), params_from_iter(args.iter()), |r| r.get(0)).map_err(e)?;
    let (field, desc) = q.sort.clone().unwrap_or(("count".into(), true));
    let col = match field.as_str() {
        "count" => "count",
        "results" => "results",
        "zeroCount" => "zero_count",
        "lastAt" => "last_at",
        "query" => "query",
        "createdAt" => "created_at",
        "id" => "id",
        other => return Err(format!("unsupported sort {other}")),
    };
    let dir = if desc { "DESC" } else { "ASC" };
    args.push(Sql::Integer(q.page_size as i64));
    args.push(Sql::Integer(((q.page - 1) * q.page_size) as i64));
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM search_stats{where_sql} ORDER BY {col} {dir}, id {dir} LIMIT ? OFFSET ?")).map_err(e)?;
    let rows = st.query_map(params_from_iter(args.iter()), row_json).map_err(e)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(e)?);
    }
    Ok((out, total as usize))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::records::Filter;
    const NOW: &str = "2026-11-25T10:00:00.000Z";

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }
    fn q(filters: &[(&str, &str, &str)], sort: Option<(&str, bool)>) -> Query {
        Query { filters: filters.iter().map(|(f, o, v)| Filter { field: f.to_string(), op: o.to_string(), value: v.to_string() }).collect(), sort: sort.map(|(f, d)| (f.to_string(), d)), page: 1, page_size: 50 }
    }

    // the cases of strapi-cms/tests/search-query.test.ts
    #[test]
    fn queries_are_trimmed_lower_cased_single_spaced_and_capped() {
        assert_eq!(normalise_query("  Open   DATA  ").as_deref(), Some("open data"));
        assert_eq!(normalise_query("ข้อมูลเปิด").as_deref(), Some("ข้อมูลเปิด"));
        assert_eq!(normalise_query(&"x".repeat(300)).unwrap().chars().count(), 100);
        assert_eq!(normalise_query(""), None);
        assert_eq!(normalise_query("   "), None);
    }

    #[test]
    fn queries_that_look_like_personal_data_are_not_stored() {
        assert_eq!(normalise_query("somchai@example.com"), None);
        assert_eq!(normalise_query("081-234-5678"), None);
        assert_eq!(normalise_query("1 2345 67890 12 3"), None);
        assert_eq!(normalise_query("0812345678"), None, "a bare phone number");
        assert_eq!(normalise_query("EGDI 2026").as_deref(), Some("egdi 2026"), "a year is fine");
        assert_eq!(normalise_query("แผน 2566-2570").as_deref(), Some("แผน 2566-2570"), "a Thai year range is fine (8 digits but split)");
        assert_eq!(normalise_query("2566-2570-2575").as_deref(), Some("2566-2570-2575"), "a list of years is not a number");
        assert_eq!(normalise_query("a@b").as_deref(), Some("a@b"), "an @ without a dotted domain is not an address");
        assert_eq!(normalise_query("mail me at x@y.z please"), None, "an address anywhere in the query");
        assert_eq!(normalise_query("12345678").as_deref(), Some("12345678"), "8 digits is under the limit");
    }

    #[test]
    fn a_repeated_search_counts_up_and_remembers_the_last_result_count() {
        let c = db();
        assert!(log(&c, "pea", "open data", "th", 7, 100, NOW).unwrap());
        assert!(log(&c, "pea", "open data", "th", 0, 100, "2026-11-25T11:00:00.000Z").unwrap());
        assert!(log(&c, "pea", "open data", "th", 3, 100, "2026-11-25T12:00:00.000Z").unwrap());
        let (rows, total) = list(&c, &q(&[("tenantKey", "eq", "pea")], None)).unwrap();
        assert_eq!(total, 1);
        let r = &rows[0];
        assert_eq!((r["count"].as_i64(), r["results"].as_i64(), r["zeroCount"].as_i64()), (Some(3), Some(3), Some(1)));
        assert_eq!(r["lastAt"], "2026-11-25T12:00:00.000Z");
        assert_eq!(r["createdAt"], NOW, "created once");
        assert_eq!((r["query"].as_str(), r["locale"].as_str(), r["tenantKey"].as_str()), (Some("open data"), Some("th"), Some("pea")));
        assert!(r["documentId"].as_str().unwrap().len() > 10);
    }

    #[test]
    fn workspace_and_language_are_part_of_the_key() {
        let c = db();
        for (t, l) in [("pea", "th"), ("pea", "en"), ("dga", "th")] {
            log(&c, t, "budget", l, 1, 100, NOW).unwrap();
        }
        assert_eq!(list(&c, &q(&[], None)).unwrap().1, 3);
        assert_eq!(list(&c, &q(&[("tenantKey", "eq", "pea")], None)).unwrap().1, 2);
        assert_eq!(list(&c, &q(&[("tenantKey", "eq", "pea"), ("locale", "eq", "en")], None)).unwrap().1, 1);
    }

    #[test]
    fn a_workspace_stops_taking_new_queries_at_its_cap_but_keeps_counting_the_ones_it_has() {
        let c = db();
        assert!(log(&c, "pea", "a", "th", 1, 2, NOW).unwrap());
        assert!(log(&c, "pea", "b", "th", 1, 2, NOW).unwrap());
        assert!(!log(&c, "pea", "c", "th", 1, 2, NOW).unwrap(), "a third distinct query is dropped");
        assert!(log(&c, "pea", "a", "th", 1, 2, NOW).unwrap(), "a known one still counts");
        assert!(log(&c, "dga", "c", "th", 1, 2, NOW).unwrap(), "another workspace has its own room");
        assert_eq!(list(&c, &q(&[("tenantKey", "eq", "pea")], None)).unwrap().1, 2);
    }

    #[test]
    fn lists_sort_most_searched_first_by_default_and_page_with_a_total() {
        let c = db();
        for (word, n) in [("one", 1), ("three", 3), ("two", 2)] {
            for _ in 0..n {
                log(&c, "pea", word, "th", 1, 100, NOW).unwrap();
            }
        }
        let (rows, total) = list(&c, &q(&[], None)).unwrap();
        assert_eq!(rows.iter().map(|r| r["query"].as_str().unwrap()).collect::<Vec<_>>(), ["three", "two", "one"]);
        assert_eq!(total, 3);
        let mut p = q(&[], Some(("query", false)));
        p.page_size = 2;
        p.page = 2;
        let (rows, total) = list(&c, &p).unwrap();
        assert_eq!(rows.iter().map(|r| r["query"].as_str().unwrap()).collect::<Vec<_>>(), ["two"], "page 2 of 2 per page, A to Z: one, three | two");
        assert_eq!(total, 3);
        assert_eq!(list(&c, &q(&[("query", "contains", "t")], None)).unwrap().1, 2, "three and two");
    }

    #[test]
    fn bad_filters_and_sorts_are_refused() {
        let c = db();
        assert!(list(&c, &q(&[("tenant.key", "eq", "pea")], None)).is_err());
        assert!(list(&c, &q(&[("locale", "contains", "t")], None)).is_err());
        assert!(list(&c, &q(&[], Some(("drop table", true)))).is_err());
    }
}
