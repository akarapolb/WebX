//! Sessions (docs/c4-identity-plan.md, step 2): who is signed in, for how long, and how to end that. Studio is the only
//! caller (the "broker", with its own credential), and it is not calling yet: nothing here changes who can sign in to anything.
//!
//! A person signs in at their workspace's OIDC provider, Studio completes that exchange (decision D17) and hands control what
//! the provider said: {issuer, subject, e-mail, whether the provider verified it}. Control decides, as below, and creates a
//! session: an access token (identity.rs, 15 minutes) and an opaque refresh token. Refresh rotates the token; the one before
//! it works for a few seconds more (two tabs, two replicas), and once that is over its use means it was copied, so the whole
//! session ends. Disabling or deleting a user, removing a workspace membership or changing a role, changing a user's
//! sign-in identity or a workspace's provider, and logging out end sessions at once, each with a row in the audit table.
//!
//! Who may sign in, for a workspace:
//!  - The provider must be the workspace's own (`workspace_identity.issuer`, exact match), and the e-mail verified by it (unless
//!    the workspace says otherwise). A provider is believed about the people of its own workspace, and about nobody else's.
//!  - A person is found by (issuer, subject). The first time, they are linked by e-mail if they hold a membership, or made on
//!    the spot if the workspace allows that (`allow_jit`), with the role it names. A second subject for an e-mail that is
//!    already linked to another is refused: that is what a provider that re-used an address looks like.
//!  - A super admin is tied to no workspace, so no workspace's provider may vouch for one. They sign in only through an identity
//!    an operator linked (`PUT /admin/users/<email>/identities`), never by e-mail or on the spot.
//!  - A session may move to another workspace only if that workspace's provider is the one the session was made with.
use crate::audit;
use crate::identity::{self, Grant, Keys, User, AUD_ENGINE, AUD_STUDIO};
use crate::jobs;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS workspace_identity(
  tenant_key TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  allow_jit INTEGER NOT NULL DEFAULT 0,
  jit_role TEXT,
  require_verified_email INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS identities(
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(issuer, subject)
);
CREATE UNIQUE INDEX IF NOT EXISTS identities_one_per_issuer ON identities(issuer, user_id);
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_key TEXT,
  issuer TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  idle_expires_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL,
  refresh_hash BLOB NOT NULL,
  previous_hash BLOB,
  previous_until INTEGER,
  mfa_at INTEGER,
  amr TEXT NOT NULL DEFAULT '[]',
  ip TEXT,
  ua TEXT,
  revoked_at INTEGER,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
";

/// How long things live (decision D16; the flags in main.rs).
#[derive(Clone, Copy)]
pub struct Config {
    /// an access token (`--token-ttl`)
    pub access_secs: i64,
    /// a session that is not refreshed ends this long after the last refresh (`--session-idle`)
    pub idle_secs: i64,
    /// a session ends this long after it began, however busy (`--session-max`)
    pub absolute_secs: i64,
    /// the refresh token before the current one still works this long (`--refresh-grace`)
    pub grace_secs: i64,
    /// an engine's acting token (`--engine-token-ttl`)
    pub engine_secs: i64,
}
impl Default for Config {
    fn default() -> Self {
        Config { access_secs: 900, idle_secs: 8 * 3600, absolute_secs: 24 * 3600, grace_secs: 20, engine_secs: 60 }
    }
}

/// Why a request was refused, for the broker: the HTTP status, a short machine-readable reason and a message.
#[derive(Debug)]
pub struct Refusal {
    pub status: u16,
    pub reason: &'static str,
    pub message: String,
}
impl Refusal {
    fn new(status: u16, reason: &'static str, message: &str) -> Refusal {
        Refusal { status, reason, message: message.to_string() }
    }
    fn bad(message: &str) -> Refusal {
        Refusal::new(400, "bad_request", message)
    }
    fn denied(reason: &'static str, message: &str) -> Refusal {
        Refusal::new(403, reason, message)
    }
    fn ended(reason: &'static str) -> Refusal {
        Refusal::new(401, reason, "the session has ended")
    }
}
impl From<String> for Refusal {
    fn from(m: String) -> Refusal {
        Refusal { status: 500, reason: "internal_error", message: m }
    }
}
impl From<&str> for Refusal {
    fn from(m: &str) -> Refusal {
        Refusal::from(m.to_string())
    }
}
impl From<rusqlite::Error> for Refusal {
    fn from(m: rusqlite::Error) -> Refusal {
        Refusal::from(m.to_string())
    }
}

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

fn sha(s: &str) -> Vec<u8> {
    Sha256::digest(s.as_bytes()).to_vec()
}

fn random_b64(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    getrandom::getrandom(&mut b).expect("random bytes");
    B64.encode(b)
}

fn stamp(now: i64) -> String {
    jobs::iso(now * 1000)
}

/// Free text that came from outside (an address, a browser's name): without control characters, cut to `max`.
fn clean(s: Option<&str>, max: usize) -> Option<String> {
    s.map(|s| s.chars().filter(|c| !c.is_control()).take(max).collect::<String>()).filter(|s| !s.is_empty())
}

// ---------------------------------------------------------------- audit

/// One row in the audit table for something that happened to a session or a sign-in. `sid` is the session it concerns, if any
/// (every event of a session carries it).
fn audit_event(conn: &Connection, now: i64, action: &str, email: Option<&str>, tenant: Option<&str>, sid: Option<&str>, actor: &str, detail: &str) -> Result<(), String> {
    let at = stamp(now);
    audit::create(conn, &json!({"action": action, "contentType": "webx::session", "entryId": sid, "adminEmail": email, "tenantKey": tenant, "actor": actor, "targetRef": detail, "at": at}), &at).map(|_| ())
}

// ---------------------------------------------------------------- what a workspace accepts

pub struct Policy {
    pub tenant_key: String,
    pub issuer: String,
    pub allow_jit: bool,
    pub jit_role: Option<String>,
    pub require_verified_email: bool,
}
impl Policy {
    pub fn to_json(&self) -> Value {
        json!({"tenantKey": self.tenant_key, "issuer": self.issuer, "allowJit": self.allow_jit, "jitRole": self.jit_role, "requireVerifiedEmail": self.require_verified_email})
    }
}

/// An issuer is an https URL without query or fragment (http only for a provider on this machine, for development).
pub fn valid_issuer(s: &str) -> bool {
    if s.len() > 2048 || s.chars().any(|c| c.is_control() || c.is_whitespace()) || s.contains(['?', '#', '@']) {
        return false;
    }
    let Some((scheme, rest)) = s.split_once("://") else { return false };
    let host = rest.split('/').next().unwrap_or("");
    if host.is_empty() {
        return false;
    }
    let name = match host.rsplit_once(':') {
        Some((h, p)) if !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) => h,
        _ => host,
    };
    match scheme {
        "https" => true,
        "http" => name == "localhost" || name == "127.0.0.1" || name == "[::1]" || name.ends_with(".localhost"),
        _ => false,
    }
}

fn valid_subject(s: &str) -> bool {
    (1..=255).contains(&s.len()) && !s.chars().any(char::is_control)
}

pub fn policy(conn: &Connection, tenant: &str) -> Result<Option<Policy>, String> {
    conn.query_row("SELECT tenant_key, issuer, allow_jit, jit_role, require_verified_email FROM workspace_identity WHERE tenant_key=?1", [tenant], |r| {
        Ok(Policy { tenant_key: r.get(0)?, issuer: r.get(1)?, allow_jit: r.get(2)?, jit_role: r.get(3)?, require_verified_email: r.get(4)? })
    })
    .optional()
    .map_err(e)
}

/// Set what a workspace accepts. body: {issuer, allowJit?, jitRole?, requireVerifiedEmail?}. Returns true when it was created.
/// Changing the provider ends the sessions that were made with the old one.
pub fn put_policy(conn: &Connection, tenant: &str, body: &Value, now: i64) -> Result<bool, String> {
    if !identity::valid_tenant(tenant) {
        return Err(format!("tenantKey {tenant:?} is not valid"));
    }
    let issuer = body.get("issuer").and_then(Value::as_str).unwrap_or("");
    if !valid_issuer(issuer) {
        return Err("issuer must be an https URL without a query or fragment".into());
    }
    let allow_jit = match body.get("allowJit") {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        _ => return Err("allowJit must be true or false".into()),
    };
    let require_verified = match body.get("requireVerifiedEmail") {
        None | Some(Value::Null) => true,
        Some(Value::Bool(b)) => *b,
        _ => return Err("requireVerifiedEmail must be true or false".into()),
    };
    let jit_role = match body.get("jitRole") {
        None | Some(Value::Null) => None,
        Some(Value::String(r)) if identity::valid_role(r) => Some(r.clone()),
        _ => return Err("jitRole is not a valid role".into()),
    };
    if allow_jit && jit_role.is_none() {
        return Err("allowJit needs a jitRole: the role a person made on the spot gets".into());
    }
    let tx = conn.unchecked_transaction().map_err(e)?;
    let before = policy(&tx, tenant)?;
    tx.execute(
        "INSERT INTO workspace_identity(tenant_key, issuer, allow_jit, jit_role, require_verified_email, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(tenant_key) DO UPDATE SET issuer=?2, allow_jit=?3, jit_role=?4, require_verified_email=?5, updated_at=?6",
        params![tenant, issuer, allow_jit, jit_role, require_verified, stamp(now)],
    )
    .map_err(e)?;
    if before.as_ref().is_some_and(|b| b.issuer != issuer) {
        end_where(&tx, now, "tenant_key=?1 AND issuer<>?2 AND user_id IN (SELECT id FROM users WHERE super_admin=0)", params![tenant, issuer], "issuer_changed", "admin")?;
    }
    tx.commit().map_err(e)?;
    Ok(before.is_none())
}

/// Stop accepting sign-ins for a workspace; the sessions of its people end.
pub fn delete_policy(conn: &Connection, tenant: &str, now: i64) -> Result<bool, String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    let had = tx.execute("DELETE FROM workspace_identity WHERE tenant_key=?1", [tenant]).map_err(e)? > 0;
    if had {
        end_where(&tx, now, "tenant_key=?1 AND user_id IN (SELECT id FROM users WHERE super_admin=0)", params![tenant], "workspace_identity_removed", "admin")?;
    }
    tx.commit().map_err(e)?;
    Ok(had)
}

