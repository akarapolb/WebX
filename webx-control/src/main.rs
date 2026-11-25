//! webx-control: the WebX control plane (docs/target-architecture.md, decision
//! D2). Milestone C2 is its first part, the tenant registry: it serves the
//! public tenant list and per-tenant identity that Strapi's /api/tenants/keys
//! and /api/tenants/resolve served, and has an admin API to manage tenants.
//! Identity, bookkeeping and the visitors' runtime routes come in C3 to C5.
//!
//!   webx-control [--db control.db] [--port 1400] [--strict-tenants]   (admin API needs WEBX_CONTROL_ADMIN_TOKEN)
//!   webx-control import --snapshot ../rust-engine/snapshot/snapshot.json [--db control.db]
//!
//! Public (no auth):
//!   GET /api/tenants/keys                        -> {data: [{key, engine, publicTemplate}]}
//!   GET /api/tenants/resolve?tenant=<key>        -> {data: {key, name, brand, contact, ...}}
//!       no tenant named: the first tenant. An unknown key gets the first tenant's answer too
//!       (what Strapi does today), or a 404 with --strict-tenants (decision D9)
//!   POST /api/consent-logs?tenant=<key>          -> 201; a visitor's cookie choice, rate-limited (see visitors.rs)
//! Admin (Authorization: Bearer <WEBX_CONTROL_ADMIN_TOKEN>):
//!   GET /admin/tenants, GET|PUT|DELETE /admin/tenants/<key>

mod audit;
mod identity;
mod jobs;
mod schedules;
mod visitors;
mod records;
mod registry;

use axum::{
    body::Bytes,
    extract::{Path, RawQuery, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{any, get, post},
    Router,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};

struct App {
    conn: Mutex<rusqlite::Connection>,
    /// SHA-256 of the admin token; None switches the admin API off
    admin: Option<[u8; 32]>,
    /// SHA-256 of the service token Studio's governance uses for /internal/*; None switches it off
    service: Option<[u8; 32]>,
    /// public tenant requests answered (shown by /_health, so a test can tell it was used)
    served: std::sync::atomic::AtomicU64,
    /// --strict-tenants: an unknown tenant key is a 404 (decision D9); otherwise it gets the
    /// first tenant's answer, as Strapi and every engine do today (engine-contract.md, section 2)
    strict: bool,
    /// signs the tokens issued for signed-in users (decisions D10, D11)
    key: ed25519_dalek::SigningKey,
    /// seconds a token lives (--token-ttl, default 900)
    token_ttl: i64,
    /// per-address limit on the visitors' write routes
    limiter: Mutex<visitors::RateLimiter>,
}
type Shared = Arc<App>;

fn error(status: StatusCode, name: &str, message: &str) -> Response {
    (status, Json(json!({"data": null, "error": {"status": status.as_u16(), "name": name, "message": message, "details": {}}}))).into_response()
}
fn not_found() -> Response {
    error(StatusCode::NOT_FOUND, "NotFoundError", "Not Found")
}
fn bad(m: String) -> Response {
    error(StatusCode::BAD_REQUEST, "ValidationError", &m)
}
fn fail(m: String) -> Response {
    error(StatusCode::INTERNAL_SERVER_ERROR, "InternalServerError", &m)
}

fn now_iso() -> String {
    let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap();
    let (secs, ms) = (d.as_secs() as i64, d.subsec_millis());
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
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{ms:03}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64
}

fn now_secs() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64
}

/// GET /.well-known/jwks.json: the public key that verifies tokens
async fn jwks(State(app): State<Shared>) -> Response {
    Json(identity::jwks(&app.key.verifying_key())).into_response()
}

/// GET /api/auth/me with a user token: who it is, and for which workspaces
async fn me(State(app): State<Shared>, headers: HeaderMap) -> Response {
    let Some(t) = headers.get("authorization").and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")) else {
        return error(StatusCode::UNAUTHORIZED, "UnauthorizedError", "Missing or invalid token");
    };
    let conn = app.conn.lock().unwrap();
    match identity::verify(&conn, &app.key.verifying_key(), t, now_secs()) {
        Ok(c) => Json(json!({"data": {"email": c["sub"], "name": c["name"], "tenants": c["tenants"], "exp": c["exp"]}})).into_response(),
        Err(m) => error(StatusCode::UNAUTHORIZED, "UnauthorizedError", &m),
    }
}

