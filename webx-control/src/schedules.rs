//! Recurring assistant jobs (docs/target-architecture.md, track C5): the schedule store Studio's tick works against,
//! a port of strapi-cms/src/api/internal/controllers/agent-schedules.ts. This service only stores schedules and does
//! the compare-and-set moves; working out the next run (the recurrence) stays in Studio, which sends it as `nextRunAt`.
//!
//!  - `due`: enabled schedules whose `nextRunAt` has come, soonest first (this process's clock);
//!  - `advance`: moves a due schedule to its next run and, with a `job`, queues that occurrence's job in the same
//!    transaction. It is a compare-and-set on `runSeq`, so two ticks racing over one occurrence advance it once, and a
//!    job's `idempotencyKey` never gets a second job;
//!  - `disable`: turns a schedule off with a reason, if it is still enabled at the caller's `runSeq`.
use crate::jobs::{self, iso, parse_iso};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map, Value};

pub const DUE_LIMIT: i64 = 50;
/// What a queued occurrence's job may carry (the same list as the Strapi controller).
const JOB_FIELDS: [&str; 15] = [
    "tenantKey", "ownerEmail", "ownerUserId", "engine", "template", "title", "goal", "params", "lang",
    "requiredLevel", "policySnapshot", "onQuestion", "budget", "idempotencyKey", "priority",
];
/// Fields kept in columns; everything else a schedule has lives in one JSON document.
const OWN: [&str; 9] = ["id", "documentId", "tenantKey", "ownerEmail", "enabled", "nextRunAt", "runSeq", "createdAt", "updatedAt"];

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS agent_schedules(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  tenant_key TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_ms INTEGER,
  run_seq INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS agent_schedules_due ON agent_schedules(enabled, next_run_ms);
CREATE INDEX IF NOT EXISTS agent_schedules_owner ON agent_schedules(tenant_key, owner_email);
";

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

const COLS: &str = "id, document_id, tenant_key, owner_email, enabled, next_run_ms, run_seq, created_ms, updated_ms, data";

fn row_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let ms = |i: usize| -> rusqlite::Result<Value> { Ok(r.get::<_, Option<i64>>(i)?.map(|m| Value::String(iso(m))).unwrap_or(Value::Null)) };
    let data = match serde_json::from_str::<Value>(&r.get::<_, String>(9)?) {
        Ok(Value::Object(m)) => m,
        _ => Map::new(),
    };
    let mut o = Map::new();
    o.insert("id".into(), json!(r.get::<_, i64>(0)?));
    o.insert("documentId".into(), json!(r.get::<_, String>(1)?));
    o.insert("tenantKey".into(), json!(r.get::<_, String>(2)?));
    o.insert("ownerEmail".into(), json!(r.get::<_, String>(3)?));
    o.insert("enabled".into(), json!(r.get::<_, i64>(4)? != 0));
    o.insert("nextRunAt".into(), ms(5)?);
    o.insert("runSeq".into(), json!(r.get::<_, i64>(6)?));
    o.insert("createdAt".into(), ms(7)?);
    o.insert("updatedAt".into(), ms(8)?);
    for (k, v) in data {
        o.entry(k).or_insert(v);
    }
    Ok(Value::Object(o))
}

fn text_of<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(Value::as_str).filter(|s| !s.trim().is_empty())
}

fn time_of(v: &Value, k: &str) -> Result<Option<i64>, String> {
    match v.get(k) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => parse_iso(s).map(Some).ok_or_else(|| format!("{k} is not a time")),
        _ => Err(format!("{k} is not a time")),
    }
}

pub fn get(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row(&format!("SELECT {COLS} FROM agent_schedules WHERE document_id = ?1"), [id], row_json).optional().map_err(e)
}

