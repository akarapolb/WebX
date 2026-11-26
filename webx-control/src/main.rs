//! webx-control: the WebX control plane (docs/target-architecture.md, decision
//! D2). Milestone C2 is its first part, the tenant registry: it serves the
//! public tenant list and per-tenant identity that Strapi's /api/tenants/keys
//! and /api/tenants/resolve served, and has an admin API to manage tenants.
//! Identity, bookkeeping and the visitors' runtime routes come in C3 to C5.
//!
//!   webx-control [--db control.db] [--port 1400] [--host 127.0.0.1] [--strict-tenants]   (admin API needs WEBX_CONTROL_ADMIN_TOKEN)
//!   webx-control import --snapshot ../rust-engine/snapshot/snapshot.json [--db control.db]
//!
//! Public (no auth):
//!   GET /api/tenants/keys                        -> {data: [{key, engine, publicTemplate}]}
//!   GET /api/tenants/resolve?tenant=<key>        -> {data: {key, name, brand, contact, ...}}
//!       no tenant named: the first tenant. An unknown key gets the first tenant's answer too
//!       (what Strapi does today), or a 404 with --strict-tenants (decision D9)
//!   POST /api/consent-logs?tenant=<key>          -> 201; a visitor's cookie choice, rate-limited (see visitors.rs)
//!   POST /api/search-stats/log?tenant=<key>      -> 204; what a visitor searched for, counted anonymously (see search_stats.rs)
//!   GET  /api/captcha                            -> {data: {id, question}}; a sum the form routes ask to be answered (see captcha.rs)
//!   POST /api/assist/ask|simplify|translate|find, GET /api/assist/status  -> the visitors' assistant (see assist.rs, llm.rs)
//!   POST /api/complaints|applications|registrations|contact-messages?tenant=<key>  -> 201; a visitor's form (see forms.rs)
//!   POST /api/complaints|applications/submit?tenant=<key> (multipart)               -> 201; the form with a file attached
//!   GET  /api/complaints|applications/track/<ref>?tenant=<key>                      -> where a submission stands
//!       a browser may call these from the origins in WEBX_PUBLIC_SITE_ORIGINS (and the local development ones)
//! Admin (Authorization: Bearer <WEBX_CONTROL_ADMIN_TOKEN>):
//!   GET /admin/tenants, GET|PUT|DELETE /admin/tenants/<key>
//!   GET|PUT|DELETE /admin/tenants/<key>/identity   how a workspace signs in: mode, provider, client, MFA policy (see sessions.rs)
//!   GET /admin/users, GET|PUT|DELETE /admin/users/<email>, GET|PUT /admin/users/<email>/identities
//! Identity, in steps (docs/c4-identity-plan.md): tokens and keys are identity.rs, sessions are sessions.rs, roles are roles.rs.
//!   GET /.well-known/jwks.json, GET /api/auth/me          public / with a token
//!   POST /internal/token, POST /internal/sessions ..., POST /internal/engine-token, GET /internal/tenants/<key>/identity
//!                                                           WEBX_CONTROL_AUTH_TOKEN (Studio's broker credential)
//!   GET /engine/users/<email>, /engine/roles, /engine/tenants/<key>/custom-roles   WEBX_CONTROL_ENGINE_TOKEN (read-only)
//!   webx-control keygen                                     prints 32 random bytes, base64: a WEBX_CONTROL_SIGNING_KEY or WEBX_CONTROL_SECRET_KEY

mod assist;
mod audit;
mod files;
mod forms;
mod llm;
mod mailer;
mod mfa;
mod outbox;
mod pii;
mod captcha;
mod identity;
mod jobs;
mod roles;
mod schedules;
mod search_stats;
mod secrets;
mod sessions;
mod visitors;
mod records;
mod registry;

use axum::{
    body::Bytes,
    extract::{ConnectInfo, Multipart, Path, RawQuery, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{any, get, post},
    Router,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
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
    /// signs the tokens issued for signed-in users, and the key before it while a rotation settles (decisions D10, D11)
    keys: identity::Keys,
    /// SHA-256 of the broker credential (WEBX_CONTROL_AUTH_TOKEN), held by Studio alone: it makes tokens and sessions. None: the
    /// session routes are off, and /internal/token takes the service token as it always did
    auth: Option<[u8; 32]>,
    /// SHA-256 of the engines' read-only credential (WEBX_CONTROL_ENGINE_TOKEN); None switches /engine off
    engine: Option<[u8; 32]>,
    /// how long tokens and sessions live (--token-ttl, --session-idle, --session-max, --refresh-grace, --engine-token-ttl)
    sessions: sessions::Config,
    /// what control's own secrets are kept under (WEBX_CONTROL_SECRET_KEY): providers' client secrets, and MFA. None: those cannot
    /// be stored or read
    secrets: Option<secrets::SecretKey>,
    /// per-address limit on the visitors' write routes
    limiter: Mutex<visitors::RateLimiter>,
    /// how many reverse proxies of ours stand in front (WEBX_TRUSTED_PROXIES): which X-Forwarded-For entry may be believed
    proxies: usize,
    /// browser origins allowed to call the visitors' routes (CORS; WEBX_PUBLIC_SITE_ORIGINS)
    origins: Vec<String>,
    /// the captcha challenges handed out and not yet answered
    captchas: Mutex<captcha::Captchas>,
    /// whether the form routes ask for the captcha (WEBX_CAPTCHA=off turns it off, for development)
    captcha_on: bool,
    /// the key personal data is encrypted with (WEBX_PII_KEY); without it the form collections refuse every read and write
    pii: Option<pii::Pii>,
    /// where a new complaint is reported to (WEBX_COMPLAINT_NOTIFY_EMAIL), as in Strapi
    notify_to: Option<String>,
    /// the visitors' assistant: its models, and where a workspace's content is read from
    assist: Arc<assist::Settings>,
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

/// GET /.well-known/jwks.json: the public keys that verify tokens (the current one and, while a rotation settles, the one before).
/// A verifier may keep the answer five minutes, and fetches again when a token names a `kid` it does not have.
async fn jwks(State(app): State<Shared>) -> Response {
    ([(header::CACHE_CONTROL, "public, max-age=300")], Json(app.keys.jwks())).into_response()
}

/// GET /api/auth/me with a user token: who it is, in which workspace, and for which. A token whose session has ended, or whose
/// user was disabled or deleted, is refused here before it expires.
async fn me(State(app): State<Shared>, headers: HeaderMap) -> Response {
    let Some(t) = headers.get("authorization").and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")) else {
        return error(StatusCode::UNAUTHORIZED, "UnauthorizedError", "Missing or invalid token");
    };
    let conn = app.conn.lock().unwrap();
    match sessions::verify_access(&conn, &app.keys, t, now_secs()) {
        Ok(c) => Json(json!({"data": {"email": c["sub"], "name": c["name"], "uid": c["uid"], "tenants": c["tenants"], "superAdmin": c["sa"], "tid": c["tid"], "sid": c["sid"], "role": c["role"], "crole": c["crole"], "mfa": c["mfa"], "amr": c["amr"], "scope": c["scope"], "exp": c["exp"]}})).into_response(),
        Err(m) => error(StatusCode::UNAUTHORIZED, "UnauthorizedError", &m),
    }
}

/// /api/auth/mfa/<what> with the person's own access token (C4 step 4): their second factor. Studio calls these for the person; an
/// `enroll` session (a workspace requires a second factor and its grace period is over) may call them and nothing else.
///   GET  status            {enrolled, pendingEnrolment, recoveryCodesLeft, lockedUntil, required, deadline, overdue, scope, sessionMfa}
///   POST start   {code?}   {secret, otpauthUri}; with a factor already set up, a code from it or a recovery code
///   POST confirm {code}    {recoveryCodes, accessToken, accessExpiresAt}: the session is multi-factor and full from now
///   POST disable {code}    {enrolled: false}
async fn my_mfa(State(app): State<Shared>, method: Method, headers: HeaderMap, Path(what): Path<String>, body: Bytes) -> Response {
    let Some(t) = headers.get("authorization").and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")) else {
        return error(StatusCode::UNAUTHORIZED, "UnauthorizedError", "Missing or invalid token");
    };
    let code = serde_json::from_slice::<Value>(&body).ok().and_then(|v| v.get("code").and_then(Value::as_str).map(String::from));
    let conn = app.conn.lock().unwrap();
    let now = now_secs();
    let r = match (method.as_str(), what.as_str(), code) {
        ("GET", "status", _) => sessions::mfa_status(&conn, &app.keys, t, now),
        ("POST", "start", code) => sessions::mfa_start(&conn, &app.keys, app.secrets.as_ref(), t, code.as_deref(), now),
        ("POST", "confirm", Some(c)) => sessions::mfa_confirm(&conn, &app.keys, &app.sessions, app.secrets.as_ref(), t, &c, now),
        ("POST", "disable", Some(c)) => sessions::mfa_disable(&conn, &app.keys, app.secrets.as_ref(), t, &c, now),
        ("POST", "confirm" | "disable", None) => return bad("code is required".into()),
        _ => return not_found(),
    };
    match r {
        Ok(j) => Json(json!({"data": j})).into_response(),
        Err(r) => refused(r),
    }
}

