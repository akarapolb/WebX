//! The background job queue (docs/target-architecture.md, track C5, decision D13): the assistant's jobs,
//! leased to workers in slices. A port of the lease rules Studio's workers use against Strapi
//! (strapi-cms/src/api/internal/controllers/agent-jobs.ts), so the Rust worker (webx-agent) and the Node
//! worker see the same behaviour:
//!
//!  - a job is `queued`, `running` (under a lease), `paused`, or ended (`done`, `failed`, `cancelled`);
//!  - every write by a worker is conditional on its lease token: `false` means someone else holds the job now;
//!  - a worker that stops heartbeating loses its lease after `LEASE_MS`; the next claim requeues the job with
//!    backoff, or pauses it when it crashed twice without making progress, or fails it after `MAX_ATTEMPTS`;
//!  - one running job per owner, and a per-workspace limit on running jobs;
//!  - a user's cancel and pause on a running job are flags the worker acts on at its next heartbeat.
//!
//! The clock is this process's, so workers' clocks do not matter. Rows come back in the shape Strapi gives
//! them (camelCase, ISO times), with the fields the queue does not need to look at kept in one JSON document.
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

pub const LEASE_MS: i64 = 90_000;
pub const MAX_ATTEMPTS: i64 = 5;
pub const RECLAIM_BASE_MS: i64 = 30_000;
pub const EVENTS_KEPT: usize = 200;

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS agent_jobs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  tenant_key TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  run_state TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  not_before_ms INTEGER,
  last_slice_ms INTEGER,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL,
  lease_token TEXT,
  lease_owner TEXT,
  lease_expires_ms INTEGER,
  heartbeat_ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  crash_count INTEGER NOT NULL DEFAULT 0,
  crash_seq INTEGER,
  checkpoint_seq INTEGER NOT NULL DEFAULT 0,
  event_seq INTEGER NOT NULL DEFAULT 0,
  cancel_req_ms INTEGER,
  pause_req_ms INTEGER,
  started_ms INTEGER,
  finished_ms INTEGER,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS agent_jobs_state ON agent_jobs(run_state, not_before_ms);
CREATE INDEX IF NOT EXISTS agent_jobs_owner ON agent_jobs(tenant_key, owner_email, run_state);
";

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

/// Epoch milliseconds as an ISO 8601 UTC time.
pub fn iso(ms: i64) -> String {
    let (secs, millis) = (ms.div_euclid(1000), ms.rem_euclid(1000));
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// An ISO 8601 UTC time (as `iso` writes it, also without milliseconds) as epoch milliseconds.
pub fn parse_iso(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let n = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    let millis = if b[19] == b'.' { n(20, 23).unwrap_or(0) } else { 0 };
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2.rem_euclid(400);
    let mp = if mo > 2 { mo - 3 } else { mo + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(((days * 86400 + h * 3600 + mi * 60 + se) * 1000) + millis)
}

fn token() -> String {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).expect("random bytes");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

const COLS: &str = "id, document_id, tenant_key, owner_email, run_state, priority, not_before_ms, last_slice_ms, created_ms, updated_ms, \
    lease_token, lease_owner, lease_expires_ms, heartbeat_ms, attempts, crash_count, crash_seq, checkpoint_seq, event_seq, \
    cancel_req_ms, pause_req_ms, started_ms, finished_ms, data";

fn row_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let ms = |i: usize| -> rusqlite::Result<Value> { Ok(r.get::<_, Option<i64>>(i)?.map(|m| Value::String(iso(m))).unwrap_or(Value::Null)) };
    let txt = |i: usize| -> rusqlite::Result<Value> { Ok(r.get::<_, Option<String>>(i)?.map(Value::String).unwrap_or(Value::Null)) };
    let mut data = match serde_json::from_str::<Value>(&r.get::<_, String>(23)?) {
        Ok(Value::Object(m)) => m,
        _ => Map::new(),
    };
    let mut o = Map::new();
    o.insert("id".into(), json!(r.get::<_, i64>(0)?));
    o.insert("documentId".into(), json!(r.get::<_, String>(1)?));
    o.insert("tenantKey".into(), json!(r.get::<_, String>(2)?));
    o.insert("ownerEmail".into(), json!(r.get::<_, String>(3)?));
    o.insert("runState".into(), json!(r.get::<_, String>(4)?));
    o.insert("priority".into(), json!(r.get::<_, i64>(5)?));
    o.insert("notBefore".into(), ms(6)?);
    o.insert("lastSliceAt".into(), ms(7)?);
    o.insert("createdAt".into(), ms(8)?);
    o.insert("updatedAt".into(), ms(9)?);
    o.insert("leaseToken".into(), txt(10)?);
    o.insert("leaseOwner".into(), txt(11)?);
    o.insert("leaseExpiresAt".into(), ms(12)?);
    o.insert("heartbeatAt".into(), ms(13)?);
    o.insert("attempts".into(), json!(r.get::<_, i64>(14)?));
    o.insert("crashCount".into(), json!(r.get::<_, i64>(15)?));
    o.insert("crashSeq".into(), json!(r.get::<_, Option<i64>>(16)?));
    o.insert("checkpointSeq".into(), json!(r.get::<_, i64>(17)?));
    o.insert("eventSeq".into(), json!(r.get::<_, i64>(18)?));
    o.insert("cancelRequestedAt".into(), ms(19)?);
    o.insert("pauseRequestedAt".into(), ms(20)?);
    o.insert("startedAt".into(), ms(21)?);
    o.insert("finishedAt".into(), ms(22)?);
    // fields the queue does not look at come from the document; a column always wins over a same-named key
    for (k, v) in std::mem::take(&mut data) {
        o.entry(k).or_insert(v);
    }
    Ok(Value::Object(o))
}

pub fn get(conn: &Connection, document_id: &str) -> Result<Option<Value>, String> {
    conn.query_row(&format!("SELECT {COLS} FROM agent_jobs WHERE document_id=?1"), [document_id], row_json).optional().map_err(e)
}

/// Fields that live in the document, not in a column: anything else a caller sends is kept there.
const OWN: [&str; 24] = [
    "id", "documentId", "tenantKey", "ownerEmail", "runState", "priority", "notBefore", "lastSliceAt", "createdAt", "updatedAt", "leaseToken",
    "leaseOwner", "leaseExpiresAt", "heartbeatAt", "attempts", "crashCount", "crashSeq", "checkpointSeq", "eventSeq", "cancelRequestedAt",
    "pauseRequestedAt", "startedAt", "finishedAt", "data",
];

fn text_of<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(Value::as_str).filter(|s| !s.trim().is_empty())
}