fn query_param(raw: Option<&str>, name: &str) -> Option<String> {
    raw?.split('&').filter_map(|p| p.split_once('=')).find(|(k, _)| *k == name).map(|(_, v)| v.to_lowercase())
}

/// A query parameter's value as sent (query_param lowercases it, which a tenant key can take but nothing else should).
fn query_param_exact(raw: Option<&str>, name: &str) -> Option<String> {
    raw?.split('&').filter_map(|p| p.split_once('=')).find(|(k, _)| *k == name).map(|(_, v)| percent_decode(v))
}

async fn public(State(app): State<Shared>, Path(what): Path<String>, RawQuery(raw): RawQuery) -> Response {
    app.served.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let conn = app.conn.lock().unwrap();
    match what.as_str() {
        "keys" => match registry::keys(&conn) {
            Ok(v) => Json(v).into_response(),
            Err(m) => fail(m),
        },
        "resolve" => {
            let asked = query_param(raw.as_deref(), "tenant").filter(|t| !t.is_empty());
            let known = match &asked { Some(k) => matches!(registry::get(&conn, k), Ok(Some(_))), None => false };
            let key = match asked {
                Some(k) if known || app.strict => k,
                _ => match registry::default_key(&conn) { Some(k) => k, None => return not_found() },
            };
            match registry::resolve(&conn, &key) {
                Ok(Some(v)) => Json(json!({"data": v})).into_response(),
                Ok(None) => not_found(),
                Err(m) => fail(m),
            }
        }
        _ => not_found(),
    }
}

/// POST /api/consent-logs?tenant=<key>: a visitor's cookie choice, kept as evidence (decision D12). Anonymous and
/// rate-limited per address (X-Forwarded-For's first entry when a proxy sets it). A tenant that is not registered
/// is filed under the first tenant, as Strapi does, or refused with --strict-tenants.
async fn consent_log(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    let who = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()).and_then(|v| v.split(',').next()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "direct".into());
    if !app.limiter.lock().unwrap().allow(&who, now_ms()) {
        return error(StatusCode::TOO_MANY_REQUESTS, "RateLimitError", "Too many requests");
    }
    let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
    let conn = app.conn.lock().unwrap();
    let asked = query_param_exact(raw.as_deref(), "tenant").filter(|t| !t.is_empty());
    let known = match &asked { Some(k) => matches!(registry::get(&conn, k), Ok(Some(_))), None => false };
    let key = match asked {
        Some(k) if known => k,
        Some(_) if app.strict => return not_found(),
        _ => match registry::default_key(&conn) { Some(k) => k, None => return not_found() },
    };
    let doc = match visitors::consent_document(&v, &key) { Ok(d) => d, Err(m) => return bad(m) };
    match records::create(&conn, "consent-log", &doc, &now_iso()) {
        Ok(row) => (StatusCode::CREATED, Json(json!({"data": {"documentId": row["documentId"], "createdAt": row["createdAt"]}}))).into_response(),
        Err(m) => fail(m),
    }
}

fn authorised(app: &App, headers: &HeaderMap) -> Result<(), Response> {
    check_token(app.admin, headers, "the admin API is off: start with WEBX_CONTROL_ADMIN_TOKEN set")
}

fn check_token(want: Option<[u8; 32]>, headers: &HeaderMap, off: &str) -> Result<(), Response> {
    let Some(want) = want else {
        return Err(error(StatusCode::SERVICE_UNAVAILABLE, "ServiceUnavailable", off));
    };
    let got = headers.get("authorization").and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer "));
    // compare hashes, not the tokens themselves
    match got.map(|t| <[u8; 32]>::from(Sha256::digest(t.as_bytes()))) {
        Some(h) if h == want => Ok(()),
        _ => Err(error(StatusCode::UNAUTHORIZED, "UnauthorizedError", "Missing or invalid token")),
    }
}