/// A refusal from the session code, as the broker sees it: the usual error body, and the machine-readable reason in `details`.
fn refused(r: sessions::Refusal) -> Response {
    let (status, name) = match r.status {
        400 => (StatusCode::BAD_REQUEST, "ValidationError"),
        401 => (StatusCode::UNAUTHORIZED, "UnauthorizedError"),
        403 => (StatusCode::FORBIDDEN, "ForbiddenError"),
        404 => (StatusCode::NOT_FOUND, "NotFoundError"),
        409 => (StatusCode::CONFLICT, "ConflictError"),
        429 => (StatusCode::TOO_MANY_REQUESTS, "RateLimitError"),
        503 => (StatusCode::SERVICE_UNAVAILABLE, "ServiceUnavailable"),
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "InternalServerError"),
    };
    (status, Json(json!({"data": null, "error": {"status": status.as_u16(), "name": name, "message": r.message, "details": {"reason": r.reason}}}))).into_response()
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
/// rate-limited per address (visitors::client_ip: the connecting address, or what our own proxy put in X-Forwarded-For). A tenant that is not registered
/// is filed under the first tenant, as Strapi does, or refused with --strict-tenants.
async fn consent_log(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    if let Err(r) = rate_limited(&app, "consent", &headers) {
        return r;
    }
    let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
    let conn = app.conn.lock().unwrap();
    let key = match tenant_for(&app, &conn, raw.as_deref()) { Ok(k) => k, Err(r) => return r };
    let doc = match visitors::consent_document(&v, &key) { Ok(d) => d, Err(m) => return bad(m) };
    match records::create(&conn, "consent-log", &doc, &now_iso()) {
        Ok(row) => (StatusCode::CREATED, Json(json!({"data": {"documentId": row["documentId"], "createdAt": row["createdAt"]}}))).into_response(),
        Err(m) => fail(m),
    }
}

/// CORS for what a visitor's browser calls (visitors::is_visitor_path): the public site is on another origin than this
/// service, so a JSON post is preflighted and the answer must name that origin (WEBX_PUBLIC_SITE_ORIGINS). Studio's
/// and the engines' calls are server to server and get none; /internal and /admin are never answered to a browser.
async fn cors(State(app): State<Shared>, req: Request, next: Next) -> Response {
    if !visitors::is_visitor_path(req.uri().path()) {
        return next.run(req).await;
    }
    let origin = req.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok()).map(str::to_string);
    let mut res = if req.method() == Method::OPTIONS { StatusCode::NO_CONTENT.into_response() } else { next.run(req).await };
    let h = res.headers_mut();
    h.append(header::VARY, HeaderValue::from_static("Origin"));
    if let Some(o) = visitors::allow_origin(&app.origins, origin.as_deref()).and_then(|o| HeaderValue::from_str(&o).ok()) {
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, o);
        h.insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, POST, OPTIONS"));
        h.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type"));
        h.insert(header::ACCESS_CONTROL_MAX_AGE, HeaderValue::from_static("600"));
    }
    res
}

/// POST /api/search-stats/log?tenant=<key> {q, locale, results}: one search on the public site, counted without who made it
/// (decision D12; a port of strapi-cms/src/api/search-stat). A query that is empty or looks like personal data is not
/// stored, and the answer is the same 204 either way, so a caller cannot probe what was kept.
async fn search_stat_log(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    if let Err(r) = rate_limited(&app, "search", &headers) {
        return r;
    }
    let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
    let conn = app.conn.lock().unwrap();
    let key = match tenant_for(&app, &conn, raw.as_deref()) { Ok(k) => k, Err(r) => return r };
    let Some(query) = search_stats::normalise_query(v.get("q").and_then(Value::as_str).unwrap_or("")) else { return StatusCode::NO_CONTENT.into_response() };
    let locale = if v.get("locale").and_then(Value::as_str) == Some("en") { "en" } else { "th" };
    let results = match v.get("results") {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(s)) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
    .filter(|n| n.is_finite())
    .map_or(0, |n| n.floor().clamp(0.0, 10_000.0) as i64);
    match search_stats::log(&conn, &key, &query, locale, results, search_stats::MAX_DISTINCT, &now_iso()) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(m) => fail(m),
    }
}

/// GET /api/captcha: a new challenge, `{data: {id, question}}`. Its answer stays here; the form routes check it (one try, five
/// minutes). Counted against the address's own allowance, and refused (503) when too many are open.
async fn captcha_issue(State(app): State<Shared>, headers: HeaderMap) -> Response {
    if let Err(r) = rate_limited(&app, "captcha", &headers) {
        return r;
    }
    let issued = app.captchas.lock().unwrap().issue(now_ms());
    match issued {
        Some((id, question)) => ([(header::CACHE_CONTROL, "no-store")], Json(json!({"data": {"id": id, "question": question}}))).into_response(),
        None => error(StatusCode::SERVICE_UNAVAILABLE, "ServiceUnavailable", "Too many open challenges, try again shortly"),
    }
}

/// The cipher for a collection that holds personal data: None for one that holds none, and a 503 for one that does when no key
/// is configured (WEBX_PII_KEY), so personal data is never written, or read back, unencrypted.
fn cipher_for<'a>(app: &'a App, collection: &str) -> Result<Option<&'a pii::Pii>, Response> {
    if pii::fields_of(collection).is_empty() {
        return Ok(None);
    }
    match &app.pii {
        Some(p) => Ok(Some(p)),
        None => Err(error(StatusCode::SERVICE_UNAVAILABLE, "ServiceUnavailable", "this collection holds personal data: start with WEBX_PII_KEY set")),
    }
}

/// A stored row as its readers see it: personal data decrypted.
fn opened(app: &App, collection: &str, mut row: Value) -> Result<Value, Response> {
    if let Some(p) = cipher_for(app, collection)? {
        pii::open(p, collection, &mut row).map_err(|m| error(StatusCode::INTERNAL_SERVER_ERROR, "PiiError", &m))?;
    }
    Ok(row)
}

/// A document before it is stored: personal data encrypted (`keep_valid`: an import keeps what already decrypts).
fn sealed(app: &App, collection: &str, doc: &Value, keep_valid: bool) -> Result<Value, Response> {
    let mut doc = doc.clone();
    if let (Some(p), Some(o)) = (cipher_for(app, collection)?, doc.as_object_mut()) {
        pii::seal(p, collection, o, keep_valid).map_err(|m| error(StatusCode::INTERNAL_SERVER_ERROR, "PiiError", &m))?;
    }
    Ok(doc)
}

/// The captcha a form post carries (`captchaId`, `captchaAnswer`): a 400 named CaptchaError, the name the public site looks
/// for, when it is missing, wrong, used or too old. Always passes with WEBX_CAPTCHA=off.
fn check_captcha(app: &App, id: &str, answer: &Value) -> Result<(), Response> {
    if !app.captcha_on || app.captchas.lock().unwrap().verify(id, answer, now_ms()) {
        return Ok(());
    }
    Err((StatusCode::BAD_REQUEST, Json(json!({"data": null, "error": {"status": 400, "name": "CaptchaError", "message": "ยืนยัน CAPTCHA ไม่สำเร็จ โปรดลองใหม่", "details": {}}}))).into_response())
}