/// A job as an engine token for it is minted from (sessions.rs): its workspace and owner as stored, and whether a worker is running
/// it now (it is `running` and the lease has not run out).
pub struct JobRef {
    pub tenant: String,
    pub owner: String,
    pub running: bool,
}

pub fn job_ref(conn: &Connection, document_id: &str, now_ms: i64) -> Result<Option<JobRef>, String> {
    conn.query_row("SELECT tenant_key, owner_email, run_state, lease_expires_ms FROM agent_jobs WHERE document_id=?1", [document_id], |r| {
        let (state, lease): (String, Option<i64>) = (r.get(2)?, r.get(3)?);
        Ok(JobRef { tenant: r.get(0)?, owner: r.get(1)?, running: state == "running" && lease.is_some_and(|l| l > now_ms) })
    })
    .optional()
    .map_err(e)
}

/// Queue a job. `tenantKey` and `ownerEmail` are required; the job starts `queued`, runnable at `notBefore` or now.
pub fn create(conn: &Connection, v: &Value, now: i64) -> Result<Value, String> {
    let tenant = text_of(v, "tenantKey").ok_or("tenantKey is required")?;
    let owner = text_of(v, "ownerEmail").ok_or("ownerEmail is required")?;
    let data: Map<String, Value> = v.as_object().ok_or("a job is an object")?.iter().filter(|(k, _)| !OWN.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect();
    let doc = crate::audit::new_document_id();
    let not_before = text_of(v, "notBefore").map(|s| parse_iso(s).ok_or("notBefore is not a time")).transpose()?;
    conn.execute(
        "INSERT INTO agent_jobs(document_id, tenant_key, owner_email, run_state, priority, not_before_ms, created_ms, updated_ms, data)
         VALUES (?1,?2,?3,'queued',?4,?5,?6,?6,?7)",
        rusqlite::params![doc, tenant, owner, v.get("priority").and_then(Value::as_i64).unwrap_or(0), not_before, now, Value::Object(data).to_string()],
    )
    .map_err(e)?;
    get(conn, &doc)?.ok_or_else(|| "job vanished".to_string())
}

pub struct Filters<'a> {
    pub tenant: Option<&'a str>,
    pub owner: Option<&'a str>,
    pub state: Option<&'a str>,
    /// only jobs created at or after this time (epoch ms)
    pub created_from: Option<i64>,
}