async fn admin(State(app): State<Shared>, method: axum::http::Method, headers: HeaderMap, Path(rest): Path<String>, body: Bytes) -> Response {
    if let Err(r) = authorised(&app, &headers) {
        return r;
    }
    let conn = app.conn.lock().unwrap();
    let parts: Vec<&str> = rest.trim_end_matches('/').split('/').collect();
    match (method.as_str(), parts.as_slice()) {
        ("GET", ["tenants"]) => match registry::list(&conn) {
            Ok(l) => Json(json!({"data": l.iter().map(|t| t.to_json()).collect::<Vec<_>>()})).into_response(),
            Err(m) => fail(m),
        },
        ("GET", ["tenants", key]) => match registry::get(&conn, key) {
            Ok(Some(t)) => Json(json!({"data": t.to_json()})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["tenants", key]) => {
            let v: Value = match serde_json::from_slice(&body) {
                Ok(v) => v,
                Err(_) => return error(StatusCode::BAD_REQUEST, "ValidationError", "body is not JSON"),
            };
            match registry::upsert(&conn, key, &v, &now_iso()) {
                Ok(created) => {
                    let t = registry::get(&conn, key).ok().flatten().map(|t| t.to_json());
                    (if created { StatusCode::CREATED } else { StatusCode::OK }, Json(json!({"data": t}))).into_response()
                }
                Err(m) => error(StatusCode::BAD_REQUEST, "ValidationError", &m),
            }
        }
        ("GET", ["users"]) => match identity::list(&conn) {
            Ok(l) => Json(json!({"data": l.iter().map(|u| u.to_json()).collect::<Vec<_>>()})).into_response(),
            Err(m) => fail(m),
        },
        ("GET", ["users", email]) => match identity::get(&conn, email) {
            Ok(Some(u)) => Json(json!({"data": u.to_json()})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["users", email]) => {
            let v: Value = match serde_json::from_slice(&body) {
                Ok(v) => v,
                Err(_) => return error(StatusCode::BAD_REQUEST, "ValidationError", "body is not JSON"),
            };
            match identity::upsert(&conn, email, &v, &now_iso()) {
                Ok(created) => {
                    let u = identity::get(&conn, email).ok().flatten().map(|u| u.to_json());
                    (if created { StatusCode::CREATED } else { StatusCode::OK }, Json(json!({"data": u}))).into_response()
                }
                Err(m) => error(StatusCode::BAD_REQUEST, "ValidationError", &m),
            }
        }
        ("DELETE", ["users", email]) => match identity::remove(&conn, email) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        ("DELETE", ["tenants", key]) => match registry::remove(&conn, key) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        _ => not_found(),
    }
}

/// The list query of jobs and schedules: plain parameters (tenantKey, ownerEmail, runState, enabled, page, pageSize) and
/// the `filter=field:op:value` / `sort=createdAt:DESC` form Studio's adapters send. Anything else is refused.
#[derive(Default)]
struct QueueQuery {
    tenant: Option<String>,
    owner: Option<String>,
    state: Option<String>,
    enabled: Option<bool>,
    created_from: Option<i64>,
    page: usize,
    size: usize,
}

fn queue_query(raw: Option<&str>) -> Result<QueueQuery, String> {
    let mut q = QueueQuery { page: 1, size: 25, ..Default::default() };
    for pair in raw.unwrap_or("").split('&').filter(|p| !p.is_empty()) {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = percent_decode(v);
        match k {
            "tenantKey" => q.tenant = Some(v),
            "ownerEmail" => q.owner = Some(v),
            "runState" => q.state = Some(v),
            "enabled" => q.enabled = Some(v == "true"),
            "page" => q.page = v.parse().ok().filter(|n| *n >= 1).unwrap_or(1),
            "pageSize" => q.size = v.parse().ok().filter(|n| *n >= 1).unwrap_or(25).min(200),
            "sort" if v == "createdAt:DESC" => {}
            "filter" => {
                let mut it = v.splitn(3, ':');
                let (field, op, val) = (it.next().unwrap_or(""), it.next().unwrap_or(""), it.next().unwrap_or(""));
                match (field, op) {
                    ("tenantKey", "eq") => q.tenant = Some(val.to_string()),
                    ("ownerEmail", "eq") => q.owner = Some(val.to_string()),
                    ("runState", "eq") => q.state = Some(val.to_string()),
                    ("enabled", "eq") => q.enabled = Some(val == "true"),
                    ("createdAt", "gte") => q.created_from = Some(jobs::parse_iso(val).ok_or("createdAt is not a time")?),
                    _ => return Err(format!("unsupported filter {field}:{op}")),
                }
            }
            _ => return Err(format!("unsupported parameter {k}")),
        }
    }
    Ok(q)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => { out.push(b' '); i += 1; }
            b'%' if i + 2 < b.len() && b.get(i + 1).zip(b.get(i + 2)).is_some_and(|(h, l)| h.is_ascii_hexdigit() && l.is_ascii_hexdigit()) => {
                out.push(u8::from_str_radix(&s[i + 1..i + 3], 16).unwrap());
                i += 3;
            }
            c => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// /internal/audit, for Studio's governance (service token): append a row, list rows, import rows.
///   POST /internal/audit               one row
///   POST /internal/audit/import        an array of rows (a migration; rows keep their own ids and times)
///   GET  /internal/audit?filter=field:op:value&q=&sort=at:desc&page=&pageSize=
///   GET  /internal/audit/<documentId>
async fn internal(State(app): State<Shared>, method: axum::http::Method, headers: HeaderMap, Path(rest): Path<String>, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    if let Err(r) = check_token(app.service, &headers, "the internal API is off: start with WEBX_CONTROL_SERVICE_TOKEN set") {
        return r;
    }
    let parts: Vec<&str> = rest.trim_end_matches('/').split('/').collect();
    let conn = app.conn.lock().unwrap();
    let bad = |m: String| error(StatusCode::BAD_REQUEST, "ValidationError", &m);
    match (method.as_str(), parts.as_slice()) {
        // Studio has just signed a user in (OIDC); this issues the token engines and Studio verify
        ("POST", ["token"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let Some(email) = v.get("email").and_then(Value::as_str) else { return bad("email is required".into()) };
            match identity::issue(&conn, &app.key, email, v.get("tenantKey").and_then(Value::as_str), app.token_ttl, now_secs()) {
                Ok((token, exp)) => Json(json!({"data": {"token": token, "expiresAt": exp}})).into_response(),
                Err(m) => error(StatusCode::FORBIDDEN, "ForbiddenError", &m),
            }
        }
        ("POST", ["audit"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            match audit::create(&conn, v.get("data").unwrap_or(&v), &now_iso()) {
                Ok(row) => Json(json!({"data": row})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("POST", ["audit", "import"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let Some(rows) = v.as_array() else { return bad("body must be an array of rows".into()) };
            let (mut added, mut skipped) = (0, 0);
            for r in rows {
                // a row already imported (same documentId) is skipped, so an import can be run again
                let exists = r.get("documentId").and_then(Value::as_str).is_some_and(|d| matches!(audit::get(&conn, d), Ok(Some(_))));
                if exists { skipped += 1; continue; }
                if let Err(m) = audit::create(&conn, r, &now_iso()) { return bad(format!("row {}: {m}", added + skipped)); }
                added += 1;
            }
            Json(json!({"added": added, "skipped": skipped})).into_response()
        }
        ("GET", ["audit"]) => {
            let mut q = audit::Query { filters: vec![], q: None, sort: ("at".into(), true), page: 1, page_size: 25 };
            for pair in raw.as_deref().unwrap_or("").split('&').filter(|p| !p.is_empty()) {
                let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
                let v = percent_decode(v);
                match k {
                    "filter" => {
                        let mut it = v.splitn(3, ':');
                        match (it.next(), it.next(), it.next()) {
                            (Some(f), Some(o), Some(val)) => q.filters.push(audit::Filter { field: f.into(), op: o.into(), value: val.into() }),
                            _ => return bad("filter is field:op:value".into()),
                        }
                    }
                    "q" => q.q = Some(v),
                    "sort" => { let (f, d) = v.split_once(':').unwrap_or((&v, "asc")); q.sort = (f.to_string(), d == "desc"); }
                    "page" => q.page = v.parse().ok().filter(|n| *n >= 1).unwrap_or(1),
                    "pageSize" => q.page_size = v.parse().ok().filter(|n| *n >= 1).unwrap_or(25).min(500),
                    _ => return bad(format!("unsupported parameter {k}")),
                }
            }
            match audit::list(&conn, &q) {
                Ok((rows, total)) => Json(json!({"data": rows, "meta": {"pagination": {"page": q.page, "pageSize": q.page_size, "pageCount": total.div_ceil(q.page_size), "total": total}}})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("GET", ["records", c]) if records::known(c) => {
            let mut q = records::Query { filters: vec![], sort: None, page: 1, page_size: 25 };
            for pair in raw.as_deref().unwrap_or("").split('&').filter(|p| !p.is_empty()) {
                let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
                let v = percent_decode(v);
                match k {
                    "filter" => {
                        let mut it = v.splitn(3, ':');
                        match (it.next(), it.next(), it.next()) {
                            (Some(f), Some(o), Some(val)) => q.filters.push(records::Filter { field: f.into(), op: o.into(), value: val.into() }),
                            _ => return bad("filter is field:op:value".into()),
                        }
                    }
                    "sort" => { let (f, d) = v.split_once(':').unwrap_or((&v, "asc")); q.sort = Some((f.to_string(), d.eq_ignore_ascii_case("desc"))); }
                    "page" => q.page = v.parse().ok().filter(|n| *n >= 1).unwrap_or(1),
                    "pageSize" => q.page_size = v.parse().ok().filter(|n| *n >= 1).unwrap_or(25).min(500),
                    _ => return bad(format!("unsupported parameter {k}")),
                }
            }
            match records::list(&conn, c, &q) {
                Ok((rows, total)) => Json(json!({"data": rows, "meta": {"pagination": {"page": q.page, "pageSize": q.page_size, "pageCount": total.div_ceil(q.page_size), "total": total}}})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("POST", ["records", c]) if records::known(c) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            match records::create(&conn, c, v.get("data").unwrap_or(&v), &now_iso()) {
                Ok(row) => Json(json!({"data": row})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("POST", ["records", c, "import"]) if records::known(c) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let Some(rows) = v.as_array() else { return bad("body must be an array of records".into()) };
            let (mut added, mut skipped) = (0, 0);
            for (i, r) in rows.iter().enumerate() {
                match records::import(&conn, c, r, &now_iso()) {
                    Ok(true) => added += 1,
                    Ok(false) => skipped += 1,
                    Err(m) => return bad(format!("record {i}: {m}")),
                }
            }
            Json(json!({"added": added, "skipped": skipped})).into_response()
        }
        ("GET", ["records", c, id]) if records::known(c) => match records::get(&conn, c, id) {
            Ok(Some(row)) => Json(json!({"data": row})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["records", c, id]) if records::known(c) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            match records::update(&conn, c, id, v.get("data").unwrap_or(&v), &now_iso()) {
                Ok(Some(row)) => Json(json!({"data": row})).into_response(),
                Ok(None) => not_found(),
                Err(m) => bad(m),
            }
        }
        ("DELETE", ["records", c, id]) if records::known(c) => match records::remove(&conn, c, id) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        // the agent job queue (C5): the Rust worker and Studio use the same lease rules as the Strapi-backed queue
        ("POST", ["jobs"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            match jobs::create(&conn, v.get("data").unwrap_or(&v), now_ms()) {
                Ok(row) => Json(json!({"data": row})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("GET", ["jobs"]) => {
            let q = match queue_query(raw.as_deref()) { Ok(q) => q, Err(m) => return bad(m) };
            match jobs::list(&conn, &jobs::Filters { tenant: q.tenant.as_deref(), owner: q.owner.as_deref(), state: q.state.as_deref(), created_from: q.created_from }, q.page, q.size) {
                Ok((rows, total)) => Json(json!({"data": rows, "meta": {"pagination": {"page": q.page, "pageSize": q.size, "pageCount": total.div_ceil(q.size), "total": total}}})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("GET", ["jobs", id]) => match jobs::get(&conn, id) {
            Ok(Some(row)) => Json(json!({"data": row})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("POST", ["jobs", op @ ("claim" | "heartbeat" | "checkpoint" | "finish" | "control")]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let now = now_ms();
            let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("");
            if *op == "claim" {
                let caps: std::collections::HashMap<String, i64> = v.get("caps").and_then(Value::as_object).map(|m| m.iter().filter_map(|(k, x)| x.as_i64().map(|n| (k.clone(), n))).collect()).unwrap_or_default();
                let limit = v.get("limit").and_then(Value::as_u64).unwrap_or(1) as usize;
                let cap = v.get("defaultCap").and_then(Value::as_i64).unwrap_or(2);
                return match jobs::claim(&conn, s("workerId"), limit, &caps, cap, now) {
                    Ok((rows, reaped)) => Json(json!({"jobs": rows, "reaped": reaped})).into_response(),
                    Err(m) => fail(m),
                };
            }
            if s("documentId").is_empty() { return bad("documentId is required".into()); }
            if *op != "control" && s("leaseToken").is_empty() { return bad("documentId and leaseToken are required".into()); }
            match *op {
                "heartbeat" => match jobs::heartbeat(&conn, s("documentId"), s("leaseToken"), now) {
                    Ok(Some((c, p))) => Json(json!({"ok": true, "cancelRequested": c, "pauseRequested": p})).into_response(),
                    Ok(None) => Json(json!({"ok": false})).into_response(),
                    Err(m) => fail(m),
                },
                "checkpoint" => match jobs::checkpoint(&conn, s("documentId"), s("leaseToken"), &v, now) {
                    Ok(ok) => Json(json!({"ok": ok})).into_response(),
                    Err(m) => fail(m),
                },
                "finish" => match jobs::finish(&conn, s("documentId"), s("leaseToken"), &v, now) {
                    Ok(ok) => Json(json!({"ok": ok})).into_response(),
                    Err(m) => bad(m),
                },
                _ => match jobs::control(&conn, s("documentId"), s("action"), v.get("answer").and_then(Value::as_str), now) {
                    Ok(Some((ok, job))) => Json(json!({"ok": ok, "job": job})).into_response(),
                    Ok(None) => not_found(),
                    Err(m) => bad(m),
                },
            }
        }
        // recurring jobs (C5): the store Studio's tick works against, compare-and-set on runSeq
        ("POST", ["schedules"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            match schedules::create(&conn, v.get("data").unwrap_or(&v), now_ms()) {
                Ok(row) => Json(json!({"data": row})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("GET", ["schedules"]) => {
            let q = match queue_query(raw.as_deref()) { Ok(q) => q, Err(m) => return bad(m) };
            match schedules::list(&conn, q.tenant.as_deref(), q.owner.as_deref(), q.enabled, q.created_from, q.page, q.size) {
                Ok((rows, total)) => Json(json!({"data": rows, "meta": {"pagination": {"page": q.page, "pageSize": q.size, "pageCount": total.div_ceil(q.size), "total": total}}})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("GET", ["schedules", "due"]) => match schedules::due(&conn, now_ms()) {
            Ok(rows) => Json(json!({"schedules": rows})).into_response(),
            Err(m) => fail(m),
        },
        ("POST", ["schedules", op @ ("advance" | "disable")]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let r = if *op == "advance" { schedules::advance(&conn, &v, now_ms()) } else { schedules::disable(&conn, &v, now_ms()) };
            match r {
                Ok(Ok(out)) => Json(out).into_response(),
                Ok(Err(m)) => bad(m),
                Err(m) => fail(m),
            }
        }
        ("GET", ["schedules", id]) => match schedules::get(&conn, id) {
            Ok(Some(row)) => Json(json!({"data": row})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["schedules", id]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            match schedules::update(&conn, id, v.get("data").unwrap_or(&v), now_ms()) {
                Ok(Some(row)) => Json(json!({"data": row})).into_response(),
                Ok(None) => not_found(),
                Err(m) => bad(m),
            }
        }
        ("DELETE", ["schedules", id]) => match schedules::remove(&conn, id) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        ("GET", ["audit", id]) => match audit::get(&conn, id) {
            Ok(Some(row)) => Json(json!({"data": row})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        _ => not_found(),
    }
}

fn arg(name: &str, default: &str) -> String {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == &format!("--{name}")).and_then(|i| args.get(i + 1).cloned()).unwrap_or_else(|| default.to_string())
}

#[tokio::main]
async fn main() {
    let db = arg("db", "control.db");
    if std::env::args().nth(1).as_deref() == Some("import") {
        let path = arg("snapshot", "../rust-engine/snapshot/snapshot.json");
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {path}: {e}"));
        let snap: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path}: {e}"));
        let conn = registry::open(&db).unwrap_or_else(|e| panic!("{e}"));
        let n = registry::import(&conn, &snap, &now_iso()).unwrap_or_else(|e| panic!("{e}"));
        eprintln!("[webx-control] imported {n} tenant(s) from {path} into {db}");
        return;
    }
    let port: u16 = arg("port", "1400").parse().expect("--port");
    let conn = registry::open(&db).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(audit::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(records::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(identity::DDL).unwrap_or_else(|e| panic!("{e}"));
    identity::migrate(&conn).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(jobs::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(schedules::DDL).unwrap_or_else(|e| panic!("{e}"));
    let key = identity::signing_key(&conn, std::env::var("WEBX_CONTROL_SIGNING_KEY").ok().as_deref()).unwrap_or_else(|e| panic!("{e}"));
    let admin_hash = std::env::var("WEBX_CONTROL_ADMIN_TOKEN").ok().filter(|t| !t.is_empty()).map(|t| <[u8; 32]>::from(Sha256::digest(t.as_bytes())));
    let service_hash = std::env::var("WEBX_CONTROL_SERVICE_TOKEN").ok().filter(|t| !t.is_empty()).map(|t| <[u8; 32]>::from(Sha256::digest(t.as_bytes())));
    let n = registry::list(&conn).map(|l| l.len()).unwrap_or(0);
    let app = Router::new()
        .route("/_health", get(|State(app): State<Shared>| async move { Json(json!({"ok": true, "service": "webx-control", "served": app.served.load(std::sync::atomic::Ordering::Relaxed)})) }))
        .route("/api/tenants/:what", get(public))
        .route("/api/consent-logs", post(consent_log).layer(axum::extract::DefaultBodyLimit::max(16 * 1024)))
        .route("/.well-known/jwks.json", get(jwks))
        .route("/api/auth/me", get(me))
        .route("/admin/*rest", any(admin))
        .route("/internal/*rest", any(internal).layer(axum::extract::DefaultBodyLimit::max(32 * 1024 * 1024)))
        .fallback(|| async { not_found() })
        .with_state(Arc::new(App { conn: Mutex::new(conn), admin: admin_hash, service: service_hash, served: Default::default(), strict: std::env::args().any(|a| a == "--strict-tenants"), key, token_ttl: arg("token-ttl", "900").parse().expect("--token-ttl"), limiter: Default::default() }));
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap_or_else(|e| panic!("bind :{port}: {e}"));
    eprintln!("[webx-control] http://localhost:{port} ({n} tenant(s) in {db}; admin API {}, internal API {})", if admin_hash.is_some() { "on" } else { "off" }, if service_hash.is_some() { "on" } else { "off" });
    axum::serve(listener, app).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await.unwrap();
}