/// POST /api/<complaints|applications|registrations|contact-messages>?tenant=<key> {data: {...}, captchaId, captchaAnswer}: a
/// visitor's form (decisions D6 and D12; a port of the four Strapi types). Rate-limited, captcha-checked, cut to what the form
/// has (forms.rs), stored with the personal data encrypted; answers 201 with what the success screen shows: the reference number
/// (complaint, application) or username (registration).
fn form_submit(app: &App, collection: &'static str, headers: &HeaderMap, raw: Option<&str>, body: &[u8]) -> Response {
    if let Err(r) = rate_limited(app, "form", headers) {
        return r;
    }
    let v: Value = match serde_json::from_slice(body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
    if let Err(r) = check_captcha(app, v.get("captchaId").and_then(Value::as_str).unwrap_or(""), v.get("captchaAnswer").unwrap_or(&Value::Null)) {
        return r;
    }
    let cipher = match cipher_for(app, collection) { Ok(Some(p)) => p, Ok(None) => return fail("no cipher for a form collection".into()), Err(r) => return r };
    let conn = app.conn.lock().unwrap();
    let key = match tenant_for(app, &conn, raw) { Ok(k) => k, Err(r) => return r };
    let mut doc = match forms::clean(collection, &v) { Ok(d) => d, Err(m) => return bad(m) };
    doc.insert("tenantKey".into(), json!(key));
    let plain = doc.clone();
    match forms::create(&conn, cipher, collection, doc, &now_iso()) {
        Ok(row) => {
            queue_mail(app, &conn, cipher, collection, &plain, &row);
            submitted(&row)
        }
        Err(m) => fail(m),
    }
}

async fn complaint_submit(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    form_submit(&app, "complaint", &headers, raw.as_deref(), &body)
}
async fn application_submit(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    form_submit(&app, "application", &headers, raw.as_deref(), &body)
}
async fn registration_submit(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    form_submit(&app, "registration", &headers, raw.as_deref(), &body)
}
async fn contact_message_submit(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    form_submit(&app, "contact-message", &headers, raw.as_deref(), &body)
}

/// Queue the mails a new form row calls for (outbox.rs). `plain` is what was stored, with the personal data in the clear; `stored`
/// is the row as the database made it (the reference or username). A mail that cannot be queued is logged and never fails
/// the visitor's submission.
fn queue_mail(app: &App, conn: &rusqlite::Connection, cipher: &pii::Pii, collection: &str, plain: &serde_json::Map<String, Value>, stored: &Value) {
    let mut row = plain.clone();
    for f in ["ref", "username", "tenantKey"] {
        if let Some(v) = stored.get(f) {
            row.insert(f.into(), v.clone());
        }
    }
    for m in outbox::notices(collection, &Value::Object(row), app.notify_to.as_deref()) {
        if let Err(e) = outbox::enqueue(conn, cipher, &m, now_ms()) {
            eprintln!("[webx-control] could not queue a {} mail: {e}", m.kind);
        }
    }
}

/// The answer to a stored submission: what the success screen shows, no personal data.
fn submitted(row: &Value) -> Response {
    let mut out = serde_json::Map::new();
    for f in ["documentId", "createdAt", "ref", "username"] {
        if let Some(x) = row.get(f) {
            out.insert(f.into(), x.clone());
        }
    }
    (StatusCode::CREATED, Json(json!({"data": out}))).into_response()
}

/// POST /api/complaints/submit and /api/applications/submit (multipart): the form with a file attached, the way public-site
/// sends it (`data` as JSON text, the file as `files.attachment` or `files.resume`, `captchaId`, `captchaAnswer`). The same
/// rules as the JSON post, and the file must be a document or an image of at most 5 MB whose content matches its name
/// (files.rs); it is kept encrypted and the row refers to it as `attachment` or `resume`.
async fn form_submit_file(app: &App, collection: &'static str, field: &str, file_fields: &[&str], headers: &HeaderMap, raw: Option<&str>, mut mp: Multipart) -> Response {
    if let Err(r) = rate_limited(app, "form", headers) {
        return r;
    }
    let mut text = std::collections::HashMap::<String, String>::new();
    let mut file: Option<(String, Vec<u8>)> = None;
    loop {
        let f = match mp.next_field().await {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => return error(e.status(), "ValidationError", "the form could not be read"),
        };
        let name = f.name().unwrap_or("").to_string();
        let filename = f.file_name().map(str::to_string);
        let bytes = match f.bytes().await {
            Ok(b) => b,
            Err(e) => return error(e.status(), "ValidationError", "the form could not be read"),
        };
        match filename {
            Some(fname) => {
                if file.is_none() && file_fields.contains(&name.as_str()) && !bytes.is_empty() {
                    file = Some((fname, bytes.to_vec()));
                }
            }
            None => {
                if text.len() < 64 {
                    text.insert(name, String::from_utf8_lossy(&bytes).into_owned());
                }
            }
        }
    }
    if let Err(r) = check_captcha(app, text.get("captchaId").map(String::as_str).unwrap_or(""), &json!(text.get("captchaAnswer").cloned().unwrap_or_default())) {
        return r;
    }
    let cipher = match cipher_for(app, collection) { Ok(Some(p)) => p, Ok(None) => return fail("no cipher for a form collection".into()), Err(r) => return r };
    // the fields as JSON text in `data`, or bare as separate parts
    let data: Value = match text.get("data") {
        Some(s) => match serde_json::from_str::<Value>(s) {
            Ok(v @ Value::Object(_)) => v,
            _ => return bad("data is not JSON".into()),
        },
        None => Value::Object(text.iter().filter(|(k, _)| k.as_str() != "captchaId" && k.as_str() != "captchaAnswer").map(|(k, v)| (k.clone(), json!(v))).collect()),
    };
    let conn = app.conn.lock().unwrap();
    let key = match tenant_for(app, &conn, raw) { Ok(k) => k, Err(r) => return r };
    let mut doc = match forms::clean(collection, &data) { Ok(d) => d, Err(m) => return bad(m) };
    doc.insert("tenantKey".into(), json!(key));
    let plain = doc.clone();
    let mut kept: Option<String> = None;
    if let Some((fname, bytes)) = file {
        let (name, mime) = match files::validate(&fname, &bytes) { Ok(x) => x, Err(m) => return bad(m) };
        match files::store(&conn, cipher, &key, collection, &name, mime, &bytes, &now_iso()) {
            Ok(meta) => {
                kept = meta.get("documentId").and_then(Value::as_str).map(str::to_string);
                doc.insert(field.into(), meta);
            }
            Err(m) => return fail(m),
        }
    }
    match forms::create(&conn, cipher, collection, doc, &now_iso()) {
        Ok(row) => {
            queue_mail(app, &conn, cipher, collection, &plain, &row);
            submitted(&row)
        }
        Err(m) => {
            if let Some(id) = kept {
                let _ = files::remove(&conn, &id);
            }
            fail(m)
        }
    }
}

async fn complaint_submit_file(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, mp: Multipart) -> Response {
    form_submit_file(&app, "complaint", "attachment", &["files.attachment", "attachment", "file"], &headers, raw.as_deref(), mp).await
}
async fn application_submit_file(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, mp: Multipart) -> Response {
    form_submit_file(&app, "application", "resume", &["files.resume", "resume", "file"], &headers, raw.as_deref(), mp).await
}

/// The loop that sends the outbox's mail (decision D15): every few seconds the mails that are due go out one at a time, off
/// the async runtime; one that fails is counted and tried again later with a growing wait (outbox.rs). Once an hour the mails
/// given up on a week ago are dropped. It runs only with WEBX_SMTP_URL set; without it mail is queued and kept.
async fn mail_loop(app: Shared, mailer: Arc<mailer::Mailer>) {
    let mut rounds: u64 = 0;
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        rounds += 1;
        let Some(cipher) = app.pii.as_ref() else { continue };
        let batch = {
            let conn = app.conn.lock().unwrap();
            if rounds % 1800 == 0 {
                let _ = outbox::purge(&conn, now_ms());
            }
            outbox::due(&conn, cipher, now_ms(), 20)
        };
        let batch = match batch {
            Ok(b) => b,
            Err(m) => {
                eprintln!("[webx-control] outbox: {m}");
                continue;
            }
        };
        for mail in batch {
            let m = mailer.clone();
            let (to, subject, text) = (mail.to.clone(), mail.subject.clone(), mail.text.clone());
            let sent = tokio::task::spawn_blocking(move || m.send(&to, &subject, &text)).await.unwrap_or_else(|e| Err(e.to_string()));
            let conn = app.conn.lock().unwrap();
            let done = match sent {
                Ok(()) => outbox::mark_sent(&conn, mail.id, now_ms()),
                Err(m) => {
                    eprintln!("[webx-control] mail {} not sent (try {}): {}", mail.id, mail.attempts + 1, outbox::scrub(&m));
                    outbox::mark_failed(&conn, mail.id, &m, now_ms())
                }
            };
            if let Err(m) = done {
                eprintln!("[webx-control] outbox: {m}");
            }
        }
    }
}

/// GET /api/<complaints|applications>/track/<ref>?tenant=<key>: where a submission stands, found by its reference number alone
/// and only inside the workspace named (a port of the two Strapi track routes): the few fields a citizen may see, never the
/// personal data. Its own rate limit, since a reference is six digits.
fn form_track(app: &App, collection: &'static str, headers: &HeaderMap, raw: Option<&str>, reference: &str) -> Response {
    if let Err(r) = rate_limited(app, "track", headers) {
        return r;
    }
    let reference = reference.trim().to_uppercase();
    if reference.is_empty() {
        return bad("ref is required".into());
    }
    let conn = app.conn.lock().unwrap();
    let key = match tenant_for(app, &conn, raw) { Ok(k) => k, Err(r) => return r };
    let shown: &[&str] = if collection == "complaint" { &["ref", "type", "subject", "date", "stage", "steps"] } else { &["ref", "jobId", "position", "date", "stage"] };
    match records::find_by_ref(&conn, collection, &key, &reference) {
        Ok(Some(row)) => {
            let out: serde_json::Map<String, Value> = shown.iter().filter_map(|f| row.get(*f).map(|x| ((*f).to_string(), x.clone()))).collect();
            Json(json!({"data": out})).into_response()
        }
        Ok(None) => error(StatusCode::NOT_FOUND, "NotFoundError", &format!("{collection} not found")),
        Err(m) => fail(m),
    }
}