/// A workspace that is gone: nothing signs in to it, and every session in it ends (a super admin's too).
pub fn workspace_removed(conn: &Connection, tenant: &str, now: i64) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    tx.execute("DELETE FROM workspace_identity WHERE tenant_key=?1", [tenant]).map_err(e)?;
    end_where(&tx, now, "tenant_key=?1", params![tenant], "workspace_removed", "admin")?;
    tx.commit().map_err(e)
}

// ---------------------------------------------------------------- identities

pub struct Identity {
    pub issuer: String,
    pub subject: String,
    pub linked_by: String,
    pub created_at: String,
}

pub fn identities_of(conn: &Connection, user_id: i64) -> Result<Vec<Identity>, String> {
    let mut st = conn.prepare("SELECT issuer, subject, linked_by, created_at FROM identities WHERE user_id=?1 ORDER BY issuer").map_err(e)?;
    let rows = st.query_map([user_id], |r| Ok(Identity { issuer: r.get(0)?, subject: r.get(1)?, linked_by: r.get(2)?, created_at: r.get(3)? })).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    Ok(rows)
}

/// Replace the sign-in identities of a user, as an operator: body {identities: [{issuer, subject}]}. The only way a super admin gets
/// one. Anything removed or changed ends the user's sessions. Returns false when there is no such user.
pub fn set_identities(conn: &Connection, email: &str, body: &Value, now: i64) -> Result<bool, String> {
    let list = body.get("identities").and_then(Value::as_array).ok_or("identities must be a list")?;
    if list.len() > 16 {
        return Err("at most 16 identities".into());
    }
    let mut wanted: Vec<(String, String)> = Vec::new();
    for i in list {
        let (iss, sub) = (i.get("issuer").and_then(Value::as_str).unwrap_or(""), i.get("subject").and_then(Value::as_str).unwrap_or(""));
        if !valid_issuer(iss) {
            return Err(format!("issuer {iss:?} is not valid"));
        }
        if !valid_subject(sub) {
            return Err("subject must be 1 to 255 characters of text".into());
        }
        if wanted.iter().any(|(x, _)| x == iss) {
            return Err(format!("issuer {iss} is listed twice: a person has one subject per provider"));
        }
        wanted.push((iss.to_string(), sub.to_string()));
    }
    let tx = conn.unchecked_transaction().map_err(e)?;
    let Some(user) = identity::get(&tx, email)? else { return Ok(false) };
    let before = identities_of(&tx, user.id)?;
    for (iss, sub) in &wanted {
        // a (provider, subject) names one person
        if let Some(owner) = tx.query_row("SELECT user_id FROM identities WHERE issuer=?1 AND subject=?2", params![iss, sub], |r| r.get::<_, i64>(0)).optional().map_err(e)? {
            if owner != user.id {
                return Err(format!("that subject at {iss} already signs in as someone else"));
            }
        }
    }
    let unchanged = before.len() == wanted.len() && before.iter().all(|b| wanted.iter().any(|(i, s)| *i == b.issuer && *s == b.subject && b.linked_by == "admin"));
    if !unchanged {
        tx.execute("DELETE FROM identities WHERE user_id=?1", [user.id]).map_err(e)?;
        for (iss, sub) in &wanted {
            tx.execute("INSERT INTO identities(issuer, subject, user_id, linked_by, created_at) VALUES (?1,?2,?3,'admin',?4)", params![iss, sub, user.id, stamp(now)]).map_err(e)?;
        }
        end_where(&tx, now, "user_id=?1", params![user.id], "identity_changed", "admin")?;
    }
    tx.commit().map_err(e)?;
    Ok(true)
}

// ---------------------------------------------------------------- sessions

struct Session {
    id: String,
    user_id: i64,
    tenant: Option<String>,
    issuer: String,
    idle_expires_at: i64,
    absolute_expires_at: i64,
    refresh_hash: Vec<u8>,
    previous_hash: Option<Vec<u8>>,
    previous_until: Option<i64>,
    mfa_at: Option<i64>,
    amr: Vec<String>,
    created_at: i64,
    last_used_at: i64,
    revoked_at: Option<i64>,
    revoked_reason: Option<String>,
}

const SESSION_COLS: &str = "id, user_id, tenant_key, issuer, idle_expires_at, absolute_expires_at, refresh_hash, previous_hash, previous_until, mfa_at, amr, created_at, last_used_at, revoked_at, revoked_reason";

fn session(conn: &Connection, sid: &str) -> Result<Option<Session>, String> {
    conn.query_row(&format!("SELECT {SESSION_COLS} FROM sessions WHERE id=?1"), [sid], |r| {
        let amr: String = r.get(10)?;
        Ok(Session {
            id: r.get(0)?,
            user_id: r.get(1)?,
            tenant: r.get(2)?,
            issuer: r.get(3)?,
            idle_expires_at: r.get(4)?,
            absolute_expires_at: r.get(5)?,
            refresh_hash: r.get(6)?,
            previous_hash: r.get(7)?,
            previous_until: r.get(8)?,
            mfa_at: r.get(9)?,
            amr: serde_json::from_str(&amr).unwrap_or_default(),
            created_at: r.get(11)?,
            last_used_at: r.get(12)?,
            revoked_at: r.get(13)?,
            revoked_reason: r.get(14)?,
        })
    })
    .optional()
    .map_err(e)
}

/// The user of a session that is still good, or why it is not: "revoked", "expired", "user_disabled" or "membership_removed".
fn check_live(conn: &Connection, s: &Session, now: i64) -> Result<User, String> {
    if s.revoked_at.is_some() {
        return Err(s.revoked_reason.clone().map_or("revoked".to_string(), |r| format!("revoked: {r}")));
    }
    if now >= s.absolute_expires_at || now >= s.idle_expires_at {
        return Err("expired".into());
    }
    let user = identity::get_by_id(conn, s.user_id)?.ok_or("user_deleted")?;
    if user.disabled {
        return Err("user_disabled".into());
    }
    if let Some(t) = &s.tenant {
        if !user.may_act_in(t) {
            return Err("membership_removed".into());
        }
    }
    Ok(user)
}

/// The access token of a session, for its active workspace.
fn access_for(keys: &Keys, cfg: &Config, user: &User, s: &Session, now: i64) -> Result<(String, i64), String> {
    identity::issue_token(keys, user, &Grant { aud: AUD_STUDIO, tenant: s.tenant.as_deref(), sid: Some(&s.id), mfa: s.mfa_at.is_some(), amr: &s.amr, ttl: cfg.access_secs, job: None }, now)
}

/// End the sessions matching `filter` (an SQL condition on the `sessions` table, with `args` as ?1, ?2, ...) that are not yet over,
/// writing a `revoke` row for each. Returns how many.
fn end_where(conn: &Connection, now: i64, filter: &str, args: &[&dyn rusqlite::ToSql], reason: &str, actor: &str) -> Result<usize, String> {
    let sql = format!("SELECT id, user_id, tenant_key FROM sessions WHERE revoked_at IS NULL AND ({filter})");
    let mut st = conn.prepare(&sql).map_err(e)?;
    let rows = st.query_map(args, |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?))).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    for (sid, uid, tenant) in &rows {
        conn.execute("UPDATE sessions SET revoked_at=?2, revoked_reason=?3 WHERE id=?1 AND revoked_at IS NULL", params![sid, now, reason]).map_err(e)?;
        let email = identity::get_by_id(conn, *uid)?.map(|u| u.email);
        audit_event(conn, now, "revoke", email.as_deref(), tenant.as_deref(), Some(sid), actor, reason)?;
    }
    Ok(rows.len())
}

// ---------------------------------------------------------------- sign in

#[derive(Debug)]
pub struct SignIn {
    pub issuer: String,
    pub subject: String,
    pub email: String,
    pub email_verified: bool,
    pub amr: Vec<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    /// the workspace being signed in to
    pub tenant: String,
}

impl SignIn {
    /// From the broker's body: {issuer, subject, email, emailVerified, amr?, ip?, userAgent?, tenantKey}.
    pub fn from_json(v: &Value) -> Result<SignIn, Refusal> {
        let text = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("");
        let (issuer, subject, tenant) = (text("issuer"), text("subject"), text("tenantKey"));
        let email = text("email").to_lowercase();
        if !valid_issuer(issuer) {
            return Err(Refusal::bad("issuer must be an https URL without a query or fragment"));
        }
        if !valid_subject(subject) {
            return Err(Refusal::bad("subject must be 1 to 255 characters of text"));
        }
        if !identity::valid_email(&email) {
            return Err(Refusal::bad("email is not valid"));
        }
        if !identity::valid_tenant(tenant) {
            return Err(Refusal::bad("tenantKey is not valid"));
        }
        // what the provider said it did: informational, so anything odd is dropped, not refused
        let amr: Vec<String> = v.get("amr").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).filter(|s| (1..=32).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"_-.:".contains(&b))).take(8).map(String::from).collect()).unwrap_or_default();
        Ok(SignIn {
            issuer: issuer.to_string(),
            subject: subject.to_string(),
            email,
            email_verified: v.get("emailVerified").and_then(Value::as_bool).unwrap_or(false),
            amr,
            ip: clean(v.get("ip").and_then(Value::as_str), 64),
            user_agent: clean(v.get("userAgent").and_then(Value::as_str), 200),
            tenant: tenant.to_string(),
        })
    }
}

/// What the decision found: who the person is, and what has to be written for them to be it.
struct Decision {
    user: Option<User>,
    add_membership: Option<(String, String)>,
    /// link the (issuer, subject) to the user, as "email" or "jit"
    link_by: Option<&'static str>,
    how: &'static str,
}