fn data_of(v: &Value) -> Map<String, Value> {
    v.as_object().map(|m| m.iter().filter(|(k, _)| !OWN.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default()
}

/// Save a schedule. `tenantKey` and `ownerEmail` are required; it starts enabled unless `enabled` is false.
pub fn create(conn: &Connection, v: &Value, now: i64) -> Result<Value, String> {
    let tenant = text_of(v, "tenantKey").ok_or("tenantKey is required")?;
    let owner = text_of(v, "ownerEmail").ok_or("ownerEmail is required")?;
    let doc = crate::audit::new_document_id();
    let next = time_of(v, "nextRunAt")?;
    let enabled = v.get("enabled").and_then(Value::as_bool).unwrap_or(true);
    conn.execute(
        "INSERT INTO agent_schedules(document_id, tenant_key, owner_email, enabled, next_run_ms, created_ms, updated_ms, data) VALUES (?1,?2,?3,?4,?5,?6,?6,?7)",
        rusqlite::params![doc, tenant, owner, enabled as i64, next, now, Value::Object(data_of(v)).to_string()],
    )
    .map_err(e)?;
    get(conn, &doc)?.ok_or_else(|| "schedule vanished".to_string())
}

/// Change a schedule from the owner's side (rename, new recurrence, turn on or off). Any change bumps `runSeq`, so a tick
/// that read the old schedule loses its compare-and-set. `null` clears a field.
pub fn update(conn: &Connection, id: &str, v: &Value, now: i64) -> Result<Option<Value>, String> {
    let Some(cur) = get(conn, id)? else { return Ok(None) };
    let mut data = data_of(&cur);
    for (k, x) in data_of(v) {
        if x.is_null() { data.remove(&k); } else { data.insert(k, x); }
    }
    let enabled = v.get("enabled").and_then(Value::as_bool).unwrap_or_else(|| cur["enabled"].as_bool().unwrap_or(true));
    let next = if v.get("nextRunAt").is_some() { time_of(v, "nextRunAt")? } else { time_of(&cur, "nextRunAt")? };
    conn.execute(
        "UPDATE agent_schedules SET enabled=?2, next_run_ms=?3, run_seq=run_seq+1, updated_ms=?4, data=?5 WHERE document_id=?1",
        rusqlite::params![id, enabled as i64, next, now, Value::Object(data).to_string()],
    )
    .map_err(e)?;
    get(conn, id)
}

pub fn remove(conn: &Connection, id: &str) -> Result<bool, String> {
    Ok(conn.execute("DELETE FROM agent_schedules WHERE document_id = ?1", [id]).map_err(e)? > 0)
}

/// Newest first.
pub fn list(conn: &Connection, tenant: Option<&str>, owner: Option<&str>, page: usize, page_size: usize) -> Result<(Vec<Value>, usize), String> {
    let mut wh = vec!["1=1".to_string()];
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    for (col, val) in [("tenant_key", tenant), ("owner_email", owner)] {
        if let Some(v) = val {
            wh.push(format!("{col} = ?"));
            args.push(rusqlite::types::Value::Text(v.to_string()));
        }
    }
    let w = wh.join(" AND ");
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM agent_schedules WHERE {w}"), rusqlite::params_from_iter(args.iter()), |r| r.get(0)).map_err(e)?;
    args.push(rusqlite::types::Value::Integer(page_size as i64));
    args.push(rusqlite::types::Value::Integer(((page - 1) * page_size) as i64));
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM agent_schedules WHERE {w} ORDER BY created_ms DESC, id DESC LIMIT ? OFFSET ?")).map_err(e)?;
    let rows = st.query_map(rusqlite::params_from_iter(args.iter()), row_json).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    Ok((rows, total as usize))
}

/// Enabled schedules whose next run has come, soonest first.
pub fn due(conn: &Connection, now: i64) -> Result<Vec<Value>, String> {
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM agent_schedules WHERE enabled=1 AND next_run_ms IS NOT NULL AND next_run_ms <= ?1 ORDER BY next_run_ms ASC LIMIT {DUE_LIMIT}")).map_err(e)?;
    let rows = st.query_map([now], row_json).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    Ok(rows)
}

fn merge_data(conn: &Connection, id: &str, set: &[(&str, Value)]) -> Result<(), String> {
    let cur: String = conn.query_row("SELECT data FROM agent_schedules WHERE document_id=?1", [id], |r| r.get(0)).map_err(e)?;
    let mut data = match serde_json::from_str::<Value>(&cur) { Ok(Value::Object(m)) => m, _ => Map::new() };
    for (k, v) in set {
        if v.is_null() { data.remove(*k); } else { data.insert((*k).to_string(), v.clone()); }
    }
    conn.execute("UPDATE agent_schedules SET data=?2 WHERE document_id=?1", rusqlite::params![id, Value::Object(data).to_string()]).map_err(e)?;
    Ok(())
}

fn failures(v: &Value) -> i64 {
    v.get("consecutiveFailures").and_then(|x| x.as_f64()).map(|f| f.floor().max(0.0) as i64).unwrap_or(0)
}

/// Move a due schedule to its next run; with `job`, also queue that occurrence's job. `Ok(None)` is a bad request,
/// `Ok(Some(json))` is `{ok: false}` when the compare-and-set lost, else `{ok: true, jobId, existing?}`.
pub fn advance(conn: &Connection, b: &Value, now: i64) -> Result<Result<Value, String>, String> {
    let id = text_of(b, "documentId");
    let seq = b.get("expectedSeq").and_then(Value::as_i64).filter(|n| *n >= 0);
    let next = match time_of(b, "nextRunAt") { Ok(Some(n)) => n, _ => return Ok(Err("documentId, expectedSeq and nextRunAt are required".into())) };
    let (Some(id), Some(seq)) = (id, seq) else { return Ok(Err("documentId, expectedSeq and nextRunAt are required".into())) };
    let job: Option<Map<String, Value>> = b.get("job").and_then(Value::as_object).map(|j| JOB_FIELDS.iter().filter_map(|k| j.get(*k).map(|v| ((*k).to_string(), v.clone()))).collect());
    if let Some(j) = &job {
        let has = |k: &str| j.get(k).map(|v| !v.is_null() && v != &json!("") && v != &json!(0) && v != &json!(false)).unwrap_or(false);
        if !["idempotencyKey", "tenantKey", "ownerEmail", "ownerUserId", "title", "requiredLevel"].iter().all(|k| has(k)) {
            return Ok(Err("job needs idempotencyKey, tenantKey, ownerEmail, ownerUserId, title and requiredLevel".into()));
        }
    }
    conn.execute_batch("BEGIN IMMEDIATE").map_err(e)?;
    let done = (|| -> Result<Value, String> {
        let n = conn.execute("UPDATE agent_schedules SET run_seq=?2+1, next_run_ms=?3, updated_ms=?4 WHERE document_id=?1 AND enabled=1 AND run_seq=?2", rusqlite::params![id, seq, next, now]).map_err(e)?;
        if n != 1 {
            return Ok(json!({"ok": false}));
        }
        let skip = b.get("skipReason").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("skipped");
        let mut set: Vec<(&str, Value)> = vec![
            ("consecutiveFailures", json!(failures(b))),
            ("countedJobId", b.get("countedJobId").cloned().unwrap_or(Value::Null)),
            ("lastSkipReason", if job.is_some() { Value::Null } else { json!(skip) }),
        ];
        let Some(job) = job else {
            merge_data(conn, id, &set)?;
            return Ok(json!({"ok": true, "jobId": null}));
        };
        let key = job["idempotencyKey"].as_str().unwrap_or_default().to_string();
        let existing: Option<String> = conn.query_row("SELECT document_id FROM agent_jobs WHERE json_extract(data,'$.idempotencyKey') = ?1", [&key], |r| r.get(0)).optional().map_err(e)?;
        let job_id = match &existing {
            Some(d) => d.clone(),
            None => {
                let mut j = job.clone();
                j.insert("scheduleId".into(), json!(id));
                jobs::create(conn, &Value::Object(j), now)?["documentId"].as_str().unwrap_or_default().to_string()
            }
        };
        set.push(("lastRunAt", json!(iso(now))));
        set.push(("lastJobId", json!(job_id)));
        merge_data(conn, id, &set)?;
        Ok(json!({"ok": true, "jobId": job_id, "existing": existing.is_some()}))
    })();
    match done {
        Ok(v) => { conn.execute_batch("COMMIT").map_err(e)?; Ok(Ok(v)) }
        Err(m) => { let _ = conn.execute_batch("ROLLBACK"); Err(m) }
    }
}

/// Turn a schedule off with a reason, if it is still enabled at the caller's `runSeq`.
pub fn disable(conn: &Connection, b: &Value, now: i64) -> Result<Result<Value, String>, String> {
    let id = text_of(b, "documentId");
    let seq = b.get("expectedSeq").and_then(Value::as_i64).filter(|n| *n >= 0);
    let reason = text_of(b, "reason");
    let (Some(id), Some(seq), Some(reason)) = (id, seq, reason) else { return Ok(Err("documentId, expectedSeq and reason are required".into())) };
    let n = conn.execute("UPDATE agent_schedules SET enabled=0, run_seq=?2+1, updated_ms=?3 WHERE document_id=?1 AND enabled=1 AND run_seq=?2", rusqlite::params![id, seq, now]).map_err(e)?;
    if n == 1 {
        merge_data(conn, id, &[
            ("disabledReason", json!(reason)),
            ("disabledAt", json!(iso(now))),
            ("consecutiveFailures", json!(failures(b))),
            ("countedJobId", b.get("countedJobId").cloned().unwrap_or(Value::Null)),
        ])?;
    }
    Ok(Ok(json!({"ok": n == 1})))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(jobs::DDL).unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }
    fn sched(c: &Connection, next: &str) -> Value {
        create(c, &json!({"tenantKey": "dga", "ownerEmail": "a@x.org", "name": "Weekly", "template": "audit", "nextRunAt": next, "recurrence": {"freq": "daily"}}), 1000).unwrap()
    }
    fn job(key: &str) -> Value {
        json!({"idempotencyKey": key, "tenantKey": "dga", "ownerEmail": "a@x.org", "ownerUserId": "7", "title": "Weekly", "requiredLevel": "read", "goal": "g", "notAField": 1})
    }
    const T0: i64 = 1_800_000_000_000;

    #[test]
    fn only_enabled_schedules_that_have_come_due_are_listed_soonest_first() {
        let c = db();
        let late = sched(&c, &iso(T0 + 5000));
        let early = sched(&c, &iso(T0 - 9000));
        let off = sched(&c, &iso(T0 - 5000));
        update(&c, off["documentId"].as_str().unwrap(), &json!({"enabled": false}), 2000).unwrap();
        let ids: Vec<String> = due(&c, T0).unwrap().iter().map(|s| s["documentId"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, vec![early["documentId"].as_str().unwrap().to_string()]);
        assert_ne!(late["documentId"], early["documentId"]);
        assert_eq!(due(&c, T0 + 10_000).unwrap().len(), 2);
    }

    #[test]
    fn advance_is_a_compare_and_set_that_queues_the_occurrence_once() {
        let c = db();
        let s = sched(&c, &iso(T0 - 1000));
        let id = s["documentId"].as_str().unwrap();
        let body = json!({"documentId": id, "expectedSeq": 0, "nextRunAt": iso(T0 + 86_400_000), "job": job("k1")});
        let first = advance(&c, &body, T0).unwrap().unwrap();
        assert_eq!(first["ok"], true);
        let job_id = first["jobId"].as_str().unwrap().to_string();
        // a second tick that read the same occurrence loses
        assert_eq!(advance(&c, &body, T0).unwrap().unwrap()["ok"], false);
        let after = get(&c, id).unwrap().unwrap();
        assert_eq!(after["runSeq"], 1);
        assert_eq!(after["lastJobId"], json!(job_id));
        assert!(after["lastRunAt"].is_string());
        let queued = jobs::get(&c, &job_id).unwrap().unwrap();
        assert_eq!(queued["runState"], "queued");
        assert_eq!(queued["scheduleId"], json!(id));
        assert!(queued.get("notAField").is_none(), "only job fields are copied");
        assert!(due(&c, T0).unwrap().is_empty(), "it is not due again until its next run");
    }

    #[test]
    fn a_job_key_that_already_has_a_job_does_not_get_a_second() {
        let c = db();
        let s = sched(&c, &iso(T0 - 1000));
        let id = s["documentId"].as_str().unwrap();
        let a = advance(&c, &json!({"documentId": id, "expectedSeq": 0, "nextRunAt": iso(T0), "job": job("same")}), T0).unwrap().unwrap();
        let b = advance(&c, &json!({"documentId": id, "expectedSeq": 1, "nextRunAt": iso(T0 + 1), "job": job("same")}), T0).unwrap().unwrap();
        assert_eq!(a["jobId"], b["jobId"]);
        assert_eq!(b["existing"], true);
        assert_eq!(jobs::list(&c, &jobs::Filters { tenant: None, owner: None, state: None }, 1, 50).unwrap().1, 1);
    }

    #[test]
    fn a_skipped_occurrence_moves_on_without_a_job_and_says_why() {
        let c = db();
        let s = sched(&c, &iso(T0 - 1000));
        let id = s["documentId"].as_str().unwrap();
        let r = advance(&c, &json!({"documentId": id, "expectedSeq": 0, "nextRunAt": iso(T0 + 1000), "skipReason": "owner_busy", "consecutiveFailures": 2, "countedJobId": "j9"}), T0).unwrap().unwrap();
        assert_eq!(r, json!({"ok": true, "jobId": null}));
        let after = get(&c, id).unwrap().unwrap();
        assert_eq!(after["lastSkipReason"], "owner_busy");
        assert_eq!(after["consecutiveFailures"], 2);
        assert_eq!(after["countedJobId"], "j9");
    }

    #[test]
    fn bad_requests_are_refused_and_change_nothing() {
        let c = db();
        let s = sched(&c, &iso(T0 - 1000));
        let id = s["documentId"].as_str().unwrap();
        assert!(advance(&c, &json!({"documentId": id}), T0).unwrap().is_err());
        assert!(advance(&c, &json!({"documentId": id, "expectedSeq": 0, "nextRunAt": "soon"}), T0).unwrap().is_err());
        let thin = json!({"documentId": id, "expectedSeq": 0, "nextRunAt": iso(T0), "job": {"idempotencyKey": "k"}});
        assert!(advance(&c, &thin, T0).unwrap().is_err());
        assert_eq!(get(&c, id).unwrap().unwrap()["runSeq"], 0);
    }

    #[test]
    fn disable_needs_the_current_seq_and_records_why() {
        let c = db();
        let s = sched(&c, &iso(T0 - 1000));
        let id = s["documentId"].as_str().unwrap();
        assert_eq!(disable(&c, &json!({"documentId": id, "expectedSeq": 5, "reason": "failures"}), T0).unwrap().unwrap()["ok"], false);
        assert_eq!(disable(&c, &json!({"documentId": id, "expectedSeq": 0, "reason": "failures", "consecutiveFailures": 3}), T0).unwrap().unwrap()["ok"], true);
        let after = get(&c, id).unwrap().unwrap();
        assert_eq!(after["enabled"], false);
        assert_eq!(after["disabledReason"], "failures");
        assert_eq!(after["consecutiveFailures"], 3);
        assert!(disable(&c, &json!({"documentId": id}), T0).unwrap().is_err());
        assert!(due(&c, T0 + 1).unwrap().is_empty());
    }

    #[test]
    fn an_owner_change_bumps_the_seq_so_a_stale_tick_loses() {
        let c = db();
        let s = sched(&c, &iso(T0 - 1000));
        let id = s["documentId"].as_str().unwrap();
        let u = update(&c, id, &json!({"name": "Renamed", "recurrence": {"freq": "weekly"}}), 3000).unwrap().unwrap();
        assert_eq!(u["name"], "Renamed");
        assert_eq!(u["runSeq"], 1);
        assert_eq!(advance(&c, &json!({"documentId": id, "expectedSeq": 0, "nextRunAt": iso(T0)}), T0).unwrap().unwrap()["ok"], false);
        assert!(update(&c, "nope", &json!({}), 1).unwrap().is_none());
        assert!(remove(&c, id).unwrap());
        assert!(get(&c, id).unwrap().is_none());
    }
}