async fn complaint_track(State(app): State<Shared>, headers: HeaderMap, Path(reference): Path<String>, RawQuery(raw): RawQuery) -> Response {
    form_track(&app, "complaint", &headers, raw.as_deref(), &reference)
}
async fn application_track(State(app): State<Shared>, headers: HeaderMap, Path(reference): Path<String>, RawQuery(raw): RawQuery) -> Response {
    form_track(&app, "application", &headers, raw.as_deref(), &reference)
}

// ---- the visitors' assistant (decision D12): a port of strapi-cms/src/api/assist, with the answers of utils/answer.ts

/// The assistant's calls are dearer than a cookie choice: 20 a minute per address, as in Strapi.
const ASSIST_LIMIT: u32 = 20;

fn assist_error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({"error": message}))).into_response()
}

/// The text a body names, trimmed and cut to `max` characters; empty when it is missing.
fn body_text(v: &Value, key: &str, max: usize) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").trim().chars().take(max).collect()
}

/// The engine and address of the workspace a visitors' route is for: the one named in ?tenant= (the first when it names none or
/// an unregistered one, as Strapi does; a 404 with --strict-tenants), read under the database lock which is then let go.
fn engine_of(app: &App, raw: Option<&str>) -> Result<(String, String, Option<String>), Response> {
    let conn = app.conn.lock().unwrap();
    let key = tenant_for(app, &conn, raw)?;
    match registry::get(&conn, &key) {
        Ok(Some(t)) => Ok((key, t.engine, t.engine_url)),
        // the tenant fallback found a key the registry then lost, or the registry is empty
        _ => Err(not_found()),
    }
}

/// POST /api/assist/ask?tenant=<key> {q, locale}: the site assistant. Answers from the workspace's own published pages, articles,
/// FAQs, services and datasets, and always returns the sources it used: `{answer, mode, sources, cited}`. With an LLM it may cite
/// only the numbered sources; without one, or when it fails, the answer quotes the best passage; nothing found is no answer.
async fn assist_ask(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    if let Err(r) = rate_limited_to(&app, "assist", &headers, ASSIST_LIMIT) {
        return r;
    }
    let v: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let q = body_text(&v, "q", 400);
    if q.is_empty() {
        return assist_error(StatusCode::BAD_REQUEST, "q required");
    }
    let en = v.get("locale").and_then(Value::as_str) == Some("en");
    let (key, engine, url) = match engine_of(&app, raw.as_deref()) { Ok(x) => x, Err(r) => return r };
    let settings = app.assist.clone();
    let answer = tokio::task::spawn_blocking(move || {
        let docs = settings.corpus_of(&engine, url.as_deref(), &key, en);
        let hits = assist::rank(&docs, &q, 5);
        match &settings.ask {
            Some(cfg) => {
                let ask = |system: &str, prompt: &str| llm::chat(cfg, system, prompt, 600);
                assist::compose_answer(&hits, &q, en, Some(&ask))
            }
            None => assist::compose_answer(&hits, &q, en, None),
        }
    })
    .await;
    match answer {
        Ok(a) => Json(a.to_json()).into_response(),
        Err(_) => assist_error(StatusCode::INTERNAL_SERVER_ERROR, "the assistant failed"),
    }
}

/// GET /api/assist/status: whether answers are generated by an LLM or quoted. No addresses or keys.
async fn assist_status(State(app): State<Shared>) -> Response {
    Json(json!({"llm": app.assist.ask.is_some()})).into_response()
}

/// The checks the three LLM calls share: an LLM must be configured (503), and the address within its allowance (429).
fn assist_gate(app: &App, headers: &HeaderMap) -> Result<llm::LlmConfig, Response> {
    let Some(cfg) = app.assist.general.clone() else { return Err(assist_error(StatusCode::SERVICE_UNAVAILABLE, "AI not configured")) };
    rate_limited_to(app, "assist", headers, ASSIST_LIMIT).map_err(|_| assist_error(StatusCode::TOO_MANY_REQUESTS, "Too many requests"))?;
    Ok(cfg)
}

/// One LLM call off the async runtime: the model's text, or the 502 Strapi answers.
async fn assist_llm(cfg: llm::LlmConfig, system: &'static str, prompt: String, max_tokens: u32) -> Result<String, Response> {
    match tokio::task::spawn_blocking(move || llm::chat(&cfg, system, &prompt, max_tokens)).await {
        Ok(Ok(text)) => Ok(text),
        _ => Err(assist_error(StatusCode::BAD_GATEWAY, "AI error")),
    }
}

/// POST /api/assist/simplify {text}: official Thai rewritten in plain words.
async fn assist_simplify(State(app): State<Shared>, headers: HeaderMap, body: Bytes) -> Response {
    let cfg = match assist_gate(&app, &headers) { Ok(c) => c, Err(r) => return r };
    let v: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let text = body_text(&v, "text", 6000);
    if text.is_empty() {
        return assist_error(StatusCode::BAD_REQUEST, "text required");
    }
    match assist_llm(cfg, assist::SIMPLIFY_SYSTEM, assist::simplify_prompt(&text), 700).await {
        Ok(t) => Json(json!({"text": t})).into_response(),
        Err(r) => r,
    }
}

/// POST /api/assist/translate {text, target}: the text in the language asked for (default English).
async fn assist_translate(State(app): State<Shared>, headers: HeaderMap, body: Bytes) -> Response {
    let cfg = match assist_gate(&app, &headers) { Ok(c) => c, Err(r) => return r };
    let v: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let text = body_text(&v, "text", 6000);
    let target = Some(body_text(&v, "target", 20)).filter(|t| !t.is_empty()).unwrap_or_else(|| "en".into());
    if text.is_empty() {
        return assist_error(StatusCode::BAD_REQUEST, "text required");
    }
    match assist_llm(cfg, assist::TRANSLATE_SYSTEM, assist::translate_prompt(&target, &text), 1200).await {
        Ok(t) => Json(json!({"text": t})).into_response(),
        Err(r) => r,
    }
}

/// POST /api/assist/find?tenant=<key> {q}: the service finder: which of the workspace's services fits a citizen's question, and
/// the steps, answered from its services and FAQs only.
async fn assist_find(State(app): State<Shared>, headers: HeaderMap, RawQuery(raw): RawQuery, body: Bytes) -> Response {
    let cfg = match assist_gate(&app, &headers) { Ok(c) => c, Err(r) => return r };
    let v: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let q = body_text(&v, "q", 400);
    if q.is_empty() {
        return assist_error(StatusCode::BAD_REQUEST, "q required");
    }
    let (key, engine, url) = match engine_of(&app, raw.as_deref()) { Ok(x) => x, Err(r) => return r };
    let settings = app.assist.clone();
    let Ok((services, faqs)) = tokio::task::spawn_blocking(move || settings.finder_sources(&engine, url.as_deref(), &key)).await else { return assist_error(StatusCode::INTERNAL_SERVER_ERROR, "the assistant failed") };
    let prompt = assist::find_prompt(&assist::find_context(&services, &faqs), &q);
    match assist_llm(cfg, assist::FIND_SYSTEM, prompt, 700).await {
        Ok(answer) => {
            let picked: Vec<Value> = services.iter().take(6).map(|s| json!({"title": s.get("title"), "slug": s.get("slug")})).collect();
            Json(json!({"answer": answer, "services": picked})).into_response()
        }
        Err(r) => r,
    }
}

/// The header the middleware below puts the caller's address in for the handlers. It is always written there, replacing
/// whatever the caller sent under that name, so a handler can believe it.
const CLIENT_HEADER: &str = "x-webx-client";

/// The address a visitor's request counts against for rate limiting (visitors::client_ip, decided by WEBX_TRUSTED_PROXIES).
fn client_address(headers: &HeaderMap) -> String {
    headers.get(CLIENT_HEADER).and_then(|v| v.to_str().ok()).map(str::to_string).filter(|s| !s.is_empty()).unwrap_or_else(|| "direct".into())
}