fn decide(conn: &Connection, req: &SignIn) -> Result<Decision, (&'static str, &'static str)> {
    let db = |_: String| ("internal_error", "the identity store could not be read");
    let policy = policy(conn, &req.tenant).map_err(db)?;
    let linked: Option<(i64, String)> = conn.query_row("SELECT user_id, linked_by FROM identities WHERE issuer=?1 AND subject=?2", params![req.issuer, req.subject], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|x| db(x.to_string()))?;
    // the provider has to be the workspace's own, for everyone but a super admin (checked below)
    let own_provider = |p: &Option<Policy>| match p {
        None => Err(("workspace_not_configured", "this workspace does not sign in through webx-control")),
        Some(p) if p.issuer != req.issuer => Err(("issuer_mismatch", "that provider is not this workspace's provider")),
        Some(_) => Ok(()),
    };
    if let Some((uid, linked_by)) = linked {
        let user = identity::get_by_id(conn, uid).map_err(db)?.ok_or(("internal_error", "the identity store could not be read"))?;
        if user.disabled {
            return Err(("user_disabled", "this account is disabled"));
        }
        if user.super_admin {
            if linked_by != "admin" {
                return Err(("super_admin_needs_operator_link", "a super admin signs in only through an identity an operator linked"));
            }
            return Ok(Decision { user: Some(user), add_membership: None, link_by: None, how: "identity" });
        }
        own_provider(&policy)?;
        let policy = policy.expect("checked by own_provider");
        if user.role_in(&req.tenant).is_some() {
            return Ok(Decision { user: Some(user), add_membership: None, link_by: None, how: "identity" });
        }
        return match (policy.allow_jit, policy.jit_role) {
            (true, Some(role)) => Ok(Decision { add_membership: Some((req.tenant.clone(), role)), user: Some(user), link_by: None, how: "jit_membership" }),
            _ => Err(("not_a_member", "this account is not a member of that workspace")),
        };
    }
    // first sign-in of this (issuer, subject)
    own_provider(&policy)?;
    let policy = policy.expect("checked by own_provider");
    if policy.require_verified_email && !req.email_verified {
        return Err(("email_not_verified", "the provider has not verified that e-mail address"));
    }
    match identity::get(conn, &req.email).map_err(db)? {
        Some(user) => {
            if user.super_admin {
                return Err(("super_admin_needs_operator_link", "a super admin signs in only through an identity an operator linked"));
            }
            if user.disabled {
                return Err(("user_disabled", "this account is disabled"));
            }
            let other: Option<String> = conn.query_row("SELECT subject FROM identities WHERE issuer=?1 AND user_id=?2", params![req.issuer, user.id], |r| r.get(0)).optional().map_err(|x| db(x.to_string()))?;
            if other.is_some() {
                return Err(("subject_changed", "that e-mail already signs in at this provider as someone else; an operator has to relink it"));
            }
            if user.role_in(&req.tenant).is_some() {
                return Ok(Decision { user: Some(user), add_membership: None, link_by: Some("email"), how: "email_link" });
            }
            match (policy.allow_jit, policy.jit_role) {
                (true, Some(role)) => Ok(Decision { add_membership: Some((req.tenant.clone(), role)), user: Some(user), link_by: Some("email"), how: "email_link_jit" }),
                _ => Err(("not_a_member", "this account is not a member of that workspace")),
            }
        }
        None => match (policy.allow_jit, policy.jit_role) {
            (true, Some(role)) => Ok(Decision { user: None, add_membership: Some((req.tenant.clone(), role)), link_by: Some("jit"), how: "jit" }),
            _ => Err(("unknown_user", "no such user in this workspace")),
        },
    }
}

fn detail(what: &str, ip: &Option<String>) -> String {
    match ip {
        Some(ip) => format!("{what} ip={ip}"),
        None => what.to_string(),
    }
}

/// Sign a person in: decide as the module's comment says, and on success make the session. Returns
/// {sessionId, accessToken, accessExpiresAt, refreshToken, idleExpiresAt, absoluteExpiresAt}.
pub fn sign_in(conn: &Connection, keys: &Keys, cfg: &Config, req: &SignIn, now: i64) -> Result<Value, Refusal> {
    let decision = match decide(conn, req) {
        Ok(d) => d,
        Err((reason, message)) => {
            if reason == "internal_error" {
                return Err(Refusal::new(500, reason, message));
            }
            audit_event(conn, now, "sign_in_refused", Some(&req.email), Some(&req.tenant), None, "user", &detail(reason, &req.ip))?;
            return Err(Refusal::denied(reason, message));
        }
    };
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM sessions WHERE absolute_expires_at < ?1 OR (revoked_at IS NOT NULL AND revoked_at < ?1)", [now - 7 * 86_400])?;
    let (user_id, created) = match &decision.user {
        Some(u) => (u.id, false),
        None => {
            tx.execute("INSERT INTO users(email, name, disabled, super_admin, created_at, updated_at) VALUES (?1, NULL, 0, 0, ?2, ?2)", params![req.email, stamp(now)])?;
            (tx.last_insert_rowid(), true)
        }
    };
    if let Some((tenant, role)) = &decision.add_membership {
        tx.execute("INSERT OR IGNORE INTO memberships(user_id, tenant_key, role) VALUES (?1,?2,?3)", params![user_id, tenant, role])?;
    }
    if let Some(by) = decision.link_by {
        tx.execute("INSERT INTO identities(issuer, subject, user_id, linked_by, created_at) VALUES (?1,?2,?3,?4,?5)", params![req.issuer, req.subject, user_id, by, stamp(now)])?;
    }
    let sid = random_b64(16);
    let secret = random_b64(32);
    let idle = (now + cfg.idle_secs).min(now + cfg.absolute_secs);
    let absolute = now + cfg.absolute_secs;
    tx.execute(
        "INSERT INTO sessions(id, user_id, tenant_key, issuer, created_at, last_used_at, idle_expires_at, absolute_expires_at, refresh_hash, mfa_at, amr, ip, ua)
         VALUES (?1,?2,?3,?4,?5,?5,?6,?7,?8,NULL,?9,?10,?11)",
        params![sid, user_id, req.tenant, req.issuer, now, idle, absolute, sha(&secret), json!(req.amr).to_string(), req.ip, req.user_agent],
    )?;
    let user = identity::get_by_id(&tx, user_id)?.ok_or("user vanished")?;
    if created {
        audit_event(&tx, now, "user_provisioned", Some(&user.email), Some(&req.tenant), Some(&sid), "user", &detail(&format!("jit role={}", decision.add_membership.as_ref().map_or("", |m| m.1.as_str())), &req.ip))?;
    }
    if decision.link_by.is_some() {
        audit_event(&tx, now, "identity_linked", Some(&user.email), Some(&req.tenant), Some(&sid), "user", &detail(decision.how, &req.ip))?;
    }
    audit_event(&tx, now, "sign_in", Some(&user.email), Some(&req.tenant), Some(&sid), "user", &detail(decision.how, &req.ip))?;
    let s = session(&tx, &sid)?.ok_or("session vanished")?;
    let (access, access_exp) = access_for(keys, cfg, &user, &s, now)?;
    tx.commit()?;
    Ok(json!({"sessionId": sid, "accessToken": access, "accessExpiresAt": access_exp, "refreshToken": format!("{sid}.{secret}"), "idleExpiresAt": idle, "absoluteExpiresAt": absolute}))
}

// ---------------------------------------------------------------- refresh, switch, status, end

/// Trade a refresh token for a new access token. The refresh token is replaced, and the one before keeps working for
/// `grace_secs` (and gets an access token only, since another tab holds the new refresh token). A token that was replaced longer
/// ago than that and is shown again was copied: the session ends. Returns {sessionId, accessToken, accessExpiresAt,
/// refreshToken?, idleExpiresAt, absoluteExpiresAt}.
pub fn refresh(conn: &Connection, keys: &Keys, cfg: &Config, token: &str, now: i64) -> Result<Value, Refusal> {
    let invalid = || Refusal::new(401, "invalid_refresh_token", "the refresh token is not valid");
    let (sid, secret) = token.split_once('.').filter(|(a, b)| !a.is_empty() && !b.is_empty() && token.len() <= 256).ok_or_else(invalid)?;
    let s = session(conn, sid)?.ok_or_else(invalid)?;
    let presented = sha(secret);
    let is_current = presented == s.refresh_hash;
    let is_previous = s.previous_hash.as_ref().is_some_and(|p| *p == presented);
    if !is_current && !is_previous {
        // not revoked: anyone who has seen a session id (it is in the access token) could end it with a wrong guess
        return Err(invalid());
    }
    // a session that is over is over, whichever token is shown; only a session that is still good can be stolen from
    let user = match check_live(conn, &s, now) {
        Ok(u) => u,
        Err(why) => {
            // a user who is gone or lost the workspace ends the session here, if the change did not already
            if matches!(why.as_str(), "user_disabled" | "membership_removed" | "user_deleted") {
                let tx = conn.unchecked_transaction()?;
                end_where(&tx, now, "id=?1", params![sid], &why, "control")?;
                tx.commit()?;
            }
            return Err(Refusal::ended("session_ended"));
        }
    };
    if !is_current && s.previous_until.is_none_or(|u| now > u) {
        let tx = conn.unchecked_transaction()?;
        tx.execute("UPDATE sessions SET revoked_at=?2, revoked_reason='refresh_reuse' WHERE id=?1 AND revoked_at IS NULL", params![sid, now])?;
        audit_event(&tx, now, "refresh_reuse", Some(&user.email), s.tenant.as_deref(), Some(sid), "user", "a refresh token was used again after it was replaced")?;
        tx.commit()?;
        return Err(Refusal::ended("refresh_reuse"));
    }
    // the new access token first: if it cannot be made nothing is rotated, so the person's refresh token is still the right one
    let (access, exp) = access_for(keys, cfg, &user, &s, now)?;
    let mut out = json!({"sessionId": sid, "accessToken": access, "accessExpiresAt": exp, "idleExpiresAt": s.idle_expires_at, "absoluteExpiresAt": s.absolute_expires_at});
    if is_current {
        let new_secret = random_b64(32);
        let idle = (now + cfg.idle_secs).min(s.absolute_expires_at);
        conn.execute(
            "UPDATE sessions SET previous_hash=refresh_hash, previous_until=?2, refresh_hash=?3, last_used_at=?4, idle_expires_at=?5 WHERE id=?1",
            params![sid, now + cfg.grace_secs, sha(&new_secret), now, idle],
        )?;
        out["refreshToken"] = json!(format!("{sid}.{new_secret}"));
        out["idleExpiresAt"] = json!(idle);
    }
    Ok(out)
}