/// Newest first.
pub fn list(conn: &Connection, f: &Filters, page: usize, page_size: usize) -> Result<(Vec<Value>, usize), String> {
    let mut wh = vec!["1=1".to_string()];
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    for (col, val) in [("tenant_key", f.tenant), ("owner_email", f.owner), ("run_state", f.state)] {
        if let Some(v) = val {
            wh.push(format!("{col} = ?"));
            args.push(rusqlite::types::Value::Text(v.to_string()));
        }
    }
    if let Some(ms) = f.created_from {
        wh.push("created_ms >= ?".to_string());
        args.push(rusqlite::types::Value::Integer(ms));
    }
    let w = wh.join(" AND ");
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM agent_jobs WHERE {w}"), rusqlite::params_from_iter(args.iter()), |r| r.get(0)).map_err(e)?;
    args.push(rusqlite::types::Value::Integer(page_size as i64));
    args.push(rusqlite::types::Value::Integer(((page - 1) * page_size) as i64));
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM agent_jobs WHERE {w} ORDER BY created_ms DESC, id DESC LIMIT ? OFFSET ?")).map_err(e)?;
    let rows = st.query_map(rusqlite::params_from_iter(args.iter()), row_json).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    Ok((rows, total as usize))
}

/// Jobs whose worker stopped heartbeating: requeue with backoff, or pause one that keeps crashing at the same
/// point, or fail one that has been lost too many times.
pub fn reap_expired(conn: &Connection, now: i64) -> Result<usize, String> {
    let mut st = conn.prepare("SELECT id, lease_token, attempts, checkpoint_seq, crash_seq, crash_count FROM agent_jobs WHERE run_state='running' AND lease_expires_ms < ?1 LIMIT 50").map_err(e)?;
    let expired: Vec<(i64, Option<String>, i64, i64, Option<i64>, i64)> =
        st.query_map([now], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
    let mut reaped = 0;
    for (id, tok, attempts, cp_seq, crash_seq, crash_count) in expired {
        let no_progress = crash_seq == Some(cp_seq);
        let crashes = if no_progress { crash_count + 1 } else { 1 };
        let attempts = attempts + 1;
        // (state, reason, finished, not_before, lastError)
        let (state, reason, finished, not_before, last_error): (&str, Option<&str>, Option<i64>, Option<i64>, Option<&str>) = if crashes >= 2 {
            ("paused", Some("stuck_crash"), None, None, None)
        } else if attempts > MAX_ATTEMPTS {
            ("failed", Some("worker_lost"), Some(now), None, Some("The worker running this job stopped responding too many times."))
        } else {
            ("queued", None, None, Some(now + RECLAIM_BASE_MS * (1i64 << (attempts - 1).min(20))), None)
        };
        let n = conn
            .execute(
                "UPDATE agent_jobs SET run_state=?1, attempts=?2, crash_count=?3, crash_seq=?4, lease_token=NULL, lease_owner=NULL, lease_expires_ms=NULL,
                 not_before_ms=?5, finished_ms=COALESCE(?6, finished_ms), updated_ms=?7,
                 data=json_set(CASE WHEN ?8 IS NULL THEN json_remove(data, '$.stateReason') ELSE json_set(data, '$.stateReason', ?8) END, '$.lastError', COALESCE(?9, json_extract(data, '$.lastError')))
                 WHERE id=?10 AND run_state='running' AND lease_token IS ?11",
                rusqlite::params![state, attempts, crashes, cp_seq, not_before, finished, now, reason, last_error, id, tok],
            )
            .map_err(e)?;
        reaped += n;
    }
    Ok(reaped)
}

/// Lease up to `limit` runnable jobs to `worker_id`. `caps` maps a workspace to its concurrent-job limit;
/// `default_cap` covers the rest. One running job per owner.
pub fn claim(conn: &Connection, worker_id: &str, limit: usize, caps: &HashMap<String, i64>, default_cap: i64, now: i64) -> Result<(Vec<Value>, usize), String> {
    let reaped = reap_expired(conn, now)?;
    let want = limit.clamp(1, 20);
    let mut st = conn
        .prepare(
            "SELECT id, tenant_key, owner_email FROM agent_jobs WHERE run_state='queued' AND (not_before_ms IS NULL OR not_before_ms <= ?1)
             ORDER BY priority DESC, COALESCE(last_slice_ms, 0) ASC, created_ms ASC, id ASC LIMIT 100",
        )
        .map_err(e)?;
    let queued: Vec<(i64, String, String)> = st.query_map([now], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
    let mut st = conn.prepare("SELECT tenant_key, owner_email FROM agent_jobs WHERE run_state='running'").map_err(e)?;
    let running: Vec<(String, String)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
    let mut per_tenant: HashMap<String, i64> = HashMap::new();
    let mut busy: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (t, o) in running {
        *per_tenant.entry(t).or_default() += 1;
        busy.insert(o.to_lowercase());
    }
    let mut claimed = Vec::new();
    for (id, tenant, owner) in queued {
        if claimed.len() >= want {
            break;
        }
        let cap = caps.get(&tenant).copied().unwrap_or(default_cap);
        if per_tenant.get(&tenant).copied().unwrap_or(0) >= cap || busy.contains(&owner.to_lowercase()) {
            continue;
        }
        let tok = token();
        let n = conn
            .execute(
                "UPDATE agent_jobs SET run_state='running', lease_owner=?1, lease_token=?2, lease_expires_ms=?3, heartbeat_ms=?4, last_slice_ms=?4,
                 started_ms=COALESCE(started_ms, ?4), updated_ms=?4 WHERE id=?5 AND run_state='queued'",
                rusqlite::params![worker_id, tok, now + LEASE_MS, now, id],
            )
            .map_err(e)?;
        if n != 1 {
            continue;
        }
        *per_tenant.entry(tenant).or_default() += 1;
        busy.insert(owner.to_lowercase());
        let row = conn.query_row(&format!("SELECT {COLS} FROM agent_jobs WHERE id=?1"), [id], row_json).map_err(e)?;
        claimed.push(row);
    }
    Ok((claimed, reaped))
}

/// Extend the lease. None: the lease is gone (the job is not running under that token). Some((cancel, pause)): the
/// user's requests for the worker to act on.
pub fn heartbeat(conn: &Connection, document_id: &str, lease_token: &str, now: i64) -> Result<Option<(bool, bool)>, String> {
    let n = conn
        .execute("UPDATE agent_jobs SET lease_expires_ms=?1, heartbeat_ms=?2, updated_ms=?2 WHERE document_id=?3 AND lease_token=?4 AND run_state='running'", rusqlite::params![now + LEASE_MS, now, document_id, lease_token])
        .map_err(e)?;
    if n != 1 {
        return Ok(None);
    }
    let (c, p): (Option<i64>, Option<i64>) = conn.query_row("SELECT cancel_req_ms, pause_req_ms FROM agent_jobs WHERE document_id=?1", [document_id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?;
    Ok(Some((c.is_some(), p.is_some())))
}

fn merge_events(existing: Option<&Value>, incoming: Option<&Value>) -> Value {
    let mut all: Vec<Value> = existing.and_then(Value::as_array).cloned().unwrap_or_default();
    all.extend(incoming.and_then(Value::as_array).cloned().unwrap_or_default());
    let skip = all.len().saturating_sub(EVENTS_KEPT);
    Value::Array(all.split_off(skip))
}

fn data_of(conn: &Connection, document_id: &str) -> Result<Map<String, Value>, String> {
    let s: String = conn.query_row("SELECT data FROM agent_jobs WHERE document_id=?1", [document_id], |r| r.get(0)).map_err(e)?;
    Ok(match serde_json::from_str::<Value>(&s) { Ok(Value::Object(m)) => m, _ => Map::new() })
}
fn i(v: &Value, k: &str) -> i64 {
    v.get(k).and_then(Value::as_i64).unwrap_or(0)
}

/// Save the run's checkpoint, progress and new events under the lease, and extend it. False: the lease is gone.
pub fn checkpoint(conn: &Connection, document_id: &str, lease_token: &str, b: &Value, now: i64) -> Result<bool, String> {
    let holds: bool = conn.query_row("SELECT 1 FROM agent_jobs WHERE document_id=?1 AND lease_token=?2 AND run_state='running'", [document_id, lease_token], |_| Ok(())).optional().map_err(e)?.is_some();
    if !holds {
        return Ok(false);
    }
    let mut data = data_of(conn, document_id)?;
    data.insert("checkpoint".into(), b.get("checkpoint").cloned().unwrap_or(Value::Null));
    data.insert("progress".into(), b.get("progress").cloned().unwrap_or(Value::Null));
    data.insert("tokensUsed".into(), json!(i(b, "tokensUsed")));
    let ev = merge_events(data.get("events"), b.get("events"));
    data.insert("events".into(), ev);
    if b.get("clearAnswer").and_then(Value::as_bool).unwrap_or(false) {
        data.insert("pendingAnswer".into(), Value::Null);
    }
    let n = conn
        .execute(
            "UPDATE agent_jobs SET checkpoint_seq=?1, event_seq=?2, lease_expires_ms=?3, heartbeat_ms=?4, last_slice_ms=?4, updated_ms=?4, data=?5
             WHERE document_id=?6 AND lease_token=?7 AND run_state='running'",
            rusqlite::params![i(b, "checkpointSeq"), i(b, "eventSeq"), now + LEASE_MS, now, Value::Object(data).to_string(), document_id, lease_token],
        )
        .map_err(e)?;
    Ok(n == 1)
}

/// End a slice: back to the queue, or paused, done, failed or cancelled. Releases the lease. False: the lease is gone.
pub fn finish(conn: &Connection, document_id: &str, lease_token: &str, b: &Value, now: i64) -> Result<bool, String> {
    let state = b.get("runState").and_then(Value::as_str).unwrap_or("");
    if !["queued", "paused", "done", "failed", "cancelled"].contains(&state) {
        return Err("invalid runState".into());
    }
    let holds: bool = conn.query_row("SELECT 1 FROM agent_jobs WHERE document_id=?1 AND lease_token=?2 AND run_state='running'", [document_id, lease_token], |_| Ok(())).optional().map_err(e)?.is_some();
    if !holds {
        return Ok(false);
    }
    let mut data = data_of(conn, document_id)?;
    for (k, from) in [("outcome", "outcome"), ("stateReason", "stateReason"), ("lastError", "lastError")] {
        data.insert(k.into(), b.get(from).cloned().unwrap_or(Value::Null));
    }
    for k in ["checkpoint", "progress", "tokensUsed", "result"] {
        if let Some(v) = b.get(k) {
            data.insert(k.into(), v.clone());
        }
    }
    let ev = merge_events(data.get("events"), b.get("events"));
    data.insert("events".into(), ev);
    let terminal = matches!(state, "done" | "failed" | "cancelled");
    let not_before = if state == "queued" { text_of(b, "notBefore").and_then(parse_iso) } else { None };
    // a request that arrives while a slice ends as "queued" is kept for the next slice to act on
    let clear_requests = state != "queued";
    let n = conn
        .execute(
            "UPDATE agent_jobs SET run_state=?1, not_before_ms=?2, lease_token=NULL, lease_owner=NULL, lease_expires_ms=NULL, heartbeat_ms=?3, last_slice_ms=?3,
             updated_ms=?3, crash_count=0, event_seq=?4, checkpoint_seq=COALESCE(?5, checkpoint_seq),
             cancel_req_ms=CASE WHEN ?6 THEN NULL ELSE cancel_req_ms END, pause_req_ms=CASE WHEN ?6 THEN NULL ELSE pause_req_ms END,
             finished_ms=CASE WHEN ?7 THEN ?3 ELSE finished_ms END, data=?8
             WHERE document_id=?9 AND lease_token=?10 AND run_state='running'",
            rusqlite::params![state, not_before, now, i(b, "eventSeq"), b.get("checkpointSeq").and_then(Value::as_i64), clear_requests, terminal, Value::Object(data).to_string(), document_id, lease_token],
        )
        .map_err(e)?;
    Ok(n == 1)
}

/// A user's request, already authorised by Studio: cancel, pause, resume, or answer a question. A queued or paused job
/// changes state here; a running one gets a flag its worker acts on at the next heartbeat. Returns whether it applied,
/// and the job (None when there is no such job).
pub fn control(conn: &Connection, document_id: &str, action: &str, answer: Option<&str>, now: i64) -> Result<Option<(bool, Value)>, String> {
    let Some(cur) = get(conn, document_id)? else { return Ok(None) };
    let state = cur["runState"].as_str().unwrap_or("").to_string();
    let reason = cur.get("stateReason").and_then(Value::as_str).map(str::to_string);
    let set_reason = |conn: &Connection, r: Option<&str>| -> Result<(), String> {
        conn.execute(
            "UPDATE agent_jobs SET data = CASE WHEN ?1 IS NULL THEN json_remove(data, '$.stateReason') ELSE json_set(data, '$.stateReason', ?1) END WHERE document_id=?2",
            rusqlite::params![r, document_id],
        )
        .map(|_| ())
        .map_err(e)
    };
    let ok = match action {
        "cancel" => match state.as_str() {
            "queued" | "paused" => {
                conn.execute("UPDATE agent_jobs SET run_state='cancelled', finished_ms=?1, not_before_ms=NULL, updated_ms=?1 WHERE document_id=?2", rusqlite::params![now, document_id]).map_err(e)?;
                set_reason(conn, Some("user"))?;
                true
            }
            "running" => conn.execute("UPDATE agent_jobs SET cancel_req_ms=?1, updated_ms=?1 WHERE document_id=?2 AND run_state='running'", rusqlite::params![now, document_id]).map_err(e)? == 1,
            _ => false,
        },
        "pause" => match state.as_str() {
            "queued" => {
                conn.execute("UPDATE agent_jobs SET run_state='paused', updated_ms=?1 WHERE document_id=?2", rusqlite::params![now, document_id]).map_err(e)?;
                set_reason(conn, Some("user"))?;
                true
            }
            "running" => conn.execute("UPDATE agent_jobs SET pause_req_ms=?1, updated_ms=?1 WHERE document_id=?2 AND run_state='running'", rusqlite::params![now, document_id]).map_err(e)? == 1,
            _ => false,
        },
        "resume" if state == "paused" => {
            conn.execute("UPDATE agent_jobs SET run_state='queued', not_before_ms=NULL, pause_req_ms=NULL, crash_count=0, updated_ms=?1 WHERE document_id=?2", rusqlite::params![now, document_id]).map_err(e)?;
            set_reason(conn, None)?;
            true
        }
        "resume" => false,
        "answer" => {
            let a = answer.map(str::trim).filter(|a| !a.is_empty()).ok_or("answer is required")?;
            if state == "paused" && reason.as_deref() == Some("needs_input") {
                let a: String = a.chars().take(4000).collect();
                conn.execute("UPDATE agent_jobs SET run_state='queued', not_before_ms=NULL, updated_ms=?1, data=json_set(json_remove(data, '$.stateReason'), '$.pendingAnswer', ?2) WHERE document_id=?3", rusqlite::params![now, a, document_id]).map_err(e)?;
                true
            } else {
                false
            }
        }
        _ => return Err("unknown action".into()),
    };
    Ok(Some((ok, get(conn, document_id)?.unwrap_or(Value::Null))))
}

#[cfg(test)]
mod tests {
    use super::*;
    const T0: i64 = 1_800_000_000_000;
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        c
    }
    fn job(c: &Connection, tenant: &str, owner: &str) -> String {
        create(c, &json!({"tenantKey": tenant, "ownerEmail": owner, "goal": "do it", "requiredLevel": "read", "params": {"a": 1}}), T0).unwrap()["documentId"].as_str().unwrap().to_string()
    }
    fn lease(c: &Connection, worker: &str, now: i64) -> Option<Value> {
        claim(c, worker, 1, &HashMap::new(), 5, now).unwrap().0.into_iter().next()
    }

    #[test]
    fn times_round_trip_through_iso() {
        for ms in [0, T0, 951_782_400_123, 1_709_251_199_999] {
            assert_eq!(parse_iso(&iso(ms)), Some(ms), "{ms}");
        }
        assert_eq!(iso(T0), "2027-01-15T08:00:00.000Z");
        assert_eq!(parse_iso("2026-11-24T10:00:00Z"), Some(parse_iso("2026-11-24T10:00:00.000Z").unwrap()));
        assert_eq!(parse_iso("not a time"), None);
    }

    #[test]
    fn a_job_is_created_queued_with_its_fields_kept() {
        let c = db();
        let j = create(&c, &json!({"tenantKey": "dga", "ownerEmail": "ann@example.org", "goal": "g", "params": {"x": [1, 2]}, "runState": "done", "attempts": 9}), T0).unwrap();
        assert_eq!((j["runState"].clone(), j["attempts"].clone(), j["goal"].clone(), j["params"].clone()), (json!("queued"), json!(0), json!("g"), json!({"x": [1, 2]})), "a caller cannot choose the state or the attempts");
        assert_eq!(j["createdAt"], iso(T0));
        assert!(create(&c, &json!({"ownerEmail": "a@b.co"}), T0).is_err() && create(&c, &json!({"tenantKey": "dga"}), T0).is_err());
        assert_eq!(list(&c, &Filters { tenant: Some("dga"), owner: None, state: Some("queued"), created_from: None }, 1, 10).unwrap().1, 1);
    }

    #[test]
    fn claim_leases_a_queued_job_once_and_only_to_one_worker() {
        let c = db();
        let id = job(&c, "dga", "ann@example.org");
        let j = lease(&c, "w1", T0).expect("claimed");
        assert_eq!((j["documentId"].as_str().unwrap(), j["runState"].clone(), j["leaseOwner"].clone()), (id.as_str(), json!("running"), json!("w1")));
        assert_eq!(j["leaseToken"].as_str().unwrap().len(), 32);
        assert_eq!(j["leaseExpiresAt"], iso(T0 + LEASE_MS));
        assert!(lease(&c, "w2", T0).is_none(), "already leased");
    }

    #[test]
    fn one_running_job_per_owner_and_a_cap_per_workspace() {
        let c = db();
        job(&c, "dga", "ann@example.org");
        job(&c, "dga", "ann@example.org");
        job(&c, "dga", "bob@example.org");
        job(&c, "dga", "cy@example.org");
        let (got, _) = claim(&c, "w", 10, &HashMap::new(), 2, T0).unwrap();
        assert_eq!(got.len(), 2, "the workspace cap is 2, and Ann's second job waits for her first");
        let owners: Vec<&str> = got.iter().map(|j| j["ownerEmail"].as_str().unwrap()).collect();
        assert!(owners.contains(&"ann@example.org") && owners.contains(&"bob@example.org"), "{owners:?}");
        let caps: HashMap<String, i64> = [("dga".to_string(), 3)].into();
        assert_eq!(claim(&c, "w", 10, &caps, 2, T0).unwrap().0.len(), 1, "a cap of 3 for dga lets the next one in (Cy)");
    }

    #[test]
    fn a_job_not_yet_due_waits() {
        let c = db();
        create(&c, &json!({"tenantKey": "dga", "ownerEmail": "a@b.co", "notBefore": iso(T0 + 5_000)}), T0).unwrap();
        assert!(lease(&c, "w", T0).is_none());
        assert!(lease(&c, "w", T0 + 5_000).is_some());
    }

    #[test]
    fn every_write_needs_the_lease_token() {
        let c = db();
        let id = job(&c, "dga", "a@b.co");
        let tok = lease(&c, "w1", T0).unwrap()["leaseToken"].as_str().unwrap().to_string();
        assert_eq!(heartbeat(&c, &id, "wrong", T0 + 1).unwrap(), None);
        assert!(!checkpoint(&c, &id, "wrong", &json!({"checkpoint": {}}), T0 + 1).unwrap());
        assert!(!finish(&c, &id, "wrong", &json!({"runState": "done"}), T0 + 1).unwrap());
        assert_eq!(heartbeat(&c, &id, &tok, T0 + 10_000).unwrap(), Some((false, false)));
        assert_eq!(get(&c, &id).unwrap().unwrap()["leaseExpiresAt"], iso(T0 + 10_000 + LEASE_MS), "a heartbeat extends the lease");
        assert!(finish(&c, &id, &tok, &json!({"runState": "bogus"}), T0).is_err());
    }

    #[test]
    fn a_checkpoint_keeps_the_snapshot_progress_and_the_last_events() {
        let c = db();
        let id = job(&c, "dga", "a@b.co");
        let tok = lease(&c, "w", T0).unwrap()["leaseToken"].as_str().unwrap().to_string();
        let events: Vec<Value> = (0..150).map(|n| json!({"seq": n})).collect();
        assert!(checkpoint(&c, &id, &tok, &json!({"checkpoint": {"turn": 3}, "checkpointSeq": 3, "eventSeq": 150, "progress": {"turns": 3}, "tokensUsed": 42, "events": events}), T0 + 1).unwrap());
        let more: Vec<Value> = (150..300).map(|n| json!({"seq": n})).collect();
        assert!(checkpoint(&c, &id, &tok, &json!({"checkpoint": {"turn": 4}, "checkpointSeq": 4, "eventSeq": 300, "events": more}), T0 + 2).unwrap());
        let j = get(&c, &id).unwrap().unwrap();
        assert_eq!((j["checkpoint"].clone(), j["checkpointSeq"].clone(), j["tokensUsed"].clone()), (json!({"turn": 4}), json!(4), json!(0)));
        let ev = j["events"].as_array().unwrap();
        assert_eq!((ev.len(), ev[0]["seq"].clone(), ev[ev.len() - 1]["seq"].clone()), (EVENTS_KEPT, json!(100), json!(299)), "the newest 200 events");
        assert_eq!(j["params"], json!({"a": 1}), "fields the checkpoint does not touch stay");
    }

    #[test]
    fn finishing_releases_the_lease_and_ends_or_requeues() {
        let c = db();
        let id = job(&c, "dga", "a@b.co");
        let tok = lease(&c, "w", T0).unwrap()["leaseToken"].as_str().unwrap().to_string();
        assert!(finish(&c, &id, &tok, &json!({"runState": "queued", "notBefore": iso(T0 + 60_000), "eventSeq": 1, "checkpoint": {"s": 1}, "checkpointSeq": 7}), T0 + 5).unwrap());
        let j = get(&c, &id).unwrap().unwrap();
        assert_eq!((j["runState"].clone(), j["leaseToken"].clone(), j["notBefore"].clone(), j["checkpointSeq"].clone()), (json!("queued"), Value::Null, json!(iso(T0 + 60_000)), json!(7)));
        assert!(lease(&c, "w", T0 + 10).is_none(), "not due yet");
        let tok = lease(&c, "w", T0 + 60_000).unwrap()["leaseToken"].as_str().unwrap().to_string();
        assert!(finish(&c, &id, &tok, &json!({"runState": "done", "outcome": "completed", "result": {"summary": "ok"}, "eventSeq": 2}), T0 + 61_000).unwrap());
        let j = get(&c, &id).unwrap().unwrap();
        assert_eq!((j["runState"].clone(), j["outcome"].clone(), j["finishedAt"].clone(), j["result"].clone()), (json!("done"), json!("completed"), json!(iso(T0 + 61_000)), json!({"summary": "ok"})));
        assert!(!finish(&c, &id, &tok, &json!({"runState": "done"}), T0 + 62_000).unwrap(), "the lease is gone");
    }

    #[test]
    fn a_lost_worker_requeues_with_backoff_then_pauses_a_job_that_keeps_crashing() {
        let c = db();
        let id = job(&c, "dga", "a@b.co");
        let first = lease(&c, "w1", T0).unwrap();
        // the worker dies; the lease runs out; the next claim reaps and requeues with a 30 s backoff
        let later = T0 + LEASE_MS + 1;
        let (none, reaped) = claim(&c, "w2", 1, &HashMap::new(), 5, later).unwrap();
        assert_eq!((none.len(), reaped), (0, 1), "requeued, but not due yet");
        let j = get(&c, &id).unwrap().unwrap();
        assert_eq!((j["runState"].clone(), j["attempts"].clone(), j["notBefore"].clone()), (json!("queued"), json!(1), json!(iso(later + RECLAIM_BASE_MS))));
        assert_ne!(first["leaseToken"], j["leaseToken"]);
        // it is claimed again, makes no progress, and dies again: paused as stuck
        lease(&c, "w2", later + RECLAIM_BASE_MS).unwrap();
        let (_, reaped) = claim(&c, "w3", 1, &HashMap::new(), 5, later + RECLAIM_BASE_MS + LEASE_MS + 1).unwrap();
        assert_eq!(reaped, 1);
        let j = get(&c, &id).unwrap().unwrap();
        assert_eq!((j["runState"].clone(), j["stateReason"].clone()), (json!("paused"), json!("stuck_crash")));
    }

    #[test]
    fn a_job_that_makes_progress_between_crashes_is_retried_until_the_attempts_run_out() {
        let c = db();
        let id = job(&c, "dga", "a@b.co");
        let mut now = T0;
        for n in 1..=MAX_ATTEMPTS + 1 {
            let j = lease(&c, "w", now).unwrap();
            let tok = j["leaseToken"].as_str().unwrap().to_string();
            // progress each time, so it never counts as stuck
            assert!(checkpoint(&c, &id, &tok, &json!({"checkpoint": {}, "checkpointSeq": n * 10}), now + 1).unwrap());
            now += LEASE_MS + 2;
            claim(&c, "other", 1, &HashMap::new(), 5, now).unwrap();
            let state = get(&c, &id).unwrap().unwrap()["runState"].clone();
            if state == json!("failed") {
                let j = get(&c, &id).unwrap().unwrap();
                assert_eq!((n, j["stateReason"].clone()), (MAX_ATTEMPTS + 1, json!("worker_lost")));
                return;
            }
            now += RECLAIM_BASE_MS * (1 << n) + 1;
        }
        panic!("the job was never failed");
    }

    #[test]
    fn users_can_cancel_pause_resume_and_answer() {
        let c = db();
        let id = job(&c, "dga", "a@b.co");
        let (ok, j) = control(&c, &id, "pause", None, T0 + 1).unwrap().unwrap();
        assert_eq!((ok, j["runState"].clone(), j["stateReason"].clone()), (true, json!("paused"), json!("user")));
        let (ok, j) = control(&c, &id, "resume", None, T0 + 2).unwrap().unwrap();
        assert_eq!((ok, j["runState"].clone(), j["stateReason"].clone()), (true, json!("queued"), Value::Null));
        assert!(!control(&c, &id, "resume", None, T0 + 3).unwrap().unwrap().0, "only a paused job resumes");

        // a running job only gets a flag, which its heartbeat reports
        let tok = lease(&c, "w", T0 + 10).unwrap()["leaseToken"].as_str().unwrap().to_string();
        assert!(control(&c, &id, "pause", None, T0 + 11).unwrap().unwrap().0);
        assert_eq!(heartbeat(&c, &id, &tok, T0 + 12).unwrap(), Some((false, true)));
        assert!(control(&c, &id, "cancel", None, T0 + 13).unwrap().unwrap().0);
        assert_eq!(heartbeat(&c, &id, &tok, T0 + 14).unwrap(), Some((true, true)));
        // ending the slice paused clears the requests
        assert!(finish(&c, &id, &tok, &json!({"runState": "paused", "stateReason": "needs_input", "eventSeq": 1}), T0 + 15).unwrap());
        let j = get(&c, &id).unwrap().unwrap();
        assert_eq!((j["cancelRequestedAt"].clone(), j["pauseRequestedAt"].clone()), (Value::Null, Value::Null));
        // a question: answered only while the job waits for input
        assert!(control(&c, &id, "answer", Some("  "), T0 + 16).is_err());
        let (ok, j) = control(&c, &id, "answer", Some("Use the blue one"), T0 + 17).unwrap().unwrap();
        assert_eq!((ok, j["runState"].clone(), j["pendingAnswer"].clone(), j["stateReason"].clone()), (true, json!("queued"), json!("Use the blue one"), Value::Null));
        assert!(!control(&c, &id, "answer", Some("again"), T0 + 18).unwrap().unwrap().0, "no longer waiting");
        // cancel a queued job
        let (ok, j) = control(&c, &id, "cancel", None, T0 + 19).unwrap().unwrap();
        assert_eq!((ok, j["runState"].clone(), j["stateReason"].clone(), j["finishedAt"].clone()), (true, json!("cancelled"), json!("user"), json!(iso(T0 + 19))));
        assert!(control(&c, "nope", "cancel", None, T0).unwrap().is_none());
        assert!(control(&c, &id, "explode", None, T0).is_err());
    }
}