/// Works out who is calling from the connecting socket and X-Forwarded-For, and tells the handlers in CLIENT_HEADER.
async fn client_key(State(app): State<Shared>, ConnectInfo(peer): ConnectInfo<SocketAddr>, mut req: Request, next: Next) -> Response {
    let forwarded: Vec<&str> = req.headers().get_all("x-forwarded-for").iter().filter_map(|v| v.to_str().ok()).collect();
    let who = visitors::client_ip(peer.ip(), &forwarded, app.proxies);
    if let Ok(v) = HeaderValue::from_str(&who) {
        req.headers_mut().insert(CLIENT_HEADER, v);
    }
    next.run(req).await
}

/// One request counted against the visitor's address for `route` (each visitors' route has its own allowance); the 429 to
/// send when it is over.
fn rate_limited(app: &App, route: &str, headers: &HeaderMap) -> Result<(), Response> {
    rate_limited_to(app, route, headers, visitors::RATE_LIMIT)
}

fn rate_limited_to(app: &App, route: &str, headers: &HeaderMap, limit: u32) -> Result<(), Response> {
    if app.limiter.lock().unwrap().allow_up_to(&format!("{route}:{}", client_address(headers)), now_ms(), limit) {
        Ok(())
    } else {
        Err(error(StatusCode::TOO_MANY_REQUESTS, "RateLimitError", "Too many requests"))
    }
}