/// Move a live session to another workspace of the same person: the person must be a member (a super admin needs no
/// membership), and the session must have been made with that workspace's own provider. Returns a new access token.
pub fn switch(conn: &Connection, keys: &Keys, cfg: &Config, sid: &str, tenant: &str, now: i64) -> Result<Value, Refusal> {
    if !identity::valid_tenant(tenant) {
        return Err(Refusal::bad("tenantKey is not valid"));
    }
    let s = session(conn, sid)?.ok_or_else(|| Refusal::ended("session_ended"))?;
    let user = check_live(conn, &s, now).map_err(|_| Refusal::ended("session_ended"))?;
    if !user.may_act_in(tenant) {
        return Err(Refusal::denied("not_a_member", "this account is not a member of that workspace"));
    }
    if !user.super_admin {
        match policy(conn, tenant)? {
            None => return Err(Refusal::denied("workspace_not_configured", "that workspace does not sign in through webx-control")),
            Some(p) if p.issuer != s.issuer => return Err(Refusal::denied("issuer_mismatch", "this session was not made with that workspace's provider: sign in there")),
            Some(_) => {}
        }
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE sessions SET tenant_key=?2 WHERE id=?1", params![sid, tenant])?;
    audit_event(&tx, now, "session_switch", Some(&user.email), Some(tenant), Some(sid), "user", &format!("from {}", s.tenant.as_deref().unwrap_or("-")))?;
    let moved = session(&tx, sid)?.ok_or("session vanished")?;
    let (access, exp) = access_for(keys, cfg, &user, &moved, now)?;
    tx.commit()?;
    Ok(json!({"sessionId": sid, "tenantKey": tenant, "accessToken": access, "accessExpiresAt": exp}))
}

/// Is the session good, and if not, why. None when there is no such session.
pub fn status(conn: &Connection, sid: &str, now: i64) -> Result<Option<Value>, String> {
    let Some(s) = session(conn, sid)? else { return Ok(None) };
    let live = check_live(conn, &s, now);
    Ok(Some(json!({
        "sessionId": s.id, "active": live.is_ok(), "reason": live.as_ref().err(), "tenantKey": s.tenant,
        "createdAt": s.created_at, "lastUsedAt": s.last_used_at, "idleExpiresAt": s.idle_expires_at, "absoluteExpiresAt": s.absolute_expires_at,
        "revokedAt": s.revoked_at, "mfa": s.mfa_at.is_some(),
    })))
}

/// The person logs out. Returns false when there is no such session; ending one that is over already is not an error.
pub fn logout(conn: &Connection, sid: &str, now: i64) -> Result<bool, String> {
    let Some(s) = session(conn, sid)? else { return Ok(false) };
    if s.revoked_at.is_none() {
        let tx = conn.unchecked_transaction().map_err(e)?;
        tx.execute("UPDATE sessions SET revoked_at=?2, revoked_reason='logout' WHERE id=?1 AND revoked_at IS NULL", params![sid, now]).map_err(e)?;
        let email = identity::get_by_id(&tx, s.user_id)?.map(|u| u.email);
        audit_event(&tx, now, "logout", email.as_deref(), s.tenant.as_deref(), Some(sid), "user", "logout")?;
        tx.commit().map_err(e)?;
    }
    Ok(true)
}

/// End every session of a user ("sign out everywhere"). Returns how many were live, or None when there is no such user.
pub fn revoke_user(conn: &Connection, email: &str, now: i64) -> Result<Option<usize>, String> {
    let Some(u) = identity::get(conn, email)? else { return Ok(None) };
    let tx = conn.unchecked_transaction().map_err(e)?;
    let n = end_where(&tx, now, "user_id=?1", params![u.id], "admin_revoke", "admin")?;
    tx.commit().map_err(e)?;
    Ok(Some(n))
}

// ---------------------------------------------------------------- users changed by an operator

/// Did `after` lose anything `before` had: enabled, a workspace, a role, or its place as (not) a super admin. Gaining a
/// workspace loses nothing.
fn access_changed(before: &User, after: &User) -> bool {
    (!before.disabled && after.disabled)
        || before.super_admin != after.super_admin
        || before.memberships.iter().any(|m| after.role_in(&m.tenant_key) != Some(m.role.as_str()))
}

/// `identity::upsert`, and the user's sessions end if what it did takes anything away (see access_changed).
pub fn replace_user(conn: &Connection, email: &str, body: &Value, now: i64) -> Result<bool, String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    let before = identity::get(&tx, email)?;
    let created = identity::upsert(&tx, email, body, &stamp(now))?;
    if let (Some(b), Some(a)) = (before, identity::get(&tx, email)?) {
        if access_changed(&b, &a) {
            let reason = if !b.disabled && a.disabled { "user_disabled" } else { "user_changed" };
            end_where(&tx, now, "user_id=?1", params![a.id], reason, "admin")?;
        }
    }
    tx.commit().map_err(e)?;
    Ok(created)
}

/// `identity::remove`, after ending the user's sessions (the audit rows stay when the user does not).
pub fn remove_user(conn: &Connection, email: &str, now: i64) -> Result<bool, String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    if let Some(u) = identity::get(&tx, email)? {
        end_where(&tx, now, "user_id=?1", params![u.id], "user_deleted", "admin")?;
    }
    let removed = identity::remove(&tx, email)?;
    tx.commit().map_err(e)?;
    Ok(removed)
}

// ---------------------------------------------------------------- engine tokens

pub enum EngineRequest<'a> {
    /// for a person's live session; the workspace, if named, has to be the session's own
    Session { sid: &'a str, tenant: Option<&'a str> },
    /// for a background job running as its owner: no session, and a row in the audit table
    Job { owner_email: &'a str, tenant: &'a str, job: &'a str },
}

impl EngineRequest<'_> {
    /// From the broker's body: {sessionId, tenantKey?} or {purpose: "job", ownerEmail, tenantKey, jobId}.
    pub fn from_json(v: &Value) -> Result<EngineRequest<'_>, Refusal> {
        let text = |k: &str| v.get(k).and_then(Value::as_str);
        if text("purpose") == Some("job") {
            let (Some(owner), Some(tenant), Some(job)) = (text("ownerEmail"), text("tenantKey"), text("jobId")) else {
                return Err(Refusal::bad("a job's token needs ownerEmail, tenantKey and jobId"));
            };
            if !identity::valid_tenant(tenant) || !(1..=128).contains(&job.len()) || job.chars().any(char::is_control) {
                return Err(Refusal::bad("tenantKey or jobId is not valid"));
            }
            return Ok(EngineRequest::Job { owner_email: owner, tenant, job });
        }
        let Some(sid) = text("sessionId") else { return Err(Refusal::bad("sessionId is required (or purpose \"job\")")) };
        if let Some(t) = text("tenantKey") {
            if !identity::valid_tenant(t) {
                return Err(Refusal::bad("tenantKey is not valid"));
            }
        }
        Ok(EngineRequest::Session { sid, tenant: text("tenantKey") })
    }
}

/// The short token an engine verifies (audience "engine", `--engine-token-ttl`). It names the person, the one workspace and the
/// role, and an engine takes all three from it. Returns {token, expiresAt}.
pub fn engine_token(conn: &Connection, keys: &Keys, cfg: &Config, req: &EngineRequest, now: i64) -> Result<Value, Refusal> {
    match req {
        EngineRequest::Session { sid, tenant } => {
            let s = session(conn, sid)?.ok_or_else(|| Refusal::ended("session_ended"))?;
            let user = check_live(conn, &s, now).map_err(|_| Refusal::ended("session_ended"))?;
            let Some(active) = s.tenant.as_deref() else { return Err(Refusal::denied("no_workspace", "the session has no active workspace")) };
            if tenant.is_some_and(|t| t != active) {
                return Err(Refusal::denied("workspace_mismatch", "the session is active in another workspace: switch it first"));
            }
            let (token, exp) = identity::issue_token(keys, &user, &Grant { aud: AUD_ENGINE, tenant: Some(active), sid: Some(&s.id), mfa: s.mfa_at.is_some(), amr: &s.amr, ttl: cfg.engine_secs, job: None }, now)?;
            Ok(json!({"token": token, "expiresAt": exp}))
        }
        EngineRequest::Job { owner_email, tenant, job } => {
            let refuse = |reason: &'static str, message: &str| -> Result<Value, Refusal> {
                audit_event(conn, now, "engine_token_refused", Some(&owner_email.to_lowercase()), Some(tenant), Some(job), "job", reason)?;
                Err(Refusal::denied(reason, message))
            };
            let Some(user) = identity::get(conn, owner_email)? else { return refuse("owner_revoked", "the job's owner is not a user") };
            if user.disabled {
                return refuse("owner_revoked", "the job's owner is disabled");
            }
            if !user.may_act_in(tenant) {
                return refuse("owner_revoked", "the job's owner is no longer a member of that workspace");
            }
            let (token, exp) = identity::issue_token(keys, &user, &Grant { aud: AUD_ENGINE, tenant: Some(tenant), sid: None, mfa: false, amr: &[], ttl: cfg.engine_secs, job: Some(job) }, now)?;
            audit_event(conn, now, "engine_token_job", Some(&user.email), Some(tenant), Some(job), "job", "minted")?;
            Ok(json!({"token": token, "expiresAt": exp}))
        }
    }
}