/// The workspace a visitors' route files its data under: the one named by ?tenant= when it is registered; otherwise the first
/// tenant, as Strapi does, or a 404 with --strict-tenants (decision D9).
fn tenant_for(app: &App, conn: &rusqlite::Connection, raw: Option<&str>) -> Result<String, Response> {
    let asked = query_param_exact(raw, "tenant").filter(|t| !t.is_empty());
    let known = match &asked { Some(k) => matches!(registry::get(conn, k), Ok(Some(_))), None => false };
    match asked {
        Some(k) if known => Ok(k),
        Some(_) if app.strict => Err(not_found()),
        _ => registry::default_key(conn).ok_or_else(not_found),
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
            // a change that takes something away (disabling, a workspace, a role) also ends the user's sessions
            match sessions::replace_user(&conn, email, &v, now_secs()) {
                Ok(created) => {
                    let u = identity::get(&conn, email).ok().flatten().map(|u| u.to_json());
                    (if created { StatusCode::CREATED } else { StatusCode::OK }, Json(json!({"data": u}))).into_response()
                }
                Err(m) => error(StatusCode::BAD_REQUEST, "ValidationError", &m),
            }
        }
        ("DELETE", ["users", email]) => match sessions::remove_user(&conn, email, now_secs()) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        // how a person signs in: the (provider, subject) pairs that are them. Only an operator can set one for a super admin
        ("GET", ["users", email, "identities"]) => match identity::get(&conn, email) {
            Ok(Some(u)) => identities_response(&conn, u.id),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["users", email, "identities"]) => {
            let v: Value = match serde_json::from_slice(&body) {
                Ok(v) => v,
                Err(_) => return error(StatusCode::BAD_REQUEST, "ValidationError", "body is not JSON"),
            };
            match sessions::set_identities(&conn, email, &v, now_secs()) {
                Ok(true) => match identity::get(&conn, email) {
                    Ok(Some(u)) => identities_response(&conn, u.id),
                    _ => not_found(),
                },
                Ok(false) => not_found(),
                Err(m) => error(StatusCode::BAD_REQUEST, "ValidationError", &m),
            }
        }
        // a person's second factor, as an operator sees it: whether there is one; a copy from Strapi (tools/migrate-mfa.mjs); taking it away
        ("GET", ["users", email, "mfa"]) => match identity::get(&conn, email) {
            Ok(Some(u)) => match mfa::status(&conn, u.id, now_secs()) {
                Ok(j) => Json(json!({"data": j})).into_response(),
                Err(m) => fail(m),
            },
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["users", email, "mfa"]) => {
            let v: Value = match serde_json::from_slice(&body) {
                Ok(v) => v,
                Err(_) => return error(StatusCode::BAD_REQUEST, "ValidationError", "body is not JSON"),
            };
            match sessions::mfa_import(&conn, app.secrets.as_ref(), email, &v, now_secs()) {
                Ok(Some(written)) => Json(json!({"data": {"imported": written}})).into_response(),
                Ok(None) => not_found(),
                Err(r) => refused(r),
            }
        }
        ("DELETE", ["users", email, "mfa"]) => match sessions::mfa_reset(&conn, email, now_secs()) {
            Ok(Some(true)) => Json(json!({"data": null})).into_response(),
            Ok(_) => not_found(),
            Err(m) => fail(m),
        },
        // which provider a workspace's people sign in at, and whether a person it vouches for is made on the spot
        ("GET", ["tenants", key, "identity"]) => match sessions::policy(&conn, key) {
            Ok(Some(p)) => Json(json!({"data": p.to_json()})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["tenants", key, "identity"]) => {
            let v: Value = match serde_json::from_slice(&body) {
                Ok(v) => v,
                Err(_) => return error(StatusCode::BAD_REQUEST, "ValidationError", "body is not JSON"),
            };
            match sessions::put_policy(&conn, app.secrets.as_ref(), key, &v, now_secs()) {
                Ok(created) => {
                    let p = sessions::policy(&conn, key).ok().flatten().map(|p| p.to_json());
                    (if created { StatusCode::CREATED } else { StatusCode::OK }, Json(json!({"data": p}))).into_response()
                }
                Err(m) => error(StatusCode::BAD_REQUEST, "ValidationError", &m),
            }
        }
        ("DELETE", ["tenants", key, "identity"]) => match sessions::delete_policy(&conn, key, now_secs()) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        ("DELETE", ["tenants", key]) => match registry::remove(&conn, key) {
            Ok(true) => match sessions::workspace_removed(&conn, key, now_secs()) {
                Ok(()) => Json(json!({"data": null})).into_response(),
                Err(m) => fail(m),
            },
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        _ => not_found(),
    }
}

fn identities_response(conn: &rusqlite::Connection, user_id: i64) -> Response {
    match sessions::identities_of(conn, user_id) {
        Ok(l) => Json(json!({"data": l.iter().map(|i| json!({"issuer": i.issuer, "subject": i.subject, "linkedBy": i.linked_by, "createdAt": i.created_at})).collect::<Vec<_>>()})).into_response(),
        Err(m) => fail(m),
    }
}

/// /engine/*, what an engine reads from the control plane with its own credential (WEBX_CONTROL_ENGINE_TOKEN). That credential only
/// reads: anything but GET and HEAD is refused whatever it carries, so an engine that leaks it leaks no way to write.
///   GET /engine/users/<email>                 {data: {email, name, disabled, superAdmin, memberships: [{tenantKey, role, customRole}]}}
///   GET /engine/roles                         {data: {roles: {admin: [action...], ...}, actions, management}}: the base roles (roles.rs)
///   GET /engine/tenants/<key>/custom-roles    {data: [{roleKey, name, permissions, ...}]}: the workspace's custom roles
async fn engine(State(app): State<Shared>, method: Method, headers: HeaderMap, Path(rest): Path<String>) -> Response {
    if let Err(r) = check_token(app.engine, &headers, "the engine API is off: start with WEBX_CONTROL_ENGINE_TOKEN set") {
        return r;
    }
    if method != Method::GET && method != Method::HEAD {
        return error(StatusCode::METHOD_NOT_ALLOWED, "MethodNotAllowed", "this credential only reads");
    }
    let conn = app.conn.lock().unwrap();
    let parts: Vec<&str> = rest.trim_end_matches('/').split('/').collect();
    match parts.as_slice() {
        ["users", email] => match identity::get(&conn, email) {
            Ok(Some(u)) => Json(json!({"data": u.to_json()})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ["roles"] => Json(json!({"data": roles::catalogue()})).into_response(),
        ["tenants", key, "custom-roles"] if identity::valid_tenant(key) => {
            let q = records::Query { filters: vec![records::Filter { field: "tenantKey".into(), op: "eq".into(), value: key.to_string() }], sort: Some(("roleKey".into(), false)), page: 1, page_size: 500 };
            match records::list(&conn, "custom-role", &q) {
                Ok((rows, _)) => Json(json!({"data": rows})).into_response(),
                Err(m) => fail(m),
            }
        }
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

/// The list query of a records collection: `filter=field:op:value` (any number), `sort=field:dir`, `page`, `pageSize` (at most 500).
fn records_query(raw: Option<&str>) -> Result<records::Query, String> {
    let mut q = records::Query { filters: vec![], sort: None, page: 1, page_size: 25 };
    for pair in raw.unwrap_or("").split('&').filter(|p| !p.is_empty()) {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = percent_decode(v);
        match k {
            "filter" => {
                let mut it = v.splitn(3, ':');
                match (it.next(), it.next(), it.next()) {
                    (Some(f), Some(o), Some(val)) => q.filters.push(records::Filter { field: f.into(), op: o.into(), value: val.into() }),
                    _ => return Err("filter is field:op:value".into()),
                }
            }
            "sort" => { let (f, d) = v.split_once(':').unwrap_or((&v, "asc")); q.sort = Some((f.to_string(), d.eq_ignore_ascii_case("desc"))); }
            "page" => q.page = v.parse().ok().filter(|n| *n >= 1).unwrap_or(1),
            "pageSize" => q.page_size = v.parse().ok().filter(|n| *n >= 1).unwrap_or(25).min(500),
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
    let parts: Vec<&str> = rest.trim_end_matches('/').split('/').collect();
    // What makes a person's token or session needs the broker's own credential, never the service token's (which Strapi, the
    // workers and the tools also hold). Until WEBX_CONTROL_AUTH_TOKEN is set /internal/token takes the service token, as it
    // always did, and the session routes are off.
    let identity_route = matches!(parts.as_slice(), ["token"] | ["engine-token"] | ["sessions", ..] | ["users", _, "revoke"] | ["tenants", _, "identity"]);
    let allowed = if identity_route && (app.auth.is_some() || parts[0] != "token") {
        check_token(app.auth, &headers, "the identity API is off: start with WEBX_CONTROL_AUTH_TOKEN set")
    } else {
        check_token(app.service, &headers, "the internal API is off: start with WEBX_CONTROL_SERVICE_TOKEN set")
    };
    if let Err(r) = allowed {
        return r;
    }
    let conn = app.conn.lock().unwrap();
    let bad = |m: String| error(StatusCode::BAD_REQUEST, "ValidationError", &m);
    match (method.as_str(), parts.as_slice()) {
        // Studio has just signed a user in (OIDC); this issues a token for them, tied to no session. A sign-in that
        // should be one the person can end uses POST /internal/sessions below
        ("POST", ["token"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let Some(email) = v.get("email").and_then(Value::as_str) else { return bad("email is required".into()) };
            match identity::issue(&conn, &app.keys, email, v.get("tenantKey").and_then(Value::as_str), app.sessions.access_secs, now_secs()) {
                Ok((token, exp)) => Json(json!({"data": {"token": token, "expiresAt": exp}})).into_response(),
                Err(m) => error(StatusCode::FORBIDDEN, "ForbiddenError", &m),
            }
        }
        // sign a person in, from what the provider said: {issuer, subject, email, emailVerified, amr?, ip?, userAgent?, tenantKey}
        ("POST", ["sessions"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let req = match sessions::SignIn::from_json(&v) { Ok(r) => r, Err(r) => return refused(r) };
            match sessions::sign_in(&conn, &app.keys, &app.sessions, &req, now_secs()) {
                Ok(sessions::Begun::Session(j)) => (StatusCode::CREATED, Json(json!({"data": j}))).into_response(),
                // the person has a second factor: 202 with a pending id; the session comes from POST /internal/sessions/mfa
                Ok(sessions::Begun::MfaRequired(j)) => (StatusCode::ACCEPTED, Json(json!({"data": j}))).into_response(),
                Err(r) => refused(r),
            }
        }
        // {pendingId, code}: the second step of a sign-in that waited for the person's code (an authenticator's or a recovery code)
        ("POST", ["sessions", "mfa"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let (Some(id), Some(code)) = (v.get("pendingId").and_then(Value::as_str), v.get("code").and_then(Value::as_str)) else { return bad("pendingId and code are required".into()) };
            match sessions::complete_mfa(&conn, &app.keys, &app.sessions, app.secrets.as_ref(), id, code, now_secs()) {
                Ok(j) => (StatusCode::CREATED, Json(json!({"data": j}))).into_response(),
                Err(r) => refused(r),
            }
        }
        // {refreshToken}: a new access token and refresh token (the old refresh token works a few seconds more)
        ("POST", ["sessions", "refresh"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let Some(t) = v.get("refreshToken").and_then(Value::as_str) else { return bad("refreshToken is required".into()) };
            match sessions::refresh(&conn, &app.keys, &app.sessions, t, now_secs()) {
                Ok(j) => Json(json!({"data": j})).into_response(),
                Err(r) => refused(r),
            }
        }
        // {tenantKey}: move the session to another workspace of the same provider; a new access token
        ("POST", ["sessions", id, "switch"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let Some(t) = v.get("tenantKey").and_then(Value::as_str) else { return bad("tenantKey is required".into()) };
            match sessions::switch(&conn, &app.keys, &app.sessions, id, t, now_secs()) {
                Ok(j) => Json(json!({"data": j})).into_response(),
                Err(r) => refused(r),
            }
        }
        // is the session good (Studio keeps the answer a few seconds), and the person logging out
        ("GET", ["sessions", id]) => match sessions::status(&conn, id, now_secs()) {
            Ok(Some(j)) => Json(json!({"data": j})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("DELETE", ["sessions", id]) => match sessions::logout(&conn, id, now_secs()) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        // where to send a person to sign in to a workspace: its mode, and for one that signs in through control its provider and client
        ("GET", ["tenants", key, "identity"]) => match sessions::sign_in_settings(&conn, app.secrets.as_ref(), key) {
            Ok(Some(j)) => Json(json!({"data": j})).into_response(),
            Ok(None) => not_found(),
            Err(m) => error(StatusCode::SERVICE_UNAVAILABLE, "ServiceUnavailable", &m),
        },
        // sign a user out everywhere
        ("POST", ["users", email, "revoke"]) => match sessions::revoke_user(&conn, email, now_secs()) {
            Ok(Some(n)) => Json(json!({"data": {"revoked": n}})).into_response(),
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        // the 60-second token an engine verifies: {sessionId, tenantKey?} for a person, {purpose: "job", ownerEmail, tenantKey, jobId} for a job
        ("POST", ["engine-token"]) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let req = match sessions::EngineRequest::from_json(&v) { Ok(r) => r, Err(r) => return refused(r) };
            match sessions::engine_token(&conn, &app.keys, &app.sessions, &req, now_secs()) {
                Ok(j) => Json(json!({"data": j})).into_response(),
                Err(r) => refused(r),
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
            let q = match records_query(raw.as_deref()) { Ok(q) => q, Err(m) => return bad(m) };
            if let Err(r) = cipher_for(&app, c) {
                return r; // no key: refused even when there is nothing to read yet
            }
            // personal data is stored encrypted, so a filter on it would compare ciphertext
            if let Some(f) = q.filters.iter().find(|f| pii::fields_of(c).contains(&f.field.as_str())) {
                return bad(format!("{} holds personal data and cannot be filtered", f.field));
            }
            match records::list(&conn, c, &q) {
                Ok((rows, total)) => {
                    let mut shown = Vec::with_capacity(rows.len());
                    for row in rows {
                        match opened(&app, c, row) { Ok(r) => shown.push(r), Err(r) => return r }
                    }
                    Json(json!({"data": shown, "meta": {"pagination": {"page": q.page, "pageSize": q.page_size, "pageCount": total.div_ceil(q.page_size), "total": total}}})).into_response()
                }
                Err(m) => bad(m),
            }
        }
        // what visitors searched for (C5): read-only here, written by POST /api/search-stats/log; same list query as a collection
        ("GET", ["records", "search-stat"]) => {
            let q = match records_query(raw.as_deref()) { Ok(q) => q, Err(m) => return bad(m) };
            match search_stats::list(&conn, &q) {
                Ok((rows, total)) => Json(json!({"data": rows, "meta": {"pagination": {"page": q.page, "pageSize": q.page_size, "pageCount": total.div_ceil(q.page_size), "total": total}}})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("POST", ["records", c]) if records::known(c) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let doc = v.get("data").unwrap_or(&v);
            if forms::is_form(c) {
                // the same defaults a visitor's post gets: a reference number, a starting stage, a username; personal data sealed
                let cipher = match cipher_for(&app, c) { Ok(Some(p)) => p, Ok(None) => return fail("no cipher for a form collection".into()), Err(r) => return r };
                let Some(map) = doc.as_object() else { return bad("a record is an object".into()) };
                return match forms::create(&conn, cipher, c, map.clone(), &now_iso()) {
                    Ok(row) => {
                        queue_mail(&app, &conn, cipher, c, map, &row);
                        match opened(&app, c, row) { Ok(r) => Json(json!({"data": r})).into_response(), Err(r) => r }
                    }
                    Err(m) => bad(m),
                };
            }
            match records::create(&conn, c, doc, &now_iso()) {
                Ok(row) => Json(json!({"data": row})).into_response(),
                Err(m) => bad(m),
            }
        }
        ("POST", ["records", c, "import"]) if records::known(c) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let Some(rows) = v.as_array() else { return bad("body must be an array of records".into()) };
            let (mut added, mut skipped) = (0, 0);
            for (i, r) in rows.iter().enumerate() {
                // a migration keeps personal data that is already ciphertext under this key, and encrypts what is plain
                let r = match sealed(&app, c, r, true) { Ok(r) => r, Err(resp) => return resp };
                match records::import(&conn, c, &r, &now_iso()) {
                    Ok(true) => added += 1,
                    Ok(false) => skipped += 1,
                    Err(m) => return bad(format!("record {i}: {m}")),
                }
            }
            Json(json!({"added": added, "skipped": skipped})).into_response()
        }
        ("GET", ["records", c, id]) if records::known(c) => match records::get(&conn, c, id) {
            Ok(Some(row)) => match opened(&app, c, row) { Ok(r) => Json(json!({"data": r})).into_response(), Err(r) => r },
            Ok(None) => not_found(),
            Err(m) => fail(m),
        },
        ("PUT", ["records", c, id]) if records::known(c) => {
            let v: Value = match serde_json::from_slice(&body) { Ok(v) => v, Err(_) => return bad("body is not JSON".into()) };
            let patch = match sealed(&app, c, v.get("data").unwrap_or(&v), false) { Ok(p) => p, Err(r) => return r };
            match records::update(&conn, c, id, &patch, &now_iso()) {
                Ok(Some(row)) => match opened(&app, c, row) { Ok(r) => Json(json!({"data": r})).into_response(), Err(r) => r },
                Ok(None) => not_found(),
                Err(m) => bad(m),
            }
        }
        ("DELETE", ["records", c, id]) if records::known(c) => {
            // a complaint's or application's attached file goes with it
            if matches!(*c, "complaint" | "application") {
                if let Ok(Some(row)) = records::get(&conn, c, id) {
                    for f in ["attachment", "resume"] {
                        if let Some(fid) = row.get(f).and_then(|a| a.get("documentId")).and_then(Value::as_str) {
                            let _ = files::remove(&conn, fid);
                        }
                    }
                }
            }
            match records::remove(&conn, c, id) {
                Ok(true) => Json(json!({"data": null})).into_response(),
                Ok(false) => not_found(),
                Err(m) => fail(m),
            }
        }
        // the files kept for the forms (D14): an upload by an editor or a migration, a download for Studio, a delete
        ("POST", ["files"]) => {
            let Some(cipher) = app.pii.as_ref() else { return error(StatusCode::SERVICE_UNAVAILABLE, "ServiceUnavailable", "files are kept encrypted: start with WEBX_PII_KEY set") };
            if body.is_empty() {
                return bad("the body is the file".into());
            }
            let name = files::clean_name(&query_param_exact(raw.as_deref(), "name").unwrap_or_default());
            let ext = name.rsplit_once('.').map(|(_, x)| x.to_lowercase()).unwrap_or_default();
            let mime = files::mime_for(&ext).unwrap_or("application/octet-stream");
            match files::store(&conn, cipher, &query_param_exact(raw.as_deref(), "tenant").unwrap_or_default(), &query_param_exact(raw.as_deref(), "collection").unwrap_or_default(), &name, mime, &body, &now_iso()) {
                Ok(meta) => Json(json!({"data": meta})).into_response(),
                Err(m) => fail(m),
            }
        }
        ("GET", ["files", id]) => {
            let Some(cipher) = app.pii.as_ref() else { return error(StatusCode::SERVICE_UNAVAILABLE, "ServiceUnavailable", "files are kept encrypted: start with WEBX_PII_KEY set") };
            match files::load(&conn, cipher, id) {
                Ok(Some(f)) => (
                    StatusCode::OK,
                    [
                        (header::CONTENT_TYPE, f.mime),
                        (header::CONTENT_DISPOSITION, files::disposition(&f.name)),
                        (header::HeaderName::from_static("x-content-type-options"), "nosniff".to_string()),
                        (header::CACHE_CONTROL, "no-store".to_string()),
                        (header::HeaderName::from_static("x-file-tenant"), f.tenant_key.unwrap_or_default()),
                        (header::HeaderName::from_static("x-file-collection"), f.collection.unwrap_or_default()),
                    ],
                    f.bytes,
                )
                    .into_response(),
                Ok(None) => not_found(),
                Err(m) => error(StatusCode::INTERNAL_SERVER_ERROR, "PiiError", &m),
            }
        }
        ("DELETE", ["files", id]) => match files::remove(&conn, id) {
            Ok(true) => Json(json!({"data": null})).into_response(),
            Ok(false) => not_found(),
            Err(m) => fail(m),
        },
        // the mail owed (D15): counts and the recent rows, never an address or a text
        ("GET", ["outbox"]) => match outbox::summary(&conn, query_param_exact(raw.as_deref(), "tenant").filter(|t| !t.is_empty()).as_deref(), 50) {
            Ok(s) => Json(json!({"data": s})).into_response(),
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
        // how many submissions each form has, for one workspace (or all) and optionally a creation window [from, before): the
        // numbers an analytics screen shows next to the engine's own; no personal data is read, so no key is needed
        ("GET", ["forms", "summary"]) => {
            let (mut tenant, mut from, mut before) = (None, None, None);
            for pair in raw.as_deref().unwrap_or("").split('&').filter(|p| !p.is_empty()) {
                let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
                let v = percent_decode(v);
                let time = |v: &str| jobs::parse_iso(v).map(jobs::iso).ok_or_else(|| format!("{k} is not a time"));
                match k {
                    "tenant" if !v.is_empty() => tenant = Some(v),
                    "from" => from = match time(&v) { Ok(t) => Some(t), Err(m) => return bad(m) },
                    "before" => before = match time(&v) { Ok(t) => Some(t), Err(m) => return bad(m) },
                    _ => return bad(format!("unsupported parameter {k}")),
                }
            }
            let mut out = serde_json::Map::new();
            for c in forms::COLLECTIONS {
                match records::count(&conn, c, tenant.as_deref(), from.as_deref(), before.as_deref()) {
                    Ok(n) => { out.insert(c.into(), json!(n)); }
                    Err(m) => return bad(m),
                }
            }
            Json(json!({"data": out})).into_response()
        }
        // the cookie-consent numbers an analytics screen shows: {total, accept, reject, custom}, for one workspace (or all)
        // and optionally a creation window [from, before)
        ("GET", ["consent", "summary"]) => {
            let (mut tenant, mut from, mut before) = (None, None, None);
            for pair in raw.as_deref().unwrap_or("").split('&').filter(|p| !p.is_empty()) {
                let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
                let v = percent_decode(v);
                let time = |v: &str| jobs::parse_iso(v).map(jobs::iso).ok_or_else(|| format!("{k} is not a time"));
                match k {
                    "tenant" if !v.is_empty() => tenant = Some(v),
                    "from" => from = match time(&v) { Ok(t) => Some(t), Err(m) => return bad(m) },
                    "before" => before = match time(&v) { Ok(t) => Some(t), Err(m) => return bad(m) },
                    _ => return bad(format!("unsupported parameter {k}")),
                }
            }
            match records::count_by(&conn, "consent-log", "action", tenant.as_deref(), from.as_deref(), before.as_deref()) {
                Ok(counts) => Json(json!({"data": visitors::consent_summary(&counts)})).into_response(),
                Err(m) => bad(m),
            }
        }
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

fn env_nonempty(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|t| !t.trim().is_empty())
}

/// A positive whole number from a flag, or the reason the service will not start.
fn seconds_arg(name: &str, default: &str) -> i64 {
    arg(name, default).parse::<i64>().ok().filter(|n| *n > 0).unwrap_or_else(|| panic!("--{name} must be a whole number of seconds, more than 0"))
}

#[tokio::main]
async fn main() {
    let db = arg("db", "control.db");
    if std::env::args().nth(1).as_deref() == Some("keygen") {
        // 32 random bytes, base64: a WEBX_CONTROL_SIGNING_KEY, or a WEBX_CONTROL_SECRET_KEY (run it once for each)
        println!("{}", identity::new_seed().unwrap_or_else(|e| panic!("{e}")));
        return;
    }
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
    conn.execute_batch(sessions::DDL).unwrap_or_else(|e| panic!("{e}"));
    sessions::migrate(&conn).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(mfa::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(jobs::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(schedules::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(search_stats::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(files::DDL).unwrap_or_else(|e| panic!("{e}"));
    conn.execute_batch(outbox::DDL).unwrap_or_else(|e| panic!("{e}"));
    let keys = identity::Keys::load(&conn, env_nonempty("WEBX_CONTROL_SIGNING_KEY").as_deref(), env_nonempty("WEBX_CONTROL_SIGNING_KEY_PREVIOUS").as_deref()).unwrap_or_else(|e| panic!("{e}"));
    let token_hash = |name: &str| std::env::var(name).ok().filter(|t| !t.is_empty()).map(|t| <[u8; 32]>::from(Sha256::digest(t.as_bytes())));
    let admin_hash = token_hash("WEBX_CONTROL_ADMIN_TOKEN");
    let service_hash = token_hash("WEBX_CONTROL_SERVICE_TOKEN");
    let auth_hash = token_hash("WEBX_CONTROL_AUTH_TOKEN");
    let engine_hash = token_hash("WEBX_CONTROL_ENGINE_TOKEN");
    // the point of separate credentials is that holding one is not holding another: the two new ones may not repeat an existing one
    for (name, h) in [("WEBX_CONTROL_AUTH_TOKEN", auth_hash), ("WEBX_CONTROL_ENGINE_TOKEN", engine_hash)] {
        for (other, o) in [("WEBX_CONTROL_SERVICE_TOKEN", service_hash), ("WEBX_CONTROL_ADMIN_TOKEN", admin_hash), ("WEBX_CONTROL_AUTH_TOKEN", auth_hash), ("WEBX_CONTROL_ENGINE_TOKEN", engine_hash)] {
            if name != other && h.is_some() && h == o {
                panic!("{name} must not be the same value as {other}: each credential opens something different");
            }
        }
    }
    // the key control's own secrets are kept under; it is not the signing key, so that one leaking is not the other
    let secret_key = env_nonempty("WEBX_CONTROL_SECRET_KEY");
    if secret_key.is_some() && secret_key.as_deref().map(str::trim) == env_nonempty("WEBX_CONTROL_SIGNING_KEY").as_deref().map(str::trim) {
        panic!("WEBX_CONTROL_SECRET_KEY must not be the same value as WEBX_CONTROL_SIGNING_KEY: run webx-control keygen for each");
    }
    let secrets = secret_key.map(|k| secrets::SecretKey::from_base64(&k).unwrap_or_else(|e| panic!("{e}")));
    let secrets_on = secrets.is_some();
    let session_config = sessions::Config {
        access_secs: seconds_arg("token-ttl", "900"),
        idle_secs: seconds_arg("session-idle", "28800"),
        absolute_secs: seconds_arg("session-max", "86400"),
        grace_secs: seconds_arg("refresh-grace", "20"),
        engine_secs: seconds_arg("engine-token-ttl", "60"),
    };
    let n = registry::list(&conn).map(|l| l.len()).unwrap_or(0);
    let pii = std::env::var("WEBX_PII_KEY").ok().filter(|k| !k.trim().is_empty()).map(|k| pii::Pii::from_base64(&k).unwrap_or_else(|e| panic!("WEBX_PII_KEY: {e}")));
    let pii_on = pii.is_some();
    let mailer = mailer::Mailer::from_env().unwrap_or_else(|e| panic!("{e}"));
    let mail_on = mailer.is_some();
    let state: Shared = Arc::new(App { conn: Mutex::new(conn), admin: admin_hash, service: service_hash, served: Default::default(), strict: std::env::args().any(|a| a == "--strict-tenants"), keys, auth: auth_hash, engine: engine_hash, sessions: session_config, secrets, limiter: Default::default(), proxies: std::env::var("WEBX_TRUSTED_PROXIES").ok().filter(|v| !v.trim().is_empty()).map_or(1, |v| v.trim().parse().unwrap_or_else(|_| panic!("WEBX_TRUSTED_PROXIES must be a number (0 when no proxy is in front)"))), origins: visitors::allowed_origins(&std::env::var("WEBX_PUBLIC_SITE_ORIGINS").unwrap_or_default()), captchas: Default::default(), captcha_on: std::env::var("WEBX_CAPTCHA").map_or(true, |v| v != "off"), pii, notify_to: std::env::var("WEBX_COMPLAINT_NOTIFY_EMAIL").ok().filter(|t| !t.trim().is_empty()), assist: Arc::new(assist::Settings::from_env()) });
    let state_for_log = state.clone();
    {
        let k = &state.keys;
        let kids = k.kids();
        eprintln!(
            "[webx-control] identity: signing key {} ({}), previous key {}; sessions and tokens for Studio {}; engine API {}; client secrets and MFA {}",
            kids[0],
            k.current_from,
            match (kids.get(1), k.previous_from) { (Some(kid), Some(from)) => format!("{kid} ({from}), still believed until it is unset"), _ => "none".to_string() },
            if auth_hash.is_some() { "on" } else { "off: set WEBX_CONTROL_AUTH_TOKEN" },
            if engine_hash.is_some() { "on" } else { "off: set WEBX_CONTROL_ENGINE_TOKEN" },
            if secrets_on { "on" } else { "off: set WEBX_CONTROL_SECRET_KEY" },
        );
    }
    let app = Router::new()
        .route("/_health", get(|State(app): State<Shared>| async move { Json(json!({"ok": true, "service": "webx-control", "served": app.served.load(std::sync::atomic::Ordering::Relaxed)})) }))
        .route("/api/tenants/:what", get(public))
        .route("/api/consent-logs", post(consent_log).layer(axum::extract::DefaultBodyLimit::max(16 * 1024)))
        .route("/api/search-stats/log", post(search_stat_log).layer(axum::extract::DefaultBodyLimit::max(4 * 1024)))
        .route("/api/captcha", get(captcha_issue))
        .route("/api/assist/ask", post(assist_ask).layer(axum::extract::DefaultBodyLimit::max(16 * 1024)))
        .route("/api/assist/status", get(assist_status))
        .route("/api/assist/simplify", post(assist_simplify).layer(axum::extract::DefaultBodyLimit::max(64 * 1024)))
        .route("/api/assist/translate", post(assist_translate).layer(axum::extract::DefaultBodyLimit::max(64 * 1024)))
        .route("/api/assist/find", post(assist_find).layer(axum::extract::DefaultBodyLimit::max(16 * 1024)))
        .route("/api/complaints", post(complaint_submit).layer(axum::extract::DefaultBodyLimit::max(64 * 1024)))
        .route("/api/applications", post(application_submit).layer(axum::extract::DefaultBodyLimit::max(64 * 1024)))
        .route("/api/registrations", post(registration_submit).layer(axum::extract::DefaultBodyLimit::max(64 * 1024)))
        .route("/api/contact-messages", post(contact_message_submit).layer(axum::extract::DefaultBodyLimit::max(64 * 1024)))
        .route("/api/complaints/submit", post(complaint_submit_file).layer(axum::extract::DefaultBodyLimit::max(6 * 1024 * 1024)))
        .route("/api/applications/submit", post(application_submit_file).layer(axum::extract::DefaultBodyLimit::max(6 * 1024 * 1024)))
        .route("/api/complaints/track/:ref", get(complaint_track))
        .route("/api/applications/track/:ref", get(application_track))
        .route("/.well-known/jwks.json", get(jwks))
        .route("/api/auth/me", get(me))
        .route("/api/auth/mfa/:what", any(my_mfa).layer(axum::extract::DefaultBodyLimit::max(4 * 1024)))
        .route("/admin/*rest", any(admin))
        .route("/engine/*rest", any(engine))
        .route("/internal/*rest", any(internal).layer(axum::extract::DefaultBodyLimit::max(32 * 1024 * 1024)))
        .fallback(|| async { not_found() })
        .with_state(state.clone())
        .layer(middleware::from_fn_with_state(state.clone(), client_key))
        .layer(middleware::from_fn_with_state(state.clone(), cors));
    let state_for_mail = state;
    if let Some(m) = mailer {
        tokio::spawn(mail_loop(state_for_mail, Arc::new(m)));
    }
    // the loopback address unless told otherwise: in a container, or behind a proxy on another host, give --host 0.0.0.0
    let host: std::net::IpAddr = arg("host", "127.0.0.1").parse().unwrap_or_else(|_| panic!("--host must be an IP address"));
    let listener = tokio::net::TcpListener::bind((host, port)).await.unwrap_or_else(|e| panic!("bind {host}:{port}: {e}"));
    eprintln!("[webx-control] http://{host}:{port} ({n} tenant(s) in {db}; admin API {}, internal API {}, forms {}, mail {}, assistant {}; {})", if admin_hash.is_some() { "on" } else { "off" }, if service_hash.is_some() { "on" } else { "off" }, if pii_on { "on" } else { "off: set WEBX_PII_KEY" }, if mail_on { "on" } else { "queued only: set WEBX_SMTP_URL" }, if state_for_log.assist.ask.is_some() { "answers by LLM" } else { "quotes only: set LITELLM_URL" }, if state_for_log.proxies == 0 { "X-Forwarded-For ignored: callers are counted at the connecting address".to_string() } else { format!("{} proxy hop(s) trusted for X-Forwarded-For: set WEBX_TRUSTED_PROXIES=0 if none is in front", state_for_log.proxies) });
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await.unwrap();
}