/// `identity::verify` for a Studio token, and its session, when it has one, must still be good: a logout, a revocation or an
/// expired session cuts the token off before it runs out.
pub fn verify_access(conn: &Connection, keys: &Keys, token: &str, now: i64) -> Result<Value, String> {
    let claims = identity::verify(conn, keys, token, AUD_STUDIO, now)?;
    if let Some(sid) = claims["sid"].as_str() {
        let s = session(conn, sid)?.ok_or("session has ended")?;
        check_live(conn, &s, now).map_err(|_| "session has ended".to_string())?;
    }
    Ok(claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    const T0: i64 = 1_800_000_000;
    const DGA: &str = "https://idp.example/realms/dga";
    const PEA: &str = "https://idp.example/realms/pea";

    fn setup() -> (Connection, Keys, Config) {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(audit::DDL).unwrap();
        c.execute_batch(identity::DDL).unwrap();
        c.execute_batch(DDL).unwrap();
        let keys = Keys::load(&c, None, None).unwrap();
        put_policy(&c, "dga", &json!({"issuer": DGA}), T0).unwrap();
        put_policy(&c, "pea", &json!({"issuer": PEA}), T0).unwrap();
        identity::upsert(&c, "ann@example.org", &json!({"name": "Ann", "memberships": [{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}]}), &stamp(T0)).unwrap();
        (c, keys, Config::default())
    }
    fn req(email: &str, subject: &str, tenant: &str) -> SignIn {
        SignIn { issuer: if tenant == "pea" { PEA } else { DGA }.into(), subject: subject.into(), email: email.into(), email_verified: true, amr: vec!["pwd".into()], ip: Some("203.0.113.9".into()), user_agent: Some("test".into()), tenant: tenant.into() }
    }
    fn ann_signs_in(c: &Connection, k: &Keys, cfg: &Config, now: i64) -> Value {
        sign_in(c, k, cfg, &req("ann@example.org", "sub-ann", "dga"), now).unwrap()
    }
    fn reason(r: Result<Value, Refusal>) -> &'static str {
        r.unwrap_err().reason
    }
    fn actions(c: &Connection) -> Vec<(String, Option<String>)> {
        let mut st = c.prepare("SELECT action, entry_id FROM audit ORDER BY id").unwrap();
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(Result::unwrap).collect()
    }
    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }
    fn set_user(c: &Connection, email: &str, body: Value, now: i64) {
        replace_user(c, email, &body, now).unwrap();
    }

    // ---- sign in

    #[test]
    fn a_member_signs_in_by_e_mail_the_first_time_and_by_identity_after() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let sid = s["sessionId"].as_str().unwrap();
        let claims = identity::verify(&c, &k, s["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 1).unwrap();
        assert_eq!((claims["sid"].clone(), claims["tid"].clone(), claims["role"].clone(), claims["sub"].clone()), (json!(sid), json!("dga"), json!("editor"), json!("ann@example.org")));
        assert_eq!((claims["amr"].clone(), claims["mfa"].clone()), (json!(["pwd"]), json!(false)), "amr is what the provider said, mfa is control's word");
        assert_eq!(s["accessExpiresAt"], json!(T0 + 900));
        assert_eq!((s["idleExpiresAt"].clone(), s["absoluteExpiresAt"].clone()), (json!(T0 + 8 * 3600), json!(T0 + 24 * 3600)));
        assert!(s["refreshToken"].as_str().unwrap().starts_with(&format!("{sid}.")));
        assert_eq!(count(&c, "SELECT COUNT(*) FROM identities WHERE linked_by='email'"), 1);
        // the next time the e-mail does not matter: (issuer, subject) is the identity
        let again = sign_in(&c, &k, &cfg, &req("a.different.address@example.org", "sub-ann", "dga"), T0 + 60).unwrap();
        let again = identity::verify(&c, &k, again["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 61).unwrap();
        assert_eq!(again["sub"], json!("ann@example.org"), "still Ann: the e-mail the provider sends now is not consulted");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM users"), 1);
    }

    #[test]
    fn a_provider_is_believed_only_about_its_own_workspace() {
        let (c, k, cfg) = setup();
        let mut r = req("ann@example.org", "sub-ann", "dga");
        r.issuer = PEA.into(); // pea's provider vouching for a sign-in to dga
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "issuer_mismatch");
        r.tenant = "orst".into(); // a workspace with no settings
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "workspace_not_configured");
        let mut r = req("ann@example.org", "sub-ann", "dga");
        r.issuer = "https://idp.example/realms/dga/".into(); // exact match: a trailing slash is another issuer
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "issuer_mismatch");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM sessions"), 0);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM identities"), 0);
    }

    #[test]
    fn an_unverified_e_mail_is_refused_unless_the_workspace_says_otherwise() {
        let (c, k, cfg) = setup();
        let mut r = req("ann@example.org", "sub-ann", "dga");
        r.email_verified = false;
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "email_not_verified");
        put_policy(&c, "dga", &json!({"issuer": DGA, "requireVerifiedEmail": false}), T0).unwrap();
        assert!(sign_in(&c, &k, &cfg, &r, T0).is_ok());
        // an identity already linked does not need the e-mail again
        put_policy(&c, "dga", &json!({"issuer": DGA}), T0).unwrap();
        assert!(sign_in(&c, &k, &cfg, &r, T0 + 1).is_ok());
    }

    #[test]
    fn an_unknown_user_is_refused_unless_the_workspace_makes_people_on_the_spot() {
        let (c, k, cfg) = setup();
        let r = req("new@example.org", "sub-new", "dga");
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "unknown_user");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM users"), 1, "nobody was made");
        put_policy(&c, "dga", &json!({"issuer": DGA, "allowJit": true, "jitRole": "viewer"}), T0).unwrap();
        let s = sign_in(&c, &k, &cfg, &r, T0).unwrap();
        let claims = identity::verify(&c, &k, s["accessToken"].as_str().unwrap(), AUD_STUDIO, T0).unwrap();
        assert_eq!((claims["role"].clone(), claims["sub"].clone()), (json!("viewer"), json!("new@example.org")), "with the role the workspace names");
        assert!(actions(&c).iter().any(|(a, _)| a == "user_provisioned"));
        assert!(put_policy(&c, "dga", &json!({"issuer": DGA, "allowJit": true}), T0).is_err(), "on the spot needs a role to give");
    }

    #[test]
    fn a_member_of_another_workspace_gets_in_here_only_where_people_are_made_on_the_spot() {
        let (c, k, cfg) = setup();
        identity::upsert(&c, "bob@example.org", &json!({"memberships": [{"tenantKey": "pea", "role": "admin"}]}), &stamp(T0)).unwrap();
        let r = req("bob@example.org", "sub-bob", "dga");
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "not_a_member");
        put_policy(&c, "dga", &json!({"issuer": DGA, "allowJit": true, "jitRole": "viewer"}), T0).unwrap();
        let s = sign_in(&c, &k, &cfg, &r, T0).unwrap();
        assert_eq!(identity::verify(&c, &k, s["accessToken"].as_str().unwrap(), AUD_STUDIO, T0).unwrap()["role"], json!("viewer"));
        assert_eq!(identity::get(&c, "bob@example.org").unwrap().unwrap().role_in("pea"), Some("admin"), "and nothing changed in pea");
    }

    #[test]
    fn a_second_subject_for_a_linked_e_mail_is_refused() {
        let (c, k, cfg) = setup();
        ann_signs_in(&c, &k, &cfg, T0);
        let other = req("ann@example.org", "sub-someone-else", "dga");
        assert_eq!(reason(sign_in(&c, &k, &cfg, &other, T0 + 1)), "subject_changed");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM identities"), 1);
        // an operator can relink: the old session ends with the old identity
        let sid = ann_signs_in(&c, &k, &cfg, T0 + 2)["sessionId"].as_str().unwrap().to_string();
        assert!(set_identities(&c, "ann@example.org", &json!({"identities": [{"issuer": DGA, "subject": "sub-someone-else"}]}), T0 + 3).unwrap());
        assert_eq!(status(&c, &sid, T0 + 4).unwrap().unwrap()["active"], json!(false));
        assert!(sign_in(&c, &k, &cfg, &other, T0 + 5).is_ok());
    }

    #[test]
    fn a_disabled_user_and_a_stranger_to_the_workspace_are_refused() {
        let (c, k, cfg) = setup();
        ann_signs_in(&c, &k, &cfg, T0);
        set_user(&c, "ann@example.org", json!({"disabled": true, "memberships": [{"tenantKey": "dga", "role": "editor"}]}), T0 + 1);
        assert_eq!(reason(sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 2)), "user_disabled", "by identity");
        identity::upsert(&c, "cy@example.org", &json!({"disabled": true, "memberships": [{"tenantKey": "dga", "role": "editor"}]}), &stamp(T0)).unwrap();
        assert_eq!(reason(sign_in(&c, &k, &cfg, &req("cy@example.org", "sub-cy", "dga"), T0 + 2)), "user_disabled", "by e-mail, and not linked");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM identities WHERE subject='sub-cy'"), 0);
        // a member of dga only, signing in to pea
        identity::upsert(&c, "di@example.org", &json!({"memberships": [{"tenantKey": "dga", "role": "editor"}]}), &stamp(T0)).unwrap();
        assert_eq!(reason(sign_in(&c, &k, &cfg, &req("di@example.org", "sub-di", "pea"), T0)), "not_a_member");
    }

    #[test]
    fn nobody_vouches_for_a_super_admin_except_an_operator() {
        let (c, k, cfg) = setup();
        identity::upsert(&c, "root@example.org", &json!({"superAdmin": true, "memberships": [{"tenantKey": "dga", "role": "admin"}]}), &stamp(T0)).unwrap();
        // dga's own provider, a verified e-mail, even a membership: not enough
        assert_eq!(reason(sign_in(&c, &k, &cfg, &req("root@example.org", "sub-root", "dga"), T0)), "super_admin_needs_operator_link");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM identities"), 0, "and nothing is linked");
        // the operator links the platform's provider
        let platform = "https://id.platform.example/realms/ops";
        assert!(set_identities(&c, "root@example.org", &json!({"identities": [{"issuer": platform, "subject": "sub-root"}]}), T0).unwrap());
        let mut r = req("root@example.org", "sub-root", "orst"); // any workspace, even one with no settings
        r.issuer = platform.into();
        let s = sign_in(&c, &k, &cfg, &r, T0).unwrap();
        let claims = identity::verify(&c, &k, s["accessToken"].as_str().unwrap(), AUD_STUDIO, T0).unwrap();
        assert_eq!((claims["sa"].clone(), claims["tid"].clone(), claims["role"].clone()), (json!(true), json!("orst"), Value::Null));
        // a user linked by e-mail who is made a super admin later loses that link's standing
        let sid = ann_signs_in(&c, &k, &cfg, T0)["sessionId"].as_str().unwrap().to_string();
        let same = json!([{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}]);
        set_user(&c, "ann@example.org", json!({"superAdmin": true, "memberships": same}), T0 + 1);
        let st = status(&c, &sid, T0 + 2).unwrap().unwrap();
        assert_eq!((st["active"].clone(), st["reason"].clone()), (json!(false), json!("revoked: user_changed")), "promotion alone, with nothing else changed, ends the sessions made before it");
        assert_eq!(reason(sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 3)), "super_admin_needs_operator_link");
    }

    #[test]
    fn every_refusal_and_every_sign_in_leaves_a_row() {
        let (c, k, cfg) = setup();
        let mut bad = req("ann@example.org", "sub-ann", "dga");
        bad.issuer = PEA.into();
        sign_in(&c, &k, &cfg, &bad, T0).unwrap_err();
        let sid = ann_signs_in(&c, &k, &cfg, T0 + 1)["sessionId"].as_str().unwrap().to_string();
        let rows = actions(&c);
        assert_eq!(rows[0], ("sign_in_refused".to_string(), None));
        assert!(rows.contains(&("identity_linked".to_string(), Some(sid.clone()))));
        assert_eq!(rows.last().unwrap(), &("sign_in".to_string(), Some(sid.clone())), "the sign-in row carries the session id");
        let (who, tenant, detail): (String, String, String) = c.query_row("SELECT admin_email, tenant_key, target_ref FROM audit WHERE action='sign_in'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
        assert_eq!((who.as_str(), tenant.as_str(), detail.as_str()), ("ann@example.org", "dga", "email_link ip=203.0.113.9"));
        let why: String = c.query_row("SELECT target_ref FROM audit WHERE action='sign_in_refused'", [], |r| r.get(0)).unwrap();
        assert_eq!(why, "issuer_mismatch ip=203.0.113.9");
    }

    #[test]
    fn what_the_broker_sends_is_checked() {
        let ok = json!({"issuer": DGA, "subject": "s", "email": "A@Example.org", "emailVerified": true, "tenantKey": "dga", "amr": ["pwd", "otp", "bad value!", 7, "x".repeat(40)], "ip": "1.2.3.4\n", "userAgent": "UA"});
        let r = SignIn::from_json(&ok).unwrap();
        assert_eq!((r.email.as_str(), r.amr.clone(), r.ip.as_deref()), ("a@example.org", vec!["pwd".to_string(), "otp".to_string()], Some("1.2.3.4")));
        for (k, v) in [("issuer", json!("http://idp.example")), ("issuer", json!("")), ("subject", json!("")), ("email", json!("nope")), ("tenantKey", json!("BAD")), ("tenantKey", Value::Null)] {
            let mut b = ok.clone();
            b[k] = v.clone();
            assert_eq!(SignIn::from_json(&b).unwrap_err().status, 400, "{k}={v}");
        }
        assert!(!SignIn::from_json(&json!({"issuer": DGA, "subject": "s", "email": "a@b.co", "tenantKey": "dga"})).unwrap().email_verified, "unsaid is unverified");
    }

    #[test]
    fn issuers_are_https_urls_without_extras() {
        for ok in ["https://idp.example", "https://idp.example/realms/dga", "https://idp.example:8443/x", "http://localhost:8080/realms/x", "http://127.0.0.1:9000", "http://[::1]:9000/", "http://dev.localhost"] {
            assert!(valid_issuer(ok), "{ok}");
        }
        for bad in ["", "idp.example", "http://idp.example", "http://localhost.evil.example", "ftp://x", "https://", "https:///x", "https://u@idp.example", "https://idp.example/x?y=1", "https://idp.example/#f", "https://idp .example", "javascript:alert(1)"] {
            assert!(!valid_issuer(bad), "{bad}");
        }
    }

    // ---- refresh

    #[test]
    fn refresh_rotates_the_token_and_the_old_one_works_briefly_for_an_access_token_only() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let (first, sid) = (s["refreshToken"].as_str().unwrap().to_string(), s["sessionId"].as_str().unwrap().to_string());
        let r1 = refresh(&c, &k, &cfg, &first, T0 + 600).unwrap();
        let second = r1["refreshToken"].as_str().unwrap().to_string();
        assert_ne!(first, second);
        assert!(second.starts_with(&format!("{sid}.")));
        assert_eq!(r1["idleExpiresAt"], json!(T0 + 600 + 8 * 3600), "being used keeps it alive");
        assert_eq!(identity::verify(&c, &k, r1["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 601).unwrap()["sid"], json!(sid));
        // a second tab with the first token, inside the grace: an access token, no new refresh token, nothing ends
        let tab = refresh(&c, &k, &cfg, &first, T0 + 610).unwrap();
        assert!(tab.get("refreshToken").is_none() && tab["accessToken"].is_string());
        assert!(refresh(&c, &k, &cfg, &first, T0 + 620).is_ok(), "the grace is a window, not one use");
        // the new token goes on working, and rotates again
        let r2 = refresh(&c, &k, &cfg, &second, T0 + 625).unwrap();
        assert_ne!(r2["refreshToken"], json!(second));
        assert_eq!(status(&c, &sid, T0 + 626).unwrap().unwrap()["active"], json!(true));
    }

    #[test]
    fn a_replaced_token_shown_again_after_the_grace_ends_the_session() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let (first, sid) = (s["refreshToken"].as_str().unwrap().to_string(), s["sessionId"].as_str().unwrap().to_string());
        let second = refresh(&c, &k, &cfg, &first, T0 + 60).unwrap()["refreshToken"].as_str().unwrap().to_string();
        let at = T0 + 60 + cfg.grace_secs; // the last second of the grace
        assert!(refresh(&c, &k, &cfg, &first, at).is_ok());
        let e = refresh(&c, &k, &cfg, &first, at + 1).unwrap_err();
        assert_eq!((e.status, e.reason), (401, "refresh_reuse"));
        // and the session is over, for the thief and for the person
        assert_eq!(refresh(&c, &k, &cfg, &second, at + 2).unwrap_err().reason, "session_ended");
        let st = status(&c, &sid, at + 2).unwrap().unwrap();
        assert_eq!((st["active"].clone(), st["reason"].clone()), (json!(false), json!("revoked: refresh_reuse")));
        assert!(verify_access(&c, &k, s["accessToken"].as_str().unwrap(), at + 2).is_err(), "the access token dies with it");
        assert!(actions(&c).contains(&("refresh_reuse".to_string(), Some(sid))));
    }

    #[test]
    fn a_wrong_guess_does_not_end_anyones_session() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let sid = s["sessionId"].as_str().unwrap();
        // the session id is in every access token, so anyone who saw one can try
        for t in [format!("{sid}.AAAA"), format!("{sid}."), sid.to_string(), String::new(), ".x".to_string(), "nope.nope".to_string(), format!("{sid}.{}", "z".repeat(300))] {
            assert_eq!(refresh(&c, &k, &cfg, &t, T0 + 5).unwrap_err().reason, "invalid_refresh_token", "{t}");
        }
        assert_eq!(status(&c, sid, T0 + 6).unwrap().unwrap()["active"], json!(true));
        assert!(refresh(&c, &k, &cfg, s["refreshToken"].as_str().unwrap(), T0 + 7).is_ok());
    }

    #[test]
    fn a_session_ends_when_idle_and_at_its_absolute_limit() {
        let (c, k, mut cfg) = setup();
        cfg.idle_secs = 100;
        cfg.absolute_secs = 250;
        let s = sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0).unwrap();
        let sid = s["sessionId"].as_str().unwrap();
        let t1 = refresh(&c, &k, &cfg, s["refreshToken"].as_str().unwrap(), T0 + 99).unwrap();
        assert_eq!(t1["idleExpiresAt"], json!(T0 + 199));
        let t2 = refresh(&c, &k, &cfg, t1["refreshToken"].as_str().unwrap(), T0 + 198).unwrap();
        assert_eq!(t2["idleExpiresAt"], json!(T0 + 250), "never past the absolute limit");
        let t3 = refresh(&c, &k, &cfg, t2["refreshToken"].as_str().unwrap(), T0 + 249).unwrap();
        assert_eq!(refresh(&c, &k, &cfg, t3["refreshToken"].as_str().unwrap(), T0 + 250).unwrap_err().reason, "session_ended", "absolute limit");
        let s2 = sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 1_000).unwrap();
        assert_eq!(refresh(&c, &k, &cfg, s2["refreshToken"].as_str().unwrap(), T0 + 1_100).unwrap_err().reason, "session_ended", "idle");
        assert_eq!(status(&c, sid, T0 + 250).unwrap().unwrap()["reason"], json!("expired"));
    }

    #[test]
    fn the_access_token_stops_working_with_its_session() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let token = s["accessToken"].as_str().unwrap();
        assert!(verify_access(&c, &k, token, T0 + 10).is_ok());
        assert!(logout(&c, s["sessionId"].as_str().unwrap(), T0 + 20).unwrap());
        assert_eq!(verify_access(&c, &k, token, T0 + 21).unwrap_err(), "session has ended", "a logout is felt at once, not in 15 minutes");
        // a token that belongs to no session is as before
        let (loose, _) = identity::issue(&c, &k, "ann@example.org", None, 900, T0).unwrap();
        assert!(verify_access(&c, &k, &loose, T0 + 21).is_ok());
    }

    // ---- ending sessions

    #[test]
    fn logout_ends_one_session_and_is_idempotent() {
        let (c, k, cfg) = setup();
        let a = ann_signs_in(&c, &k, &cfg, T0);
        let b = ann_signs_in(&c, &k, &cfg, T0 + 1);
        let (sa, sb) = (a["sessionId"].as_str().unwrap(), b["sessionId"].as_str().unwrap());
        assert!(logout(&c, sa, T0 + 2).unwrap());
        assert!(logout(&c, sa, T0 + 3).unwrap());
        assert!(!logout(&c, "no-such-session", T0 + 3).unwrap());
        assert_eq!(status(&c, sa, T0 + 4).unwrap().unwrap()["active"], json!(false));
        assert_eq!(status(&c, sb, T0 + 4).unwrap().unwrap()["active"], json!(true), "the other one is untouched");
        assert!(status(&c, "no-such-session", T0).unwrap().is_none());
        assert_eq!(actions(&c).iter().filter(|(a, _)| a == "logout").count(), 1, "once, not once per call");
        assert_eq!(refresh(&c, &k, &cfg, a["refreshToken"].as_str().unwrap(), T0 + 5).unwrap_err().reason, "session_ended");
    }

    #[test]
    fn sign_out_everywhere_ends_all_of_a_users_sessions() {
        let (c, k, cfg) = setup();
        let a = ann_signs_in(&c, &k, &cfg, T0);
        let b = sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann-pea", "pea"), T0 + 1).unwrap();
        identity::upsert(&c, "bob@example.org", &json!({"memberships": [{"tenantKey": "dga", "role": "editor"}]}), &stamp(T0)).unwrap();
        let bob = sign_in(&c, &k, &cfg, &req("bob@example.org", "sub-bob", "dga"), T0 + 2).unwrap();
        assert_eq!(revoke_user(&c, "Ann@Example.org", T0 + 3).unwrap(), Some(2));
        assert_eq!(revoke_user(&c, "ann@example.org", T0 + 4).unwrap(), Some(0));
        assert_eq!(revoke_user(&c, "nobody@example.org", T0 + 4).unwrap(), None);
        for s in [&a, &b] {
            assert_eq!(status(&c, s["sessionId"].as_str().unwrap(), T0 + 5).unwrap().unwrap()["active"], json!(false));
        }
        assert_eq!(status(&c, bob["sessionId"].as_str().unwrap(), T0 + 5).unwrap().unwrap()["active"], json!(true));
        assert_eq!(actions(&c).iter().filter(|(a, _)| a == "revoke").count(), 2);
    }

    #[test]
    fn disabling_a_user_or_taking_something_away_ends_their_sessions_and_adding_does_not() {
        let (c, k, cfg) = setup();
        let sid = |c: &Connection, now: i64| sign_in(c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), now).unwrap()["sessionId"].as_str().unwrap().to_string();
        let live = |c: &Connection, s: &str| status(c, s, T0 + 100).unwrap().unwrap()["active"] == json!(true);
        let both = json!([{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}]);
        let s = sid(&c, T0);
        set_user(&c, "ann@example.org", json!({"name": "Annie", "memberships": both}), T0 + 1);
        assert!(live(&c, &s), "a new name takes nothing away");
        set_user(&c, "ann@example.org", json!({"memberships": [{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}, {"tenantKey": "orst", "role": "viewer"}]}), T0 + 2);
        assert!(live(&c, &s), "a new workspace takes nothing away");
        set_user(&c, "ann@example.org", json!({"memberships": [{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}]}), T0 + 3);
        assert!(!live(&c, &s), "losing a workspace ends it");
        let s = sid(&c, T0 + 4);
        set_user(&c, "ann@example.org", json!({"memberships": [{"tenantKey": "dga", "role": "admin"}, {"tenantKey": "pea", "role": "viewer"}]}), T0 + 5);
        assert!(!live(&c, &s), "so does a changed role");
        let s = sid(&c, T0 + 6);
        set_user(&c, "ann@example.org", json!({"disabled": true, "memberships": [{"tenantKey": "dga", "role": "admin"}, {"tenantKey": "pea", "role": "viewer"}]}), T0 + 7);
        assert!(!live(&c, &s));
        assert_eq!(status(&c, &s, T0 + 100).unwrap().unwrap()["reason"], json!("revoked: user_disabled"));
    }

    #[test]
    fn deleting_a_user_ends_their_sessions_and_keeps_the_trail() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let sid = s["sessionId"].as_str().unwrap().to_string();
        assert!(remove_user(&c, "ann@example.org", T0 + 5).unwrap());
        assert!(!remove_user(&c, "ann@example.org", T0 + 6).unwrap());
        assert!(status(&c, &sid, T0 + 7).unwrap().is_none(), "the session rows go with the user");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM identities"), 0);
        assert!(verify_access(&c, &k, s["accessToken"].as_str().unwrap(), T0 + 8).is_err());
        assert!(actions(&c).contains(&("revoke".to_string(), Some(sid.clone()))), "the audit rows stay");
        assert_eq!(refresh(&c, &k, &cfg, s["refreshToken"].as_str().unwrap(), T0 + 9).unwrap_err().reason, "invalid_refresh_token");
    }

    #[test]
    fn a_refresh_notices_a_user_who_lost_the_workspace_even_if_nothing_ended_the_session() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        // a change made without going through replace_user (a restore, a script on the database)
        c.execute("DELETE FROM memberships WHERE tenant_key='dga'", []).unwrap();
        assert_eq!(refresh(&c, &k, &cfg, s["refreshToken"].as_str().unwrap(), T0 + 5).unwrap_err().reason, "session_ended");
        assert_eq!(status(&c, s["sessionId"].as_str().unwrap(), T0 + 6).unwrap().unwrap()["reason"], json!("revoked: membership_removed"));
        c.execute("UPDATE users SET disabled=1", []).unwrap();
        let s2 = sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "pea"), T0 + 7);
        assert!(s2.is_err());
    }

    #[test]
    fn changing_a_workspaces_provider_ends_the_sessions_made_with_the_old_one() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let sid = s["sessionId"].as_str().unwrap();
        put_policy(&c, "dga", &json!({"issuer": DGA, "requireVerifiedEmail": false}), T0 + 1).unwrap();
        assert_eq!(status(&c, sid, T0 + 2).unwrap().unwrap()["active"], json!(true), "same provider, settings changed");
        assert!(!put_policy(&c, "dga", &json!({"issuer": "https://new-idp.example/realms/dga"}), T0 + 3).unwrap());
        assert_eq!(status(&c, sid, T0 + 4).unwrap().unwrap()["reason"], json!("revoked: issuer_changed"));
        assert_eq!(reason(sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 5)), "issuer_mismatch", "the linked identity belongs to the old provider");
        // removing the settings, and the workspace itself
        let mut r = req("ann@example.org", "sub-ann", "pea");
        r.issuer = PEA.into();
        let p = sign_in(&c, &k, &cfg, &r, T0 + 6).unwrap();
        assert!(delete_policy(&c, "pea", T0 + 7).unwrap());
        assert!(!delete_policy(&c, "pea", T0 + 7).unwrap());
        assert_eq!(status(&c, p["sessionId"].as_str().unwrap(), T0 + 8).unwrap().unwrap()["active"], json!(false));
        let q = sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 9);
        assert!(q.is_err());
        put_policy(&c, "dga", &json!({"issuer": DGA}), T0 + 9).unwrap();
        let q = ann_signs_in(&c, &k, &cfg, T0 + 10);
        workspace_removed(&c, "dga", T0 + 11).unwrap();
        assert_eq!(status(&c, q["sessionId"].as_str().unwrap(), T0 + 12).unwrap().unwrap()["active"], json!(false));
        assert!(policy(&c, "dga").unwrap().is_none());
    }

    // ---- switching workspace

    #[test]
    fn a_session_moves_between_workspaces_that_share_its_provider() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let sid = s["sessionId"].as_str().unwrap();
        // pea has its own provider: the dga session cannot be moved there, though Ann is a member of both
        assert_eq!(switch(&c, &k, &cfg, sid, "pea", T0 + 1).unwrap_err().reason, "issuer_mismatch");
        // a workspace she is not in
        put_policy(&c, "orst", &json!({"issuer": DGA}), T0).unwrap();
        assert_eq!(switch(&c, &k, &cfg, sid, "orst", T0 + 1).unwrap_err().reason, "not_a_member");
        // pea changes to dga's provider (a shared one): now it works
        put_policy(&c, "pea", &json!({"issuer": DGA}), T0 + 2).unwrap();
        let m = switch(&c, &k, &cfg, sid, "pea", T0 + 3).unwrap();
        let claims = identity::verify(&c, &k, m["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 4).unwrap();
        assert_eq!((claims["tid"].clone(), claims["role"].clone(), claims["tenants"].clone()), (json!("pea"), json!("viewer"), json!([{"key": "pea", "role": "viewer"}])));
        assert_eq!(status(&c, sid, T0 + 4).unwrap().unwrap()["tenantKey"], json!("pea"));
        assert!(actions(&c).contains(&("session_switch".to_string(), Some(sid.to_string()))));
        assert_eq!(switch(&c, &k, &cfg, "no-such", "pea", T0 + 4).unwrap_err().reason, "session_ended");
        logout(&c, sid, T0 + 5).unwrap();
        assert_eq!(switch(&c, &k, &cfg, sid, "dga", T0 + 6).unwrap_err().reason, "session_ended");
        assert_eq!(switch(&c, &k, &cfg, sid, "BAD", T0 + 6).unwrap_err().status, 400);
    }

    #[test]
    fn a_super_admin_moves_anywhere() {
        let (c, k, cfg) = setup();
        identity::upsert(&c, "root@example.org", &json!({"superAdmin": true, "memberships": []}), &stamp(T0)).unwrap();
        let platform = "https://id.platform.example/realms/ops";
        set_identities(&c, "root@example.org", &json!({"identities": [{"issuer": platform, "subject": "r"}]}), T0).unwrap();
        let mut r = req("root@example.org", "r", "dga");
        r.issuer = platform.into();
        let s = sign_in(&c, &k, &cfg, &r, T0).unwrap();
        let m = switch(&c, &k, &cfg, s["sessionId"].as_str().unwrap(), "pea", T0 + 1).unwrap();
        let claims = identity::verify(&c, &k, m["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 2).unwrap();
        assert_eq!((claims["tid"].clone(), claims["sa"].clone()), (json!("pea"), json!(true)));
    }

    // ---- engine tokens

    #[test]
    fn an_engine_token_comes_from_a_live_session_for_its_workspace() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let sid = s["sessionId"].as_str().unwrap();
        let t = engine_token(&c, &k, &cfg, &EngineRequest::Session { sid, tenant: Some("dga") }, T0 + 5).unwrap();
        assert_eq!(t["expiresAt"], json!(T0 + 5 + 60));
        let claims = identity::verify_token(&k, t["token"].as_str().unwrap(), AUD_ENGINE, T0 + 5, 0).unwrap();
        assert_eq!((claims["aud"].clone(), claims["tid"].clone(), claims["role"].clone(), claims["sid"].clone()), (json!("engine"), json!("dga"), json!("editor"), json!(sid)));
        assert!(identity::verify_token(&k, t["token"].as_str().unwrap(), AUD_STUDIO, T0 + 5, 0).is_err(), "not a Studio token");
        assert!(identity::verify_token(&k, t["token"].as_str().unwrap(), AUD_ENGINE, T0 + 65, 0).is_err(), "gone after a minute");
        assert!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid, tenant: None }, T0 + 5).is_ok(), "the workspace defaults to the session's");
        // another workspace than the active one is a mistake or an attack: switch first
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid, tenant: Some("pea") }, T0 + 5).unwrap_err().reason, "workspace_mismatch");
        // and an engine token is not a Studio access token: it cannot be used as one
        assert!(verify_access(&c, &k, t["token"].as_str().unwrap(), T0 + 5).is_err());
        logout(&c, sid, T0 + 6).unwrap();
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid, tenant: Some("dga") }, T0 + 7).unwrap_err().reason, "session_ended", "no engine tokens once it has ended");
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid: "none", tenant: None }, T0 + 7).unwrap_err().status, 401);
    }

    #[test]
    fn a_disabled_user_gets_no_engine_tokens_from_a_session_they_had() {
        let (c, k, cfg) = setup();
        let sid = ann_signs_in(&c, &k, &cfg, T0)["sessionId"].as_str().unwrap().to_string();
        c.execute("UPDATE users SET disabled=1", []).unwrap(); // however it happened: the check is on use, too
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid: &sid, tenant: None }, T0 + 1).unwrap_err().reason, "session_ended");
    }

    #[test]
    fn a_job_gets_a_token_while_its_owner_may_still_act_and_the_job_is_on_the_record() {
        let (c, k, cfg) = setup();
        let ok = engine_token(&c, &k, &cfg, &EngineRequest::Job { owner_email: "Ann@Example.org", tenant: "dga", job: "job-1" }, T0).unwrap();
        let claims = identity::verify_token(&k, ok["token"].as_str().unwrap(), AUD_ENGINE, T0, 0).unwrap();
        assert_eq!((claims["job"].clone(), claims["purpose"].clone(), claims["sid"].clone(), claims["tid"].clone()), (json!("job-1"), json!("job"), Value::Null, json!("dga")));
        assert!(actions(&c).contains(&("engine_token_job".to_string(), Some("job-1".to_string()))));
        // a workspace the owner is not in, a user who is not one, a disabled owner
        for (who, tenant) in [("ann@example.org", "orst"), ("nobody@example.org", "dga")] {
            let e = engine_token(&c, &k, &cfg, &EngineRequest::Job { owner_email: who, tenant, job: "job-2" }, T0).unwrap_err();
            assert_eq!((e.status, e.reason), (403, "owner_revoked"), "{who} {tenant}");
        }
        set_user(&c, "ann@example.org", json!({"disabled": true, "memberships": [{"tenantKey": "dga", "role": "editor"}]}), T0 + 1);
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Job { owner_email: "ann@example.org", tenant: "dga", job: "job-3" }, T0 + 2).unwrap_err().reason, "owner_revoked");
        let refused = actions(&c).iter().filter(|(a, j)| a == "engine_token_refused" && j.is_some()).count();
        assert_eq!(refused, 3, "each refusal is on the record with the job's id");
        // no session was made for any of it
        assert_eq!(count(&c, "SELECT COUNT(*) FROM sessions"), 0);
    }

    #[test]
    fn the_engine_requests_are_checked() {
        for bad in [json!({}), json!({"purpose": "job", "ownerEmail": "a@b.co"}), json!({"purpose": "job", "ownerEmail": "a@b.co", "tenantKey": "BAD", "jobId": "1"}), json!({"purpose": "job", "ownerEmail": "a@b.co", "tenantKey": "dga", "jobId": ""}), json!({"sessionId": "s", "tenantKey": "BAD"})] {
            assert_eq!(EngineRequest::from_json(&bad).err().map(|r| r.status), Some(400), "{bad}");
        }
        assert!(matches!(EngineRequest::from_json(&json!({"sessionId": "s"})), Ok(EngineRequest::Session { tenant: None, .. })));
        assert!(matches!(EngineRequest::from_json(&json!({"purpose": "job", "ownerEmail": "a@b.co", "tenantKey": "dga", "jobId": "j"})), Ok(EngineRequest::Job { .. })));
    }

    // ---- operators

    #[test]
    fn identities_are_set_whole_and_a_subject_names_one_person() {
        let (c, _, _) = setup();
        identity::upsert(&c, "bob@example.org", &json!({"memberships": []}), &stamp(T0)).unwrap();
        let body = |iss: &str, sub: &str| json!({"identities": [{"issuer": iss, "subject": sub}]});
        assert!(set_identities(&c, "ann@example.org", &body(DGA, "s1"), T0).unwrap());
        assert!(!set_identities(&c, "nobody@example.org", &body(DGA, "s1"), T0).unwrap());
        let ann = identity::get(&c, "ann@example.org").unwrap().unwrap();
        let ids = identities_of(&c, ann.id).unwrap();
        assert_eq!((ids.len(), ids[0].linked_by.as_str(), ids[0].subject.as_str()), (1, "admin", "s1"));
        assert!(set_identities(&c, "bob@example.org", &body(DGA, "s1"), T0).is_err(), "that subject is Ann's");
        for bad in [json!({}), json!({"identities": [{"issuer": "nope", "subject": "x"}]}), json!({"identities": [{"issuer": DGA, "subject": ""}]}), json!({"identities": [{"issuer": DGA, "subject": "a"}, {"issuer": DGA, "subject": "b"}]})] {
            assert!(set_identities(&c, "ann@example.org", &bad, T0).is_err(), "{bad}");
        }
        assert!(set_identities(&c, "ann@example.org", &json!({"identities": []}), T0 + 1).unwrap());
        assert!(identities_of(&c, ann.id).unwrap().is_empty());
    }

    #[test]
    fn setting_the_same_identities_again_ends_nothing() {
        let (c, k, cfg) = setup();
        set_identities(&c, "ann@example.org", &json!({"identities": [{"issuer": DGA, "subject": "sub-ann"}]}), T0).unwrap();
        let sid = ann_signs_in(&c, &k, &cfg, T0 + 1)["sessionId"].as_str().unwrap().to_string();
        set_identities(&c, "ann@example.org", &json!({"identities": [{"issuer": DGA, "subject": "sub-ann"}]}), T0 + 2).unwrap();
        assert_eq!(status(&c, &sid, T0 + 3).unwrap().unwrap()["active"], json!(true));
        set_identities(&c, "ann@example.org", &json!({"identities": [{"issuer": DGA, "subject": "sub-ann-2"}]}), T0 + 4).unwrap();
        assert_eq!(status(&c, &sid, T0 + 5).unwrap().unwrap()["reason"], json!("revoked: identity_changed"));
    }

    #[test]
    fn old_sessions_are_cleared_when_someone_signs_in() {
        let (c, k, cfg) = setup();
        let old = ann_signs_in(&c, &k, &cfg, T0)["sessionId"].as_str().unwrap().to_string();
        logout(&c, &old, T0 + 1).unwrap();
        ann_signs_in(&c, &k, &cfg, T0 + 6 * 86_400);
        assert!(status(&c, &old, T0 + 6 * 86_400).unwrap().is_some(), "a week is the least it is kept");
        ann_signs_in(&c, &k, &cfg, T0 + 8 * 86_400);
        assert!(status(&c, &old, T0 + 8 * 86_400).unwrap().is_none());
        assert!(count(&c, "SELECT COUNT(*) FROM audit") > 0, "the audit rows are not cleared");
    }

    #[test]
    fn a_session_that_is_over_is_not_called_stolen() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let (first, sid) = (s["refreshToken"].as_str().unwrap().to_string(), s["sessionId"].as_str().unwrap().to_string());
        refresh(&c, &k, &cfg, &first, T0 + 10).unwrap();
        logout(&c, &sid, T0 + 11).unwrap();
        // the replaced token, long after its grace, on a session that was logged out: over, not stolen
        assert_eq!(refresh(&c, &k, &cfg, &first, T0 + 100).unwrap_err().reason, "session_ended");
        // and the same for a session that ran out of time
        let s2 = ann_signs_in(&c, &k, &cfg, T0 + 200);
        let f2 = s2["refreshToken"].as_str().unwrap().to_string();
        refresh(&c, &k, &cfg, &f2, T0 + 210).unwrap();
        assert_eq!(refresh(&c, &k, &cfg, &f2, T0 + 210 + cfg.idle_secs).unwrap_err().reason, "session_ended");
        assert!(!actions(&c).iter().any(|(a, _)| a == "refresh_reuse"), "no theft was recorded");
    }

    #[test]
    fn a_failed_token_does_not_rotate_the_refresh_token() {
        let (c, k, cfg) = setup();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let (first, sid) = (s["refreshToken"].as_str().unwrap().to_string(), s["sessionId"].as_str().unwrap().to_string());
        // a user whose id no longer makes a token (a workspace key that is not valid cannot be signed): force the failure
        c.execute("UPDATE sessions SET tenant_key='NOT A KEY' WHERE id=?1", [&sid]).unwrap();
        c.execute("INSERT OR IGNORE INTO memberships(user_id, tenant_key, role) SELECT user_id, 'NOT A KEY', 'x' FROM sessions WHERE id=?1", [&sid]).unwrap();
        assert!(refresh(&c, &k, &cfg, &first, T0 + 5).is_err());
        let hash: Vec<u8> = c.query_row("SELECT refresh_hash FROM sessions WHERE id=?1", [&sid], |r| r.get(0)).unwrap();
        assert_eq!(hash, sha(first.split_once('.').unwrap().1), "still the person's own refresh token");
    }

    #[test]
    fn what_counts_as_taking_something_away() {
        let user = |disabled: bool, sa: bool, ms: &[(&str, &str)]| User {
            id: 1,
            email: "a@b.co".into(),
            name: None,
            disabled,
            super_admin: sa,
            memberships: ms.iter().map(|(t, r)| identity::Membership { tenant_key: t.to_string(), role: r.to_string() }).collect(),
        };
        let both = [("dga", "editor"), ("pea", "viewer")];
        let base = user(false, false, &both);
        assert!(!access_changed(&base, &user(false, false, &[("pea", "viewer"), ("dga", "editor")])), "the order is nothing");
        assert!(!access_changed(&base, &user(false, false, &[("dga", "editor"), ("pea", "viewer"), ("orst", "viewer")])), "a new workspace");
        assert!(!access_changed(&user(true, false, &both), &user(false, false, &both)), "enabling");
        assert!(access_changed(&base, &user(true, false, &both)), "disabling");
        assert!(access_changed(&base, &user(false, true, &both)), "promotion");
        assert!(access_changed(&user(false, true, &both), &user(false, false, &both)), "demotion");
        assert!(access_changed(&base, &user(false, false, &[("dga", "editor")])), "a workspace gone");
        assert!(access_changed(&base, &user(false, false, &[("dga", "admin"), ("pea", "viewer")])), "a role changed");
    }
}
