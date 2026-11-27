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
//!  - The workspace must sign in through control: its `mode` is `both` or `control`. A workspace with no settings here, or with
//!    `legacy` (the default), has no sessions at all, a super admin's included; setting it back to `legacy` ends them (rollback).
//!  - The provider must be the workspace's own (`workspace_identity.issuer`, exact match), and the e-mail verified by it (unless
//!    the workspace says otherwise). A provider is believed about the people of its own workspace, and about nobody else's.
//!  - A person is found by (issuer, subject). The first time, they are linked by e-mail if they hold a membership here; someone with
//!    no account yet is made on the spot if the workspace allows that (`allow_jit`), with the role it names; an account that exists
//!    and is not a member here is never adopted. A second subject for an e-mail that is already linked to another is refused: that is
//!    what a provider that re-used an address looks like.
//!  - A super admin is tied to no workspace, so no workspace's provider may vouch for one. They sign in only through an identity
//!    an operator linked (`PUT /admin/users/<email>/identities`), never by e-mail or on the spot.
//!  - A session may move to another workspace only if that workspace's provider is the one the session was made with.
use crate::audit;
use crate::identity::{self, Grant, Keys, User, AUD_ENGINE, AUD_STUDIO};
use crate::jobs;
use crate::mfa;
use crate::roles;
use crate::secrets::SecretKey;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// How a workspace signs in (step 3): `mode` legacy (Studio's old way only; control makes no session), both, or control.
const WORKSPACE_IDENTITY: &str = "
CREATE TABLE IF NOT EXISTS workspace_identity(
  tenant_key TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'legacy' CHECK (mode IN ('legacy', 'both', 'control')),
  issuer TEXT,
  client_id TEXT,
  client_secret TEXT,
  allow_jit INTEGER NOT NULL DEFAULT 0,
  jit_role TEXT,
  require_verified_email INTEGER NOT NULL DEFAULT 1,
  mfa_required INTEGER NOT NULL DEFAULT 0,
  mfa_required_at TEXT,
  accept_idp_mfa INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);";

/// The other tables; `migrate` makes `workspace_identity` (and brings one from step 2 up to date).
pub const DDL: &str = "
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
  revoked_reason TEXT,
  scope TEXT NOT NULL DEFAULT 'full'
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_pending(
  id_hash BLOB PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
";

/// A sign-in that waits for the person's second factor lasts this long (Studio's MFA cookie did too).
const PENDING_SECS: i64 = 300;

/// Make `workspace_identity`, or bring the one step 2 made up to date: that one had no `mode`, client or MFA policy, and needed an
/// issuer. Its rows keep their provider and come out `legacy`: no workspace signs in through control until an operator says so.
/// Idempotent, and in one transaction.
pub fn migrate(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    let exists = tx.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='workspace_identity'", [], |r| r.get::<_, i64>(0)).map_err(e)? > 0;
    let has_mode = tx.query_row("SELECT COUNT(*) FROM pragma_table_info('workspace_identity') WHERE name='mode'", [], |r| r.get::<_, i64>(0)).map_err(e)? > 0;
    if exists && !has_mode {
        tx.execute_batch(&format!(
            "ALTER TABLE workspace_identity RENAME TO workspace_identity_step2;
             {WORKSPACE_IDENTITY}
             INSERT INTO workspace_identity(tenant_key, mode, issuer, allow_jit, jit_role, require_verified_email, updated_at)
               SELECT tenant_key, 'legacy', issuer, allow_jit, jit_role, require_verified_email, updated_at FROM workspace_identity_step2;
             DROP TABLE workspace_identity_step2;"
        ))
        .map_err(e)?;
    } else {
        tx.execute_batch(WORKSPACE_IDENTITY).map_err(e)?;
    }
    // sessions made before step 4 had no scope: they were all full
    let has_scope = tx.query_row("SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='scope'", [], |r| r.get::<_, i64>(0)).map_err(e)? > 0;
    let has_sessions = tx.query_row("SELECT COUNT(*) FROM pragma_table_info('sessions')", [], |r| r.get::<_, i64>(0)).map_err(e)? > 0;
    if has_sessions && !has_scope {
        tx.execute("ALTER TABLE sessions ADD COLUMN scope TEXT NOT NULL DEFAULT 'full'", []).map_err(e)?;
    }
    tx.commit().map_err(e)
}

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
    audit_row(conn, now, action, "webx::session", sid, email, tenant, actor, detail)
}

/// One row in the audit table, written in the caller's transaction: `entry` is what it is about (a session, a workspace, a user).
#[allow(clippy::too_many_arguments)]
fn audit_row(conn: &Connection, now: i64, action: &str, content_type: &str, entry: Option<&str>, email: Option<&str>, tenant: Option<&str>, actor: &str, detail: &str) -> Result<(), String> {
    let at = stamp(now);
    audit::create(conn, &json!({"action": action, "contentType": content_type, "entryId": entry, "adminEmail": email, "tenantKey": tenant, "actor": actor, "targetRef": detail, "at": at}), &at).map(|_| ())
}

// ---------------------------------------------------------------- what a workspace accepts

pub struct Policy {
    pub tenant_key: String,
    /// `legacy` (control makes no session here), `both` or `control`
    pub mode: String,
    pub issuer: Option<String>,
    pub client_id: Option<String>,
    /// the provider's client secret, sealed (secrets.rs); never shown, only said to be there
    client_secret: Option<String>,
    pub allow_jit: bool,
    pub jit_role: Option<String>,
    pub require_verified_email: bool,
    /// a second factor is required of everyone in the workspace, since `mfa_required_at` (the grace period counts from then)
    pub mfa_required: bool,
    pub mfa_required_at: Option<String>,
    /// a second factor the provider says it checked counts (step 4)
    pub accept_idp_mfa: bool,
    pub updated_at: String,
}
impl Policy {
    /// The workspace signs in through control.
    pub fn signs_in(&self) -> bool {
        self.mode != "legacy"
    }
    /// The operator's view: everything but the client secret, which only shows as there or not.
    pub fn to_json(&self) -> Value {
        json!({"tenantKey": self.tenant_key, "mode": self.mode, "issuer": self.issuer, "clientId": self.client_id, "hasClientSecret": self.client_secret.is_some(),
               "allowJit": self.allow_jit, "jitRole": self.jit_role, "requireVerifiedEmail": self.require_verified_email,
               "mfaRequired": self.mfa_required, "mfaRequiredAt": self.mfa_required_at, "acceptIdpMfa": self.accept_idp_mfa, "updatedAt": self.updated_at})
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

const POLICY_COLS: &str = "tenant_key, mode, issuer, client_id, client_secret, allow_jit, jit_role, require_verified_email, mfa_required, mfa_required_at, accept_idp_mfa, updated_at";

pub fn policy(conn: &Connection, tenant: &str) -> Result<Option<Policy>, String> {
    conn.query_row(&format!("SELECT {POLICY_COLS} FROM workspace_identity WHERE tenant_key=?1"), [tenant], |r| {
        Ok(Policy {
            tenant_key: r.get(0)?,
            mode: r.get(1)?,
            issuer: r.get(2)?,
            client_id: r.get(3)?,
            client_secret: r.get(4)?,
            allow_jit: r.get(5)?,
            jit_role: r.get(6)?,
            require_verified_email: r.get(7)?,
            mfa_required: r.get(8)?,
            mfa_required_at: r.get(9)?,
            accept_idp_mfa: r.get(10)?,
            updated_at: r.get(11)?,
        })
    })
    .optional()
    .map_err(e)
}

/// Every workspace's sign-in settings, by key (the operator's view; tools/migrate-users.mjs reads it to refuse running once any
/// workspace, one Strapi does not know included, signs in through control).
pub fn policies(conn: &Connection) -> Result<Vec<Policy>, String> {
    let mut st = conn.prepare("SELECT tenant_key FROM workspace_identity ORDER BY tenant_key").map_err(e)?;
    let keys = st.query_map([], |r| r.get::<_, String>(0)).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    keys.iter().filter_map(|k| policy(conn, k).transpose()).collect()
}

/// What the provider's client secret is sealed for: its own workspace, so it does not open in another row.
fn secret_context(tenant: &str) -> String {
    format!("client-secret:{tenant}")
}

/// Sessions exist only in a workspace that signs in through control: none for one with no settings here or in `legacy`.
fn open_for_sessions(p: Option<Policy>) -> Result<Policy, (&'static str, &'static str)> {
    match p {
        None => Err(("workspace_not_configured", "this workspace does not sign in through webx-control")),
        Some(p) if !p.signs_in() => Err(("workspace_legacy", "this workspace does not sign in through webx-control yet (mode legacy)")),
        Some(p) => Ok(p),
    }
}

/// Set how a workspace signs in, as an operator. body: {mode?, issuer?, clientId?, clientSecret?, allowJit?, jitRole?,
/// requireVerifiedEmail?, mfaRequired?, mfaRequiredAt?, acceptIdpMfa?}. A field left out takes its default (`mode` legacy, nothing
/// required), except `clientSecret`, which stays as it was when left out and is removed by `null`. `both` and `control` need an issuer
/// and a client id. Returns true when the row was created. Going back to `legacy` ends every session in the workspace (a super admin's
/// too); a new provider ends the sessions of the people tied to the old one.
pub fn put_policy(conn: &Connection, secrets: Option<&SecretKey>, tenant: &str, body: &Value, now: i64) -> Result<bool, String> {
    if !identity::valid_tenant(tenant) {
        return Err(format!("tenantKey {tenant:?} is not valid"));
    }
    if !body.is_object() {
        return Err("body must be an object".into());
    }
    let flag = |k: &str, default: bool| -> Result<bool, String> {
        match body.get(k) {
            None | Some(Value::Null) => Ok(default),
            Some(Value::Bool(b)) => Ok(*b),
            _ => Err(format!("{k} must be true or false")),
        }
    };
    let text = |k: &str| -> Result<Option<&str>, String> {
        match body.get(k) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.as_str())),
            _ => Err(format!("{k} must be text")),
        }
    };
    let mode = text("mode")?.unwrap_or("legacy");
    if !["legacy", "both", "control"].contains(&mode) {
        return Err("mode must be legacy, both or control".into());
    }
    let issuer = text("issuer")?;
    if issuer.is_some_and(|i| !valid_issuer(i)) {
        return Err("issuer must be an https URL without a query or fragment".into());
    }
    let client_id = text("clientId")?;
    if client_id.is_some_and(|c| !(1..=255).contains(&c.len()) || !c.bytes().all(|b| b.is_ascii_graphic())) {
        return Err("clientId must be 1 to 255 visible characters".into());
    }
    if mode != "legacy" && (issuer.is_none() || client_id.is_none()) {
        return Err(format!("mode {mode} needs an issuer and a clientId: the provider people sign in at"));
    }
    let allow_jit = flag("allowJit", false)?;
    let require_verified = flag("requireVerifiedEmail", true)?;
    let jit_role = text("jitRole")?;
    if let Some(r) = jit_role {
        if !roles::is_base_role(r) {
            return Err(format!("jitRole must be one of {}", roles::BASE_ROLES.join(", ")));
        }
        if roles::may(r, None, "manage_people") {
            return Err(format!("jitRole cannot be {r}: anyone the provider vouches for would manage the workspace's people"));
        }
    }
    if allow_jit && jit_role.is_none() {
        return Err("allowJit needs a jitRole: the role a person made on the spot gets".into());
    }
    let mfa_required = flag("mfaRequired", false)?;
    let mfa_from = match text("mfaRequiredAt")? {
        None => None,
        Some(s) => Some(jobs::parse_iso(s).ok_or("mfaRequiredAt is not a time (ISO 8601, UTC)")?),
    };
    if mfa_from.is_some() && !mfa_required {
        return Err("mfaRequiredAt needs mfaRequired".into());
    }
    if mfa_from.is_some_and(|ms| ms > now * 1000) {
        return Err("mfaRequiredAt cannot be in the future".into());
    }
    let accept_idp_mfa = flag("acceptIdpMfa", false)?;
    let tx = conn.unchecked_transaction().map_err(e)?;
    let before = policy(&tx, tenant)?;
    let (client_secret, secret_note) = match body.get("clientSecret") {
        None => (before.as_ref().and_then(|b| b.client_secret.clone()), "kept"),
        Some(Value::Null) => (None, "removed"),
        Some(Value::String(s)) if (1..=1024).contains(&s.len()) && !s.chars().any(char::is_control) => {
            let key = secrets.ok_or("clientSecret needs WEBX_CONTROL_SECRET_KEY: control keeps it only encrypted")?;
            (Some(key.seal(&secret_context(tenant), s)?), "set")
        }
        Some(_) => return Err("clientSecret must be 1 to 1024 characters of text".into()),
    };
    // the grace period counts from when MFA was first required: saving again while it is on does not start it again
    let mfa_required_at = match (mfa_required, mfa_from) {
        (false, _) => None,
        (true, Some(ms)) => Some(jobs::iso(ms)),
        (true, None) => before.as_ref().filter(|b| b.mfa_required).and_then(|b| b.mfa_required_at.clone()).or_else(|| Some(stamp(now))),
    };
    tx.execute(
        &format!(
            "INSERT INTO workspace_identity({POLICY_COLS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(tenant_key) DO UPDATE SET mode=?2, issuer=?3, client_id=?4, client_secret=?5, allow_jit=?6, jit_role=?7,
               require_verified_email=?8, mfa_required=?9, mfa_required_at=?10, accept_idp_mfa=?11, updated_at=?12"
        ),
        params![tenant, mode, issuer, client_id, client_secret, allow_jit, jit_role, require_verified, mfa_required, mfa_required_at, accept_idp_mfa, stamp(now)],
    )
    .map_err(e)?;
    if let Some(b) = &before {
        if b.signs_in() && mode == "legacy" {
            end_where(&tx, now, "tenant_key=?1", params![tenant], "workspace_legacy", "admin")?;
        } else if let (Some(i), true) = (issuer, b.issuer.as_deref() != issuer) {
            end_where(&tx, now, "tenant_key=?1 AND issuer<>?2 AND user_id IN (SELECT id FROM users WHERE super_admin=0)", params![tenant, i], "issuer_changed", "admin")?;
        }
    }
    let detail = format!(
        "mode={mode} issuer={} client={} secret={secret_note} jit={} verified_email={require_verified} mfa_required={mfa_required} accept_idp_mfa={accept_idp_mfa}",
        issuer.unwrap_or("-"),
        client_id.unwrap_or("-"),
        if allow_jit { jit_role.unwrap_or("-") } else { "off" },
    );
    audit_row(&tx, now, "workspace_identity_saved", "webx::workspace-identity", Some(tenant), None, Some(tenant), "admin", &detail)?;
    tx.commit().map_err(e)?;
    Ok(before.is_none())
}

/// Stop signing in through control for a workspace (the same as `legacy`, with the provider forgotten): every session in it ends.
pub fn delete_policy(conn: &Connection, tenant: &str, now: i64) -> Result<bool, String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    let had = tx.execute("DELETE FROM workspace_identity WHERE tenant_key=?1", [tenant]).map_err(e)? > 0;
    if had {
        end_where(&tx, now, "tenant_key=?1", params![tenant], "workspace_identity_removed", "admin")?;
        audit_row(&tx, now, "workspace_identity_removed", "webx::workspace-identity", Some(tenant), None, Some(tenant), "admin", "removed")?;
    }
    tx.commit().map_err(e)?;
    Ok(had)
}

/// What Studio needs to send a person to the workspace's provider (step 6; the broker credential only): the mode, and for a workspace
/// that signs in through control the issuer, client id and client secret. A `legacy` workspace shows only its mode: nothing should
/// need control's copy of its client until it switches. None when the workspace has no settings here.
pub fn sign_in_settings(conn: &Connection, secrets: Option<&SecretKey>, tenant: &str) -> Result<Option<Value>, String> {
    let Some(p) = policy(conn, tenant)? else { return Ok(None) };
    if !p.signs_in() {
        return Ok(Some(json!({"tenantKey": p.tenant_key, "mode": p.mode})));
    }
    let secret = match &p.client_secret {
        None => None,
        Some(sealed) => Some(secrets.ok_or("the client secret is kept encrypted: start with WEBX_CONTROL_SECRET_KEY set")?.open(&secret_context(tenant), sealed)?),
    };
    Ok(Some(json!({"tenantKey": p.tenant_key, "mode": p.mode, "issuer": p.issuer, "clientId": p.client_id, "clientSecret": secret})))
}

/// A workspace that is gone: nothing signs in to it, every session in it ends (a super admin's too), and the audit table says so. Runs in
/// the caller's transaction, the one that removes the workspace from the registry, so the two happen together or not at all.
pub fn workspace_removed(tx: &Connection, tenant: &str, now: i64) -> Result<(), String> {
    let had = tx.execute("DELETE FROM workspace_identity WHERE tenant_key=?1", [tenant]).map_err(e)? > 0;
    let ended = end_where(tx, now, "tenant_key=?1", params![tenant], "workspace_removed", "admin")?;
    audit_row(tx, now, "workspace_removed", "webx::workspace-identity", Some(tenant), None, Some(tenant), "admin", &format!("sign-in settings {}; {ended} session(s) ended", if had { "removed" } else { "none" }))
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
        // who may sign in as this person, and how, changed: the only way a super admin gets an identity, so it is on the record
        let list = |l: &mut dyn Iterator<Item = (&str, &str)>| l.map(|(i, s)| format!("{i}#{s}")).collect::<Vec<_>>().join(", ");
        let detail = format!(
            "{}from [{}] to [{}]",
            if user.super_admin { "super admin; " } else { "" },
            list(&mut before.iter().map(|b| (b.issuer.as_str(), b.subject.as_str()))),
            list(&mut wanted.iter().map(|(i, s)| (i.as_str(), s.as_str()))),
        );
        audit_row(&tx, now, "identities_saved", "webx::user", Some(&user.id.to_string()), Some(&user.email), None, "admin", &detail)?;
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
    /// "full", or "enroll" (it may only set up a second factor)
    scope: String,
}

const SESSION_COLS: &str = "id, user_id, tenant_key, issuer, idle_expires_at, absolute_expires_at, refresh_hash, previous_hash, previous_until, mfa_at, amr, created_at, last_used_at, revoked_at, revoked_reason, scope";

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
            scope: r.get(15)?,
        })
    })
    .optional()
    .map_err(e)
}

/// The user of a session that is still good, or why it is not: "revoked", "expired", "user_deleted", "user_disabled",
/// "membership_removed", or "workspace_not_configured" / "workspace_legacy" (the workspace no longer signs in through control).
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
        let p = open_for_sessions(policy(conn, t)?).map_err(|(reason, _)| reason.to_string())?;
        // a session that no longer meets the workspace's MFA requirement (its grace period ended while it was open) is over: the
        // person signs in again, and is asked for the code or sent to set one up
        match scope_for(conn, &p, user.id, s.mfa_at, now)? {
            Err(_) => return Err("mfa_required".into()),
            Ok("enroll") if s.scope != "enroll" => return Err("mfa_required".into()),
            Ok(_) => {}
        }
    }
    Ok(user)
}

/// Reasons `check_live` gives for a session that a change made elsewhere has left behind: the session is ended when it is next used.
const LEFT_BEHIND: [&str; 6] = ["user_disabled", "membership_removed", "user_deleted", "workspace_not_configured", "workspace_legacy", "mfa_required"];

/// The scope a session should have in workspace `p` (step 4): "enroll" when the workspace requires a second factor, its grace period
/// is over, the session was made without one and the person has none; "full" otherwise. A person who has a second factor but a
/// session made without it gets Err: that session cannot be used there, they sign in again and give the code.
fn scope_for(conn: &Connection, p: &Policy, user_id: i64, mfa_at: Option<i64>, now: i64) -> Result<Result<&'static str, (&'static str, &'static str)>, String> {
    if mfa_at.is_some() {
        return Ok(Ok("full"));
    }
    match mfa::requirement(p.mfa_required, p.mfa_required_at.as_deref(), now) {
        Some((_, true)) if mfa::enrolled(conn, user_id)? => Ok(Err(("mfa_required", "this workspace requires a second factor: sign in again and give the code"))),
        Some((_, true)) => Ok(Ok("enroll")),
        _ => Ok(Ok("full")),
    }
}

/// Whether the provider says it checked a second factor, and the workspace believes it: `acceptIdpMfa`, the workspace's own provider
/// (a provider is believed only about its own workspace), and `mfa` in `amr` (RFC 8176).
fn idp_checked_mfa(p: &Policy, req: &SignIn) -> bool {
    p.accept_idp_mfa && p.issuer.as_deref() == Some(req.issuer.as_str()) && req.amr.iter().any(|a| a == "mfa")
}

/// The access token of a session, for its active workspace.
fn access_for(keys: &Keys, cfg: &Config, user: &User, s: &Session, now: i64) -> Result<(String, i64), String> {
    identity::issue_token(keys, user, &Grant { aud: AUD_STUDIO, tenant: s.tenant.as_deref(), sid: Some(&s.id), mfa: s.mfa_at.is_some(), amr: &s.amr, scope: &s.scope, ttl: cfg.access_secs, job: None }, now)
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

    /// As the broker sent it (kept while a sign-in waits for the second factor, and read back with `from_json`).
    fn to_json(&self) -> Value {
        json!({"issuer": self.issuer, "subject": self.subject, "email": self.email, "emailVerified": self.email_verified, "amr": self.amr, "ip": self.ip, "userAgent": self.user_agent, "tenantKey": self.tenant})
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
    // the workspace has to sign in through control at all, for everyone
    let workspace = open_for_sessions(policy(conn, &req.tenant).map_err(db)?);
    let linked: Option<(i64, String)> = conn.query_row("SELECT user_id, linked_by FROM identities WHERE issuer=?1 AND subject=?2", params![req.issuer, req.subject], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|x| db(x.to_string()))?;
    // and the provider has to be the workspace's own, for everyone but a super admin (checked below)
    let own_provider = |p: &Policy| if p.issuer.as_deref() == Some(req.issuer.as_str()) { Ok(()) } else { Err(("issuer_mismatch", "that provider is not this workspace's provider")) };
    if let Some((uid, linked_by)) = linked {
        let user = identity::get_by_id(conn, uid).map_err(db)?.ok_or(("internal_error", "the identity store could not be read"))?;
        if user.disabled {
            return Err(("user_disabled", "this account is disabled"));
        }
        if user.super_admin {
            if linked_by != "admin" {
                return Err(("super_admin_needs_operator_link", "a super admin signs in only through an identity an operator linked"));
            }
            workspace?;
            return Ok(Decision { user: Some(user), add_membership: None, link_by: None, how: "identity" });
        }
        let policy = workspace?;
        own_provider(&policy)?;
        if user.role_in(&req.tenant).is_some() {
            return Ok(Decision { user: Some(user), add_membership: None, link_by: None, how: "identity" });
        }
        return match (policy.allow_jit, policy.jit_role) {
            (true, Some(role)) => Ok(Decision { add_membership: Some((req.tenant.clone(), role)), user: Some(user), link_by: None, how: "jit_membership" }),
            _ => Err(("not_a_member", "this account is not a member of that workspace")),
        };
    }
    // first sign-in of this (issuer, subject)
    let policy = workspace?;
    own_provider(&policy)?;
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
            // An account that exists and is not a member here is someone else's person: it may belong to other workspaces, with their
            // own providers and its own second factor. A workspace's provider makes new people on the spot; it never adopts one, or
            // whoever administers it could take over the account of anyone whose e-mail they know. A membership comes first.
            Err(("not_a_member", "this account is not a member of that workspace: an administrator has to add it first"))
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

/// `decide`, with a refusal written to the audit table.
fn decide_or_refuse(conn: &Connection, req: &SignIn, now: i64) -> Result<Decision, Refusal> {
    match decide(conn, req) {
        Ok(d) => Ok(d),
        Err((reason, message)) => {
            if reason == "internal_error" {
                return Err(Refusal::new(500, reason, message));
            }
            audit_event(conn, now, "sign_in_refused", Some(&req.email), Some(&req.tenant), None, "user", &detail(reason, &req.ip))?;
            Err(Refusal::denied(reason, message))
        }
    }
}

/// What a sign-in leads to.
pub enum Begun {
    /// {sessionId, accessToken, accessExpiresAt, refreshToken, idleExpiresAt, absoluteExpiresAt, scope, mfaDeadline}
    Session(Value),
    /// the person has a second factor: {mfaRequired: true, pendingId, expiresAt}. Studio asks for the code and calls `complete_mfa`
    MfaRequired(Value),
}

/// Sign a person in: decide as the module's comment says, then the second factor (step 4). A person who has one gives it before any
/// session exists, unless their provider checked one and the workspace believes it (`acceptIdpMfa`); a person who has none, in a
/// workspace that requires one and whose grace period is over, gets a session that may only set one up (scope `enroll`).
pub fn sign_in(conn: &Connection, keys: &Keys, cfg: &Config, req: &SignIn, now: i64) -> Result<Begun, Refusal> {
    let decision = decide_or_refuse(conn, req, now)?;
    let policy = policy(conn, &req.tenant)?.ok_or("the workspace's settings vanished")?;
    let idp_mfa = idp_checked_mfa(&policy, req);
    if let Some(u) = &decision.user {
        if !idp_mfa && mfa::enrolled(conn, u.id)? {
            // the opaque id is all Studio keeps (a cookie); only its hash is stored, with what the provider said
            let id = random_b64(32);
            let tx = conn.unchecked_transaction()?;
            tx.execute("DELETE FROM auth_pending WHERE expires_at <= ?1", [now])?;
            tx.execute("INSERT INTO auth_pending(id_hash, user_id, request, created_at, expires_at) VALUES (?1,?2,?3,?4,?5)", params![sha(&id), u.id, req.to_json().to_string(), now, now + PENDING_SECS])?;
            audit_event(&tx, now, "sign_in_mfa_pending", Some(&u.email), Some(&req.tenant), None, "user", &detail(decision.how, &req.ip))?;
            tx.commit()?;
            return Ok(Begun::MfaRequired(json!({"mfaRequired": true, "pendingId": id, "expiresAt": now + PENDING_SECS})));
        }
    }
    let how = if idp_mfa { "mfa=provider" } else { "" };
    open_session(conn, keys, cfg, req, &decision, &policy, idp_mfa.then_some(now), how, now).map(Begun::Session)
}

/// The second step of a sign-in that waited for a code: the pending id and the code (the authenticator's, or a recovery code). A
/// wrong code is counted against the person (mfa.rs: 8 in 10 minutes lock their codes). The sign-in is decided again, as anything
/// may have changed in the minutes between, and the session is made.
pub fn complete_mfa(conn: &Connection, keys: &Keys, cfg: &Config, secrets: Option<&SecretKey>, pending_id: &str, code: &str, now: i64) -> Result<Value, Refusal> {
    let expired = || Refusal::new(401, "mfa_pending_expired", "the sign-in has expired: start again");
    if pending_id.is_empty() || pending_id.len() > 128 {
        return Err(expired());
    }
    let hash = sha(pending_id);
    let row: Option<(i64, String, i64)> = conn.query_row("SELECT user_id, request, expires_at FROM auth_pending WHERE id_hash=?1", [&hash], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).optional()?;
    let Some((user_id, request, expires_at)) = row else { return Err(expired()) };
    if now >= expires_at {
        conn.execute("DELETE FROM auth_pending WHERE id_hash=?1", [&hash])?;
        return Err(expired());
    }
    let req = SignIn::from_json(&serde_json::from_str(&request).map_err(e)?)?;
    let user = identity::get_by_id(conn, user_id)?.ok_or_else(expired)?;
    // the code first, in a transaction of its own: a wrong one is counted whatever happens next
    let tx = conn.unchecked_transaction()?;
    let accepted = mfa::check(&tx, secrets, user_id, code, now);
    audit_code(&tx, now, &user, Some(&req.tenant), "sign_in", &accepted)?;
    tx.commit()?;
    let how = match accepted.map_err(mfa_refusal)? {
        mfa::Accepted::Totp => "mfa=totp",
        mfa::Accepted::Recovery { .. } => "mfa=recovery",
    };
    let decision = decide_or_refuse(conn, &req, now)?;
    if decision.user.as_ref().map(|u| u.id) != Some(user_id) {
        return Err(Refusal::denied("account_changed", "the account changed during the sign-in: start again"));
    }
    conn.execute("DELETE FROM auth_pending WHERE id_hash=?1", [&hash])?;
    let policy = policy(conn, &req.tenant)?.ok_or("the workspace's settings vanished")?;
    open_session(conn, keys, cfg, &req, &decision, &policy, Some(now), how, now)
}

/// A refusal for a code that was not accepted.
fn mfa_refusal(e: mfa::MfaError) -> Refusal {
    match e {
        mfa::MfaError::Invalid => Refusal::new(401, "mfa_invalid", "that code is not right"),
        mfa::MfaError::Locked { until } => Refusal { status: 429, reason: "mfa_locked", message: format!("too many wrong codes: try again after {}", stamp(until)) },
        mfa::MfaError::NotEnrolled => Refusal::new(409, "mfa_not_enrolled", "this account has no second factor"),
        mfa::MfaError::CodeRequired => Refusal::bad("a current code (or a recovery code) is needed to change the second factor"),
        mfa::MfaError::NotStarted => Refusal::new(409, "mfa_not_started", "start setting up the authenticator first (or again: it was too long ago)"),
        mfa::MfaError::NoKey => Refusal::new(503, "mfa_unavailable", "second factors are kept encrypted: start with WEBX_CONTROL_SECRET_KEY set"),
        mfa::MfaError::Internal(m) => Refusal::from(m),
    }
}

/// The audit row for a code given for `what`: a used recovery code, a wrong code, and the lock it led to.
fn audit_code(conn: &Connection, now: i64, user: &User, tenant: Option<&str>, what: &str, r: &Result<mfa::Accepted, mfa::MfaError>) -> Result<(), String> {
    let row = |action: &str, d: String| audit_row(conn, now, action, "webx::mfa", Some(&user.id.to_string()), Some(&user.email), tenant, "user", &d);
    match r {
        Ok(mfa::Accepted::Recovery { left }) => row("mfa_recovery_used", format!("{what}; {left} left")),
        Err(mfa::MfaError::Invalid) => {
            row("mfa_failed", what.to_string())?;
            match mfa::check_locked(conn, user.id, now)? {
                Some(until) => row("mfa_locked", format!("until {}", stamp(until))),
                None => Ok(()),
            }
        }
        _ => Ok(()),
    }
}

/// Make the session `decision` allows (the users, links and membership it says first), with the second factor checked at `mfa_at`.
#[allow(clippy::too_many_arguments)]
fn open_session(conn: &Connection, keys: &Keys, cfg: &Config, req: &SignIn, decision: &Decision, policy: &Policy, mfa_at: Option<i64>, mfa_how: &str, now: i64) -> Result<Value, Refusal> {
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
    // the second factor: a person who has one but did not give it never gets this far; one who has none, where it is overdue, may
    // only set one up
    let scope = scope_for(&tx, policy, user_id, mfa_at, now)?.map_err(|(reason, message)| Refusal::denied(reason, message))?;
    let deadline = if mfa_at.is_none() && !mfa::enrolled(&tx, user_id)? { mfa::requirement(policy.mfa_required, policy.mfa_required_at.as_deref(), now).map(|(d, _)| d) } else { None };
    let sid = random_b64(16);
    let secret = random_b64(32);
    let idle = (now + cfg.idle_secs).min(now + cfg.absolute_secs);
    let absolute = now + cfg.absolute_secs;
    tx.execute(
        "INSERT INTO sessions(id, user_id, tenant_key, issuer, created_at, last_used_at, idle_expires_at, absolute_expires_at, refresh_hash, mfa_at, amr, ip, ua, scope)
         VALUES (?1,?2,?3,?4,?5,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![sid, user_id, req.tenant, req.issuer, now, idle, absolute, sha(&secret), mfa_at, json!(req.amr).to_string(), req.ip, req.user_agent, scope],
    )?;
    let user = identity::get_by_id(&tx, user_id)?.ok_or("user vanished")?;
    if created {
        audit_event(&tx, now, "user_provisioned", Some(&user.email), Some(&req.tenant), Some(&sid), "user", &detail(&format!("jit role={}", decision.add_membership.as_ref().map_or("", |m| m.1.as_str())), &req.ip))?;
    }
    if decision.link_by.is_some() {
        audit_event(&tx, now, "identity_linked", Some(&user.email), Some(&req.tenant), Some(&sid), "user", &detail(decision.how, &req.ip))?;
    }
    let how = [decision.how, mfa_how, if scope == "enroll" { "scope=enroll" } else { "" }].iter().filter(|s| !s.is_empty()).copied().collect::<Vec<_>>().join(" ");
    audit_event(&tx, now, "sign_in", Some(&user.email), Some(&req.tenant), Some(&sid), "user", &detail(&how, &req.ip))?;
    let s = session(&tx, &sid)?.ok_or("session vanished")?;
    let (access, access_exp) = access_for(keys, cfg, &user, &s, now)?;
    tx.commit()?;
    Ok(json!({"sessionId": sid, "accessToken": access, "accessExpiresAt": access_exp, "refreshToken": format!("{sid}.{secret}"), "idleExpiresAt": idle, "absoluteExpiresAt": absolute, "scope": scope, "mfa": mfa_at.is_some(), "mfaDeadline": deadline}))
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
            // a user who is gone or lost the workspace, or a workspace that left control, ends the session here if the change did not already
            if LEFT_BEHIND.contains(&why.as_str()) {
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
    // a session that could only set up a second factor gets its full scope back when the workspace no longer requires one of it
    let mut s = s;
    if s.scope == "enroll" {
        if let Some(p) = s.tenant.as_deref().map(|t| policy(conn, t)).transpose()?.flatten() {
            if let Ok(Ok("full")) = scope_for(conn, &p, user.id, s.mfa_at, now) {
                conn.execute("UPDATE sessions SET scope='full' WHERE id=?1", [sid])?;
                s.scope = "full".into();
            }
        }
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
    // like signing in: only into a workspace that signs in through control, and (but for a super admin) one of the same provider
    let target = open_for_sessions(policy(conn, tenant)?).map_err(|(reason, message)| Refusal::denied(reason, message))?;
    if !user.super_admin && target.issuer.as_deref() != Some(s.issuer.as_str()) {
        return Err(Refusal::denied("issuer_mismatch", "this session was not made with that workspace's provider: sign in there"));
    }
    // the second factor as that workspace requires it: a session cannot leave its `enroll` scope behind by moving, nor carry it
    // into a workspace that does not ask
    let scope = scope_for(conn, &target, user.id, s.mfa_at, now)?.map_err(|(reason, message)| Refusal::denied(reason, message))?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE sessions SET tenant_key=?2, scope=?3 WHERE id=?1", params![sid, tenant, scope])?;
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
        "revokedAt": s.revoked_at, "mfa": s.mfa_at.is_some(), "scope": s.scope,
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

/// Did `after` lose anything `before` had, or might it have: enabled, a workspace, a role or custom role there (any change of either:
/// the token names both), or its place as (not) a super admin. Gaining a workspace loses nothing.
fn access_changed(before: &User, after: &User) -> bool {
    (!before.disabled && after.disabled)
        || before.super_admin != after.super_admin
        || before.memberships.iter().any(|m| after.role_in(&m.tenant_key) != Some(m.role.as_str()) || after.custom_role_in(&m.tenant_key) != m.custom_role.as_deref())
}

/// What an audit row says about a user as saved: enabled or not, super admin or not, and each workspace with its role.
fn user_summary(u: &User) -> String {
    let ms: Vec<String> = u.memberships.iter().map(|m| format!("{}/{}{}", m.tenant_key, m.role, m.custom_role.as_deref().map(|c| format!("+{c}")).unwrap_or_default())).collect();
    format!("{}{} memberships=[{}]", if u.disabled { "disabled" } else { "enabled" }, if u.super_admin { " super_admin" } else { "" }, ms.join(","))
}

/// `identity::upsert`, and the user's sessions end if what it did takes anything away (see access_changed). An audit row records what
/// the user became, in the same transaction.
pub fn replace_user(conn: &Connection, email: &str, body: &Value, now: i64) -> Result<bool, String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    let before = identity::get(&tx, email)?;
    let created = identity::upsert(&tx, email, body, &stamp(now))?;
    let after = identity::get(&tx, email)?.ok_or("user vanished")?;
    if let Some(b) = &before {
        if access_changed(b, &after) {
            let reason = if !b.disabled && after.disabled { "user_disabled" } else { "user_changed" };
            end_where(&tx, now, "user_id=?1", params![after.id], reason, "admin")?;
        }
    }
    audit_row(&tx, now, if created { "user_created" } else { "user_saved" }, "webx::user", Some(&after.id.to_string()), Some(&after.email), None, "admin", &user_summary(&after))?;
    tx.commit().map_err(e)?;
    Ok(created)
}

/// `identity::remove`, after ending the user's sessions (the audit rows stay when the user does not).
pub fn remove_user(conn: &Connection, email: &str, now: i64) -> Result<bool, String> {
    let tx = conn.unchecked_transaction().map_err(e)?;
    if let Some(u) = identity::get(&tx, email)? {
        end_where(&tx, now, "user_id=?1", params![u.id], "user_deleted", "admin")?;
        audit_row(&tx, now, "user_removed", "webx::user", Some(&u.id.to_string()), Some(&u.email), None, "admin", &user_summary(&u))?;
    }
    let removed = identity::remove(&tx, email)?;
    tx.commit().map_err(e)?;
    Ok(removed)
}

// ---------------------------------------------------------------- a person's own second factor (step 4)

/// The person and session an access token names, for their own MFA: a session's token only (one from /internal/token has no session),
/// in either scope (an `enroll` session is for exactly this).
fn own_session(conn: &Connection, keys: &Keys, token: &str, now: i64) -> Result<(User, Session), Refusal> {
    let unauth = || Refusal::new(401, "unauthenticated", "a signed-in person's token is needed");
    let claims = verify_access(conn, keys, token, now).map_err(|_| unauth())?;
    let sid = claims["sid"].as_str().ok_or_else(unauth)?;
    let s = session(conn, sid)?.ok_or_else(unauth)?;
    let user = identity::get_by_id(conn, s.user_id)?.ok_or_else(unauth)?;
    Ok((user, s))
}

fn mfa_row(conn: &Connection, now: i64, action: &str, user: &User, tenant: Option<&str>, actor: &str, detail: &str) -> Result<(), String> {
    audit_row(conn, now, action, "webx::mfa", Some(&user.id.to_string()), Some(&user.email), tenant, actor, detail)
}

/// What the person's MFA screen shows: {enrolled, pendingEnrolment, recoveryCodesLeft, lockedUntil, required, deadline, overdue,
/// scope, sessionMfa}.
pub fn mfa_status(conn: &Connection, keys: &Keys, token: &str, now: i64) -> Result<Value, Refusal> {
    let (user, s) = own_session(conn, keys, token, now)?;
    let mut v = mfa::status(conn, user.id, now)?;
    let p = s.tenant.as_deref().map(|t| policy(conn, t)).transpose()?.flatten();
    let req = p.as_ref().and_then(|p| mfa::requirement(p.mfa_required, p.mfa_required_at.as_deref(), now));
    let enrolled = v["enrolled"].as_bool().unwrap_or(false);
    v["required"] = json!(req.is_some());
    v["deadline"] = json!(req.map(|(d, _)| d));
    v["overdue"] = json!(req.is_some_and(|(_, past)| past) && !enrolled);
    v["scope"] = json!(s.scope);
    v["sessionMfa"] = json!(s.mfa_at.is_some());
    Ok(v)
}

/// Begin setting up an authenticator: {secret, otpauthUri}. With one already set up, `current` (a code from it, or a recovery code).
pub fn mfa_start(conn: &Connection, keys: &Keys, secrets: Option<&SecretKey>, token: &str, current: Option<&str>, now: i64) -> Result<Value, Refusal> {
    let (user, s) = own_session(conn, keys, token, now)?;
    let tenant = s.tenant.as_deref();
    let tx = conn.unchecked_transaction()?;
    let r = mfa::start(&tx, secrets, user.id, &user.email, current, now);
    match &r {
        Ok((_, _, used)) => {
            if let Some(a) = used {
                audit_code(&tx, now, &user, tenant, "replacing the authenticator", &Ok(a.clone()))?;
            }
            mfa_row(&tx, now, "mfa_enrolment_started", &user, tenant, "user", if used.is_some() { "replacing" } else { "first" })?;
        }
        Err(err) => audit_code(&tx, now, &user, tenant, "replacing the authenticator", &Err(err.clone()))?,
    }
    tx.commit()?;
    let (secret, uri, _) = r.map_err(mfa_refusal)?;
    Ok(json!({"secret": secret, "otpauthUri": uri}))
}

/// Confirm the new authenticator with a code from it: {recoveryCodes (shown once), accessToken, accessExpiresAt}. The session has just
/// seen the second factor, so it is multi-factor from now and has its full scope. When it replaced an older factor, the person's
/// other sessions end: they were made with the factor that is gone (perhaps a lost or stolen phone).
pub fn mfa_confirm(conn: &Connection, keys: &Keys, cfg: &Config, secrets: Option<&SecretKey>, token: &str, code: &str, now: i64) -> Result<Value, Refusal> {
    let (user, s) = own_session(conn, keys, token, now)?;
    let tenant = s.tenant.as_deref();
    let tx = conn.unchecked_transaction()?;
    let r = mfa::confirm(&tx, secrets, user.id, code, now);
    match &r {
        Ok((_, replaced)) => {
            tx.execute("UPDATE sessions SET mfa_at=?2, scope='full' WHERE id=?1", params![s.id, now])?;
            if *replaced {
                end_where(&tx, now, "user_id=?1 AND id<>?2", params![user.id, s.id], "mfa_replaced", "user")?;
            }
            mfa_row(&tx, now, "mfa_enabled", &user, tenant, "user", &format!("session {}{}", s.id, if *replaced { ", replacing the old factor" } else { "" }))?;
        }
        Err(err @ mfa::MfaError::Invalid) => audit_code(&tx, now, &user, tenant, "confirming the authenticator", &Err(err.clone()))?,
        Err(_) => {}
    }
    tx.commit()?;
    let (codes, _) = r.map_err(mfa_refusal)?;
    let upgraded = session(conn, &s.id)?.ok_or("session vanished")?;
    let (access, exp) = access_for(keys, cfg, &user, &upgraded, now)?;
    Ok(json!({"recoveryCodes": codes, "accessToken": access, "accessExpiresAt": exp}))
}

/// Switch the second factor off, with a current code or a recovery code (never a password). The person's other sessions end, and this
/// one is no longer multi-factor (where its workspace requires a second factor past the grace period, that ends it too). Returns
/// {enrolled: false} and, while this session lives on, a new access token for it.
pub fn mfa_disable(conn: &Connection, keys: &Keys, cfg: &Config, secrets: Option<&SecretKey>, token: &str, code: &str, now: i64) -> Result<Value, Refusal> {
    let (user, s) = own_session(conn, keys, token, now)?;
    let tenant = s.tenant.as_deref();
    let tx = conn.unchecked_transaction()?;
    let r = mfa::disable(&tx, secrets, user.id, code, now);
    audit_code(&tx, now, &user, tenant, "switching the factor off", &r)?;
    if r.is_ok() {
        tx.execute("UPDATE sessions SET mfa_at=NULL WHERE id=?1", [&s.id])?;
        end_where(&tx, now, "user_id=?1 AND id<>?2", params![user.id, s.id], "mfa_disabled", "user")?;
        mfa_row(&tx, now, "mfa_disabled", &user, tenant, "user", &format!("session {}", s.id))?;
    }
    tx.commit()?;
    r.map_err(mfa_refusal)?;
    let mut out = json!({"enrolled": false});
    let current = session(conn, &s.id)?.ok_or("session vanished")?;
    if check_live(conn, &current, now).is_ok() {
        let (access, exp) = access_for(keys, cfg, &user, &current, now)?;
        out["accessToken"] = json!(access);
        out["accessExpiresAt"] = json!(exp);
    }
    Ok(out)
}

/// An operator copies a person's factor from Strapi (tools/migrate-mfa.mjs; mfa::import). None for an unknown user, else whether it
/// was written (a person whose factor control already has any history of is left alone unless the body says `replace`, and a
/// replacement of a factor they had ends their sessions).
pub fn mfa_import(conn: &Connection, secrets: Option<&SecretKey>, email: &str, body: &Value, now: i64) -> Result<Option<bool>, Refusal> {
    let Some(user) = identity::get(conn, email)? else { return Ok(None) };
    let replace = match body.get("replace") {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(_) => return Err(Refusal::bad("replace must be true or false")),
    };
    let tx = conn.unchecked_transaction()?;
    let had = mfa::enrolled(&tx, user.id)?;
    let written = mfa::import(&tx, secrets, user.id, body, replace, now).map_err(|err| match err {
        mfa::MfaError::Internal(m) => Refusal { status: 400, reason: "bad_request", message: m },
        other => mfa_refusal(other),
    })?;
    if written {
        if had {
            end_where(&tx, now, "user_id=?1", params![user.id], "mfa_replaced", "admin")?;
        }
        mfa_row(&tx, now, "mfa_imported", &user, None, "admin", if had { "from Strapi, replacing the factor here" } else { "from Strapi" })?;
    }
    tx.commit()?;
    Ok(Some(written))
}

/// An operator takes a person's second factor away (a lost phone and no recovery code): their sessions end, and they set one up
/// again when their workspace requires it. None for an unknown user, else whether there was one.
pub fn mfa_reset(conn: &Connection, email: &str, now: i64) -> Result<Option<bool>, String> {
    let Some(user) = identity::get(conn, email)? else { return Ok(None) };
    let tx = conn.unchecked_transaction().map_err(e)?;
    let had = mfa::reset(&tx, user.id, now)?;
    if had {
        end_where(&tx, now, "user_id=?1", params![user.id], "mfa_reset", "admin")?;
        mfa_row(&tx, now, "mfa_reset", &user, None, "admin", "removed by an operator")?;
    }
    tx.commit().map_err(e)?;
    Ok(Some(had))
}

// ---------------------------------------------------------------- engine tokens

pub enum EngineRequest<'a> {
    /// for a person's live session; the workspace, if named, has to be the session's own
    Session { sid: &'a str, tenant: Option<&'a str> },
    /// for a background job running as its owner: no session, and a row in the audit table. Whose job it is and in which workspace
    /// are the stored job's (jobs.rs); a request that names them as well has to name the same
    Job { owner_email: Option<&'a str>, tenant: Option<&'a str>, job: &'a str },
}

impl EngineRequest<'_> {
    /// From the broker's body: {sessionId, tenantKey?} or {purpose: "job", jobId, ownerEmail?, tenantKey?}.
    pub fn from_json(v: &Value) -> Result<EngineRequest<'_>, Refusal> {
        let text = |k: &str| v.get(k).and_then(Value::as_str);
        if text("purpose") == Some("job") {
            let Some(job) = text("jobId") else { return Err(Refusal::bad("a job's token needs the jobId")) };
            let tenant = text("tenantKey");
            if tenant.is_some_and(|t| !identity::valid_tenant(t)) || !(1..=128).contains(&job.len()) || job.chars().any(char::is_control) {
                return Err(Refusal::bad("tenantKey or jobId is not valid"));
            }
            return Ok(EngineRequest::Job { owner_email: text("ownerEmail"), tenant, job });
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
            // a session that may only set up a second factor reaches no engine
            if s.scope == "enroll" {
                return Err(Refusal::denied("mfa_enrolment_required", "this workspace requires a second factor: set one up first"));
            }
            let (token, exp) = identity::issue_token(keys, &user, &Grant { aud: AUD_ENGINE, tenant: Some(active), sid: Some(&s.id), mfa: s.mfa_at.is_some(), amr: &s.amr, scope: "full", ttl: cfg.engine_secs, job: None }, now)?;
            Ok(json!({"token": token, "expiresAt": exp}))
        }
        EngineRequest::Job { owner_email, tenant: asked_tenant, job } => {
            let refuse = |reason: &'static str, message: &str, email: Option<&str>, tenant: Option<&str>| -> Result<Value, Refusal> {
                audit_event(conn, now, "engine_token_refused", email, tenant, Some(job), "job", reason)?;
                Err(Refusal::denied(reason, message))
            };
            // Whose job it is and where are taken from the job as stored, never from the request: whoever can write a job row or a
            // request must not be able to choose whose authority a job runs with. Only a job a worker is running now gets a token.
            let asked_owner = owner_email.map(str::to_lowercase);
            let Some(stored) = jobs::job_ref(conn, job, now * 1000)? else {
                return refuse("job_unknown", "there is no such job", asked_owner.as_deref(), *asked_tenant);
            };
            let owner = stored.owner.to_lowercase();
            let tenant = stored.tenant.as_str();
            if asked_owner.as_deref().is_some_and(|o| o != owner) || asked_tenant.is_some_and(|t| t != tenant) {
                return refuse("job_mismatch", "that is not this job's owner or workspace", Some(&owner), Some(tenant));
            }
            if !stored.running {
                return refuse("job_not_running", "only a job a worker is running gets a token", Some(&owner), Some(tenant));
            }
            let Some(user) = identity::get(conn, &owner)? else { return refuse("owner_revoked", "the job's owner is not a user", Some(&owner), Some(tenant)) };
            if user.disabled {
                return refuse("owner_revoked", "the job's owner is disabled", Some(&owner), Some(tenant));
            }
            if !user.may_act_in(tenant) {
                return refuse("owner_revoked", "the job's owner is no longer a member of that workspace", Some(&owner), Some(tenant));
            }
            // control acts for nobody in a workspace that does not sign in through it: its jobs run the old way
            let p = match open_for_sessions(policy(conn, tenant)?) {
                Ok(p) => p,
                Err((reason, message)) => return refuse(reason, message, Some(&owner), Some(tenant)),
            };
            // nor for an owner who is overdue with the second factor the workspace requires: their work waits until they have one
            if mfa::requirement(p.mfa_required, p.mfa_required_at.as_deref(), now).is_some_and(|(_, overdue)| overdue) && !mfa::enrolled(conn, user.id)? {
                return refuse("owner_mfa_required", "the job's owner has not set up the second factor this workspace requires", Some(&owner), Some(tenant));
            }
            let (token, exp) = identity::issue_token(keys, &user, &Grant { aud: AUD_ENGINE, tenant: Some(tenant), sid: None, mfa: false, amr: &[], scope: "full", ttl: cfg.engine_secs, job: Some(job) }, now)?;
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
        // and the token has to describe the session as it is now: its person, the workspace it is in, its scope and its second
        // factor. One made before a move, before the session became whole, or before the second factor changed is refused; the
        // session's next refresh (or the answer to the change) gives the right one
        let current = claims["uid"].as_str() == Some(s.user_id.to_string().as_str())
            && claims["tid"].as_str() == s.tenant.as_deref()
            && claims["scope"].as_str() == Some(s.scope.as_str())
            && claims["mfa"].as_bool() == Some(s.mfa_at.is_some());
        if !current {
            return Err("the token is older than its session's state: refresh it".into());
        }
    }
    Ok(claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    const T0: i64 = 1_800_000_000;
    const DGA: &str = "https://idp.example/realms/dga";
    const PEA: &str = "https://idp.example/realms/pea";

    /// A workspace that signs in through control (`both`) at `issuer`, with `extra` settings on top.
    fn open(c: &Connection, tenant: &str, issuer: &str, extra: Value, now: i64) -> Result<bool, String> {
        let mut body = json!({"mode": "both", "issuer": issuer, "clientId": "webx-studio"});
        for (k, v) in extra.as_object().unwrap() {
            body[k] = v.clone();
        }
        put_policy(c, None, tenant, &body, now)
    }
    fn tables() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(audit::DDL).unwrap();
        c.execute_batch(identity::DDL).unwrap();
        c.execute_batch(DDL).unwrap();
        migrate(&c).unwrap();
        c.execute_batch(mfa::DDL).unwrap();
        c.execute_batch(jobs::DDL).unwrap();
        c
    }
    fn setup() -> (Connection, Keys, Config) {
        let c = tables();
        let keys = Keys::load(&c, None, None).unwrap();
        open(&c, "dga", DGA, json!({}), T0).unwrap();
        open(&c, "pea", PEA, json!({}), T0).unwrap();
        identity::upsert(&c, "ann@example.org", &json!({"name": "Ann", "memberships": [{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}]}), &stamp(T0)).unwrap();
        (c, keys, Config::default())
    }
    fn req(email: &str, subject: &str, tenant: &str) -> SignIn {
        SignIn { issuer: if tenant == "pea" { PEA } else { DGA }.into(), subject: subject.into(), email: email.into(), email_verified: true, amr: vec!["pwd".into()], ip: Some("203.0.113.9".into()), user_agent: Some("test".into()), tenant: tenant.into() }
    }
    /// `sign_in` for a person without a second factor: the session it makes (the tests of step 4 call `super::sign_in` themselves)
    fn sign_in(c: &Connection, k: &Keys, cfg: &Config, r: &SignIn, now: i64) -> Result<Value, Refusal> {
        match super::sign_in(c, k, cfg, r, now)? {
            Begun::Session(v) => Ok(v),
            Begun::MfaRequired(v) => panic!("expected a session, not a wait for the second factor: {v}"),
        }
    }
    fn ann_signs_in(c: &Connection, k: &Keys, cfg: &Config, now: i64) -> Value {
        sign_in(c, k, cfg, &req("ann@example.org", "sub-ann", "dga"), now).unwrap()
    }
    fn reason(r: Result<Value, Refusal>) -> &'static str {
        r.unwrap_err().reason
    }
    /// The audit rows about sessions and sign-ins (not the operator's changes to settings and users), oldest first.
    fn actions(c: &Connection) -> Vec<(String, Option<String>)> {
        let mut st = c.prepare("SELECT action, entry_id FROM audit WHERE content_type='webx::session' ORDER BY id").unwrap();
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
        open(&c, "dga", DGA, json!({"requireVerifiedEmail": false}), T0).unwrap();
        assert!(sign_in(&c, &k, &cfg, &r, T0).is_ok());
        // an identity already linked does not need the e-mail again
        open(&c, "dga", DGA, json!({}), T0).unwrap();
        assert!(sign_in(&c, &k, &cfg, &r, T0 + 1).is_ok());
    }

    #[test]
    fn an_unknown_user_is_refused_unless_the_workspace_makes_people_on_the_spot() {
        let (c, k, cfg) = setup();
        let r = req("new@example.org", "sub-new", "dga");
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "unknown_user");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM users"), 1, "nobody was made");
        open(&c, "dga", DGA, json!({"allowJit": true, "jitRole": "viewer"}), T0).unwrap();
        let s = sign_in(&c, &k, &cfg, &r, T0).unwrap();
        let claims = identity::verify(&c, &k, s["accessToken"].as_str().unwrap(), AUD_STUDIO, T0).unwrap();
        assert_eq!((claims["role"].clone(), claims["sub"].clone()), (json!("viewer"), json!("new@example.org")), "with the role the workspace names");
        assert!(actions(&c).iter().any(|(a, _)| a == "user_provisioned"));
        assert!(open(&c, "dga", DGA, json!({"allowJit": true}), T0).is_err(), "on the spot needs a role to give");
    }

    #[test]
    fn a_workspaces_provider_never_adopts_a_person_who_exists_elsewhere() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        // Bob is pea's, with a second factor of his own
        identity::upsert(&c, "bob@example.org", &json!({"memberships": [{"tenantKey": "pea", "role": "admin"}]}), &stamp(T0)).unwrap();
        let bob = identity::get(&c, "bob@example.org").unwrap().unwrap();
        mfa::import(&c, Some(&key), bob.id, &json!({"secret": "JBSWY3DPEHPK3PXP"}), false, T0).unwrap();
        let mut r = req("bob@example.org", "sub-bob", "dga");
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "not_a_member");
        // even where dga makes people on the spot and believes its provider's second factor
        open(&c, "dga", DGA, json!({"allowJit": true, "jitRole": "viewer", "acceptIdpMfa": true}), T0).unwrap();
        r.amr = vec!["mfa".into()];
        assert_eq!(reason(super::sign_in(&c, &k, &cfg, &r, T0 + 1).map(|_| json!({}))), "not_a_member");
        let bob = identity::get(&c, "bob@example.org").unwrap().unwrap();
        assert_eq!((bob.role_in("dga"), bob.role_in("pea")), (None, Some("admin")), "nothing was added to his account");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM identities"), 0, "and nothing was linked");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM auth_pending"), 0, "nor could dga's provider start a sign-in that burns his codes");
        // once dga's administrator makes him a member, dga's provider is believed about him (and he gives his own code)
        identity::upsert(&c, "bob@example.org", &json!({"memberships": [{"tenantKey": "pea", "role": "admin"}, {"tenantKey": "dga", "role": "viewer"}]}), &stamp(T0)).unwrap();
        r.amr = vec!["pwd".into()];
        assert!(matches!(super::sign_in(&c, &k, &cfg, &r, T0 + 2).unwrap(), Begun::MfaRequired(_)));
        // a new person, on the other hand, is made on the spot
        assert_eq!(sign_in(&c, &k, &cfg, &req("new@example.org", "sub-new", "dga"), T0 + 3).unwrap()["scope"], json!("full"));
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
        // a workspace that signs in through control, whatever its own provider; not one with no settings, nor one that is legacy
        let mut r = req("root@example.org", "sub-root", "orst");
        r.issuer = platform.into();
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "workspace_not_configured");
        put_policy(&c, None, "orst", &json!({"mode": "legacy", "issuer": DGA}), T0).unwrap();
        assert_eq!(reason(sign_in(&c, &k, &cfg, &r, T0)), "workspace_legacy", "a super admin too");
        open(&c, "orst", DGA, json!({}), T0).unwrap();
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
        open(&c, "dga", DGA, json!({"requireVerifiedEmail": false}), T0 + 1).unwrap();
        assert_eq!(status(&c, sid, T0 + 2).unwrap().unwrap()["active"], json!(true), "same provider, settings changed");
        assert!(!open(&c, "dga", "https://new-idp.example/realms/dga", json!({}), T0 + 3).unwrap());
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
        open(&c, "dga", DGA, json!({}), T0 + 9).unwrap();
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
        open(&c, "orst", DGA, json!({}), T0).unwrap();
        assert_eq!(switch(&c, &k, &cfg, sid, "orst", T0 + 1).unwrap_err().reason, "not_a_member");
        // pea changes to dga's provider (a shared one): now it works
        open(&c, "pea", DGA, json!({}), T0 + 2).unwrap();
        let m = switch(&c, &k, &cfg, sid, "pea", T0 + 3).unwrap();
        let claims = identity::verify(&c, &k, m["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 4).unwrap();
        assert_eq!((claims["tid"].clone(), claims["role"].clone(), claims["tenants"].clone()), (json!("pea"), json!("viewer"), json!([{"key": "pea", "role": "viewer"}])));
        // the token for dga, from before the move, is the session's no longer: whatever happens to dga now, it cannot be used there
        assert!(verify_access(&c, &k, s["accessToken"].as_str().unwrap(), T0 + 4).is_err());
        assert!(verify_access(&c, &k, m["accessToken"].as_str().unwrap(), T0 + 4).is_ok());
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

    /// A job stored for `owner` in `tenant`, and taken by a worker (running, its lease good for jobs::LEASE_MS); its id.
    fn running_job(c: &Connection, tenant: &str, owner: &str, now: i64) -> String {
        let id = queued_job(c, tenant, owner, now);
        c.execute("UPDATE agent_jobs SET run_state='running', lease_owner='worker-1', lease_token='lease', lease_expires_ms=?2 WHERE document_id=?1", params![id, now * 1000 + jobs::LEASE_MS]).unwrap();
        id
    }
    fn queued_job(c: &Connection, tenant: &str, owner: &str, now: i64) -> String {
        jobs::create(c, &json!({"tenantKey": tenant, "ownerEmail": owner, "goal": "tidy the FAQ"}), now * 1000).unwrap()["documentId"].as_str().unwrap().to_string()
    }
    fn job_req(job: &str) -> EngineRequest<'_> {
        EngineRequest::Job { owner_email: None, tenant: None, job }
    }

    #[test]
    fn a_job_gets_a_token_while_its_owner_may_still_act_and_the_job_is_on_the_record() {
        let (c, k, cfg) = setup();
        let id = running_job(&c, "dga", "Ann@Example.org", T0);
        let ok = engine_token(&c, &k, &cfg, &job_req(&id), T0).unwrap();
        let claims = identity::verify_token(&k, ok["token"].as_str().unwrap(), AUD_ENGINE, T0, 0).unwrap();
        assert_eq!((claims["job"].clone(), claims["purpose"].clone(), claims["sid"].clone(), claims["tid"].clone(), claims["sub"].clone()), (json!(id), json!("job"), Value::Null, json!("dga"), json!("ann@example.org")));
        assert!(actions(&c).contains(&("engine_token_job".to_string(), Some(id.clone()))));
        // naming the owner and workspace too is fine when they are the job's
        assert!(engine_token(&c, &k, &cfg, &EngineRequest::Job { owner_email: Some("ANN@example.org"), tenant: Some("dga"), job: &id }, T0).is_ok());
        // a user who is not one, a workspace the owner is not in (the job rows are what they are: whoever wrote them)
        for (who, tenant) in [("nobody@example.org", "dga"), ("ann@example.org", "orst")] {
            open(&c, "orst", DGA, json!({}), T0).unwrap();
            let j = running_job(&c, tenant, who, T0);
            let e = engine_token(&c, &k, &cfg, &job_req(&j), T0).unwrap_err();
            assert_eq!((e.status, e.reason), (403, "owner_revoked"), "{who} {tenant}");
        }
        // a workspace that does not sign in through control: its jobs run the old way, control makes them no token
        identity::upsert(&c, "bo@example.org", &json!({"memberships": [{"tenantKey": "nsm", "role": "editor"}]}), &stamp(T0)).unwrap();
        let bo = running_job(&c, "nsm", "bo@example.org", T0);
        assert_eq!(engine_token(&c, &k, &cfg, &job_req(&bo), T0).unwrap_err().reason, "workspace_not_configured");
        put_policy(&c, None, "nsm", &json!({"issuer": DGA}), T0).unwrap();
        assert_eq!(engine_token(&c, &k, &cfg, &job_req(&bo), T0).unwrap_err().reason, "workspace_legacy");
        set_user(&c, "ann@example.org", json!({"disabled": true, "memberships": [{"tenantKey": "dga", "role": "editor"}]}), T0 + 1);
        assert_eq!(engine_token(&c, &k, &cfg, &job_req(&id), T0 + 2).unwrap_err().reason, "owner_revoked");
        let refused = actions(&c).iter().filter(|(a, j)| a == "engine_token_refused" && j.is_some()).count();
        assert_eq!(refused, 5, "each refusal is on the record with the job's id");
        // no session was made for any of it
        assert_eq!(count(&c, "SELECT COUNT(*) FROM sessions"), 0);
    }

    #[test]
    fn a_jobs_token_is_made_from_the_job_as_stored_and_only_while_a_worker_runs_it() {
        let (c, k, cfg) = setup();
        identity::upsert(&c, "boss@example.org", &json!({"memberships": [{"tenantKey": "dga", "role": "admin"}]}), &stamp(T0)).unwrap();
        let mine = running_job(&c, "dga", "ann@example.org", T0);
        // the request cannot pick whose authority the job runs with, nor where
        let as_boss = engine_token(&c, &k, &cfg, &EngineRequest::Job { owner_email: Some("boss@example.org"), tenant: None, job: &mine }, T0).unwrap_err();
        assert_eq!((as_boss.status, as_boss.reason), (403, "job_mismatch"));
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Job { owner_email: None, tenant: Some("pea"), job: &mine }, T0).unwrap_err().reason, "job_mismatch");
        // a job that does not exist, one waiting in the queue, one whose worker's lease ran out
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Job { owner_email: Some("boss@example.org"), tenant: Some("dga"), job: "no-such-job" }, T0).unwrap_err().reason, "job_unknown");
        let waiting = queued_job(&c, "dga", "ann@example.org", T0);
        assert_eq!(engine_token(&c, &k, &cfg, &job_req(&waiting), T0).unwrap_err().reason, "job_not_running");
        assert!(engine_token(&c, &k, &cfg, &job_req(&mine), T0 + 89).is_ok(), "inside its lease");
        assert_eq!(engine_token(&c, &k, &cfg, &job_req(&mine), T0 + 91).unwrap_err().reason, "job_not_running", "the lease ran out");
        // a job that ended
        let done = running_job(&c, "dga", "ann@example.org", T0);
        c.execute("UPDATE agent_jobs SET run_state='done' WHERE document_id=?1", [&done]).unwrap();
        assert_eq!(engine_token(&c, &k, &cfg, &job_req(&done), T0).unwrap_err().reason, "job_not_running");
        let rows: Vec<String> = c.prepare("SELECT target_ref FROM audit WHERE action='engine_token_refused' ORDER BY id").unwrap().query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
        assert_eq!(rows, ["job_mismatch", "job_mismatch", "job_unknown", "job_not_running", "job_not_running", "job_not_running"]);
    }

    #[test]
    fn the_engine_requests_are_checked() {
        for bad in [json!({}), json!({"purpose": "job", "ownerEmail": "a@b.co"}), json!({"purpose": "job", "ownerEmail": "a@b.co", "tenantKey": "BAD", "jobId": "1"}), json!({"purpose": "job", "ownerEmail": "a@b.co", "tenantKey": "dga", "jobId": ""}), json!({"sessionId": "s", "tenantKey": "BAD"})] {
            assert_eq!(EngineRequest::from_json(&bad).err().map(|r| r.status), Some(400), "{bad}");
        }
        assert!(matches!(EngineRequest::from_json(&json!({"sessionId": "s"})), Ok(EngineRequest::Session { tenant: None, .. })));
        assert!(matches!(EngineRequest::from_json(&json!({"purpose": "job", "ownerEmail": "a@b.co", "tenantKey": "dga", "jobId": "j"})), Ok(EngineRequest::Job { owner_email: Some(_), tenant: Some("dga"), .. })));
        assert!(matches!(EngineRequest::from_json(&json!({"purpose": "job", "jobId": "j"})), Ok(EngineRequest::Job { owner_email: None, tenant: None, job: "j" })), "the job alone is enough");
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
        let user = |disabled: bool, sa: bool, ms: &[(&str, &str, Option<&str>)]| User {
            id: 1,
            email: "a@b.co".into(),
            name: None,
            disabled,
            super_admin: sa,
            memberships: ms.iter().map(|(t, r, c)| identity::Membership { tenant_key: t.to_string(), role: r.to_string(), custom_role: c.map(String::from) }).collect(),
        };
        let both = [("dga", "editor", None), ("pea", "viewer", None)];
        let base = user(false, false, &both);
        assert!(!access_changed(&base, &user(false, false, &[("pea", "viewer", None), ("dga", "editor", None)])), "the order is nothing");
        assert!(!access_changed(&base, &user(false, false, &[("dga", "editor", None), ("pea", "viewer", None), ("orst", "viewer", Some("x"))])), "a new workspace");
        assert!(!access_changed(&user(true, false, &both), &user(false, false, &both)), "enabling");
        assert!(access_changed(&base, &user(true, false, &both)), "disabling");
        assert!(access_changed(&base, &user(false, true, &both)), "promotion");
        assert!(access_changed(&user(false, true, &both), &user(false, false, &both)), "demotion");
        assert!(access_changed(&base, &user(false, false, &[("dga", "editor", None)])), "a workspace gone");
        assert!(access_changed(&base, &user(false, false, &[("dga", "admin", None), ("pea", "viewer", None)])), "a role changed");
        // the token names the custom role too: giving one, taking one away or changing it all count
        let restricted = [("dga", "editor", Some("reviewer")), ("pea", "viewer", None)];
        assert!(access_changed(&base, &user(false, false, &restricted)), "a custom role given");
        assert!(access_changed(&user(false, false, &restricted), &base), "a custom role taken away");
        assert!(access_changed(&user(false, false, &restricted), &user(false, false, &[("dga", "editor", Some("writer")), ("pea", "viewer", None)])), "a custom role changed");
        assert!(!access_changed(&user(false, false, &restricted), &user(false, false, &restricted)), "the same custom role");
    }

    // ---------------------------------------------------------------- step 3: how a workspace signs in

    fn secret_key() -> SecretKey {
        use base64::engine::general_purpose::STANDARD;
        SecretKey::from_base64(&STANDARD.encode([7u8; 32])).unwrap()
    }

    #[test]
    fn a_workspace_has_sessions_only_while_it_signs_in_through_control() {
        let (c, k, cfg) = setup();
        // settings with only a provider are legacy, the default: nobody signs in through control there
        put_policy(&c, None, "orst", &json!({"issuer": DGA}), T0).unwrap();
        assert_eq!(policy(&c, "orst").unwrap().unwrap().mode, "legacy");
        identity::upsert(&c, "bo@example.org", &json!({"memberships": [{"tenantKey": "orst", "role": "editor"}, {"tenantKey": "dga", "role": "editor"}]}), &stamp(T0)).unwrap();
        assert_eq!(reason(sign_in(&c, &k, &cfg, &req("bo@example.org", "sub-bo", "orst"), T0)), "workspace_legacy");
        // and a session cannot move into it
        let s = sign_in(&c, &k, &cfg, &req("bo@example.org", "sub-bo", "dga"), T0).unwrap();
        let sid = s["sessionId"].as_str().unwrap().to_string();
        assert_eq!(switch(&c, &k, &cfg, &sid, "orst", T0 + 1).unwrap_err().reason, "workspace_legacy");
        // a super admin's session in dga too
        identity::upsert(&c, "root@example.org", &json!({"superAdmin": true, "memberships": []}), &stamp(T0)).unwrap();
        set_identities(&c, "root@example.org", &json!({"identities": [{"issuer": PEA, "subject": "sub-root"}]}), T0).unwrap();
        let mut r = req("root@example.org", "sub-root", "dga");
        r.issuer = PEA.into();
        let root = sign_in(&c, &k, &cfg, &r, T0).unwrap();
        let root_sid = root["sessionId"].as_str().unwrap().to_string();
        // dga goes back to legacy (a rollback): every session in it ends at once, the super admin's too
        put_policy(&c, None, "dga", &json!({"mode": "legacy", "issuer": DGA, "clientId": "webx-studio"}), T0 + 2).unwrap();
        for id in [&sid, &root_sid] {
            let st = status(&c, id, T0 + 3).unwrap().unwrap();
            assert_eq!((st["active"].clone(), st["reason"].clone()), (json!(false), json!("revoked: workspace_legacy")), "{id}");
        }
        assert_eq!(reason(refresh(&c, &k, &cfg, s["refreshToken"].as_str().unwrap(), T0 + 3)), "session_ended");
        // a session left behind some other way (a row changed under it) is not good either, and ends when it is next used
        open(&c, "dga", DGA, json!({}), T0 + 4).unwrap();
        let s2 = ann_signs_in(&c, &k, &cfg, T0 + 4);
        c.execute("UPDATE workspace_identity SET mode='legacy' WHERE tenant_key='dga'", []).unwrap();
        let sid2 = s2["sessionId"].as_str().unwrap();
        assert_eq!(status(&c, sid2, T0 + 5).unwrap().unwrap()["reason"], json!("workspace_legacy"));
        assert!(verify_access(&c, &k, s2["accessToken"].as_str().unwrap(), T0 + 5).is_err());
        assert_eq!(reason(refresh(&c, &k, &cfg, s2["refreshToken"].as_str().unwrap(), T0 + 5)), "session_ended");
        assert_eq!(status(&c, sid2, T0 + 6).unwrap().unwrap()["reason"], json!("revoked: workspace_legacy"));
        // removing the settings ends everything too
        open(&c, "dga", DGA, json!({}), T0 + 7).unwrap();
        let root2 = sign_in(&c, &k, &cfg, &r, T0 + 7).unwrap();
        assert!(delete_policy(&c, "dga", T0 + 8).unwrap());
        assert_eq!(status(&c, root2["sessionId"].as_str().unwrap(), T0 + 9).unwrap().unwrap()["reason"], json!("revoked: workspace_identity_removed"));
    }

    #[test]
    fn what_an_operator_sets_is_checked() {
        let c = tables();
        let refused = |body: Value| put_policy(&c, None, "dga", &body, T0).unwrap_err();
        assert!(refused(json!({"mode": "open"})).contains("mode"));
        assert!(refused(json!({"mode": "both", "issuer": DGA})).contains("clientId"), "both needs the client");
        assert!(refused(json!({"mode": "control", "clientId": "x"})).contains("issuer"), "control needs the provider");
        assert!(refused(json!({"issuer": "http://idp.example"})).contains("issuer"));
        assert!(refused(json!({"clientId": "has space"})).contains("clientId"));
        assert!(refused(json!({"clientId": ""})).contains("clientId"));
        assert!(refused(json!({"allowJit": true, "jitRole": "admin"})).contains("manage"), "nobody is made an admin on the spot");
        assert!(refused(json!({"allowJit": true, "jitRole": "Lead Editor"})).contains("jitRole"));
        assert!(refused(json!({"allowJit": "yes", "jitRole": "viewer"})).contains("allowJit"));
        assert!(refused(json!({"mfaRequiredAt": "2026-01-01T00:00:00.000Z"})).contains("mfaRequired"), "a start needs the requirement");
        assert!(refused(json!({"mfaRequired": true, "mfaRequiredAt": "yesterday"})).contains("time"));
        assert!(refused(json!({"mfaRequired": true, "mfaRequiredAt": "2099-01-01T00:00:00.000Z"})).contains("future"));
        assert!(refused(json!({"clientSecret": "s"})).contains("WEBX_CONTROL_SECRET_KEY"), "no key, no secret");
        assert!(refused(json!({"clientSecret": ""})).contains("clientSecret"));
        assert!(refused(json!([])).contains("object"));
        assert!(put_policy(&c, None, "BAD KEY", &json!({}), T0).is_err());
        assert!(policy(&c, "dga").unwrap().is_none(), "nothing was written");
        // the smallest settings: legacy, nothing required, a verified e-mail asked for
        assert!(put_policy(&c, None, "dga", &json!({}), T0).unwrap());
        let p = policy(&c, "dga").unwrap().unwrap();
        assert_eq!(p.to_json(), json!({"tenantKey": "dga", "mode": "legacy", "issuer": null, "clientId": null, "hasClientSecret": false, "allowJit": false, "jitRole": null, "requireVerifiedEmail": true, "mfaRequired": false, "mfaRequiredAt": null, "acceptIdpMfa": false, "updatedAt": stamp(T0)}));
    }

    #[test]
    fn the_client_secret_is_kept_sealed_and_shown_only_to_the_broker_once_the_workspace_switches() {
        let c = tables();
        let key = secret_key();
        let ks = Some(&key);
        put_policy(&c, ks, "dga", &json!({"issuer": DGA, "clientId": "webx-studio", "clientSecret": "s3cret-value"}), T0).unwrap();
        let stored: String = c.query_row("SELECT client_secret FROM workspace_identity WHERE tenant_key='dga'", [], |r| r.get(0)).unwrap();
        assert!(stored.starts_with("v1.") && !stored.contains("s3cret"), "only the sealed value is stored");
        let p = policy(&c, "dga").unwrap().unwrap();
        assert_eq!((p.to_json()["hasClientSecret"].clone(), p.to_json().get("clientSecret").is_none()), (json!(true), true), "the operator's view says it is there, never what it is");
        // legacy: the broker learns the mode and nothing else
        assert_eq!(sign_in_settings(&c, ks, "dga").unwrap().unwrap(), json!({"tenantKey": "dga", "mode": "legacy"}));
        assert!(sign_in_settings(&c, ks, "pea").unwrap().is_none());
        // switched: the provider, the client and the secret, opened
        put_policy(&c, ks, "dga", &json!({"mode": "both", "issuer": DGA, "clientId": "webx-studio"}), T0 + 1).unwrap();
        assert_eq!(sign_in_settings(&c, ks, "dga").unwrap().unwrap(), json!({"tenantKey": "dga", "mode": "both", "issuer": DGA, "clientId": "webx-studio", "clientSecret": "s3cret-value"}), "a save without clientSecret keeps it");
        assert!(sign_in_settings(&c, None, "dga").unwrap_err().contains("WEBX_CONTROL_SECRET_KEY"), "without the key it cannot be read");
        // sealed for its own workspace: copied into another row it does not open
        put_policy(&c, ks, "pea", &json!({"mode": "both", "issuer": PEA, "clientId": "c"}), T0).unwrap();
        c.execute("UPDATE workspace_identity SET client_secret=?1 WHERE tenant_key='pea'", [&stored]).unwrap();
        assert!(sign_in_settings(&c, ks, "pea").is_err());
        // a new one replaces it; null removes it
        put_policy(&c, ks, "dga", &json!({"mode": "both", "issuer": DGA, "clientId": "webx-studio", "clientSecret": "rotated"}), T0 + 2).unwrap();
        assert_eq!(sign_in_settings(&c, ks, "dga").unwrap().unwrap()["clientSecret"], json!("rotated"));
        put_policy(&c, ks, "dga", &json!({"mode": "both", "issuer": DGA, "clientId": "webx-studio", "clientSecret": null}), T0 + 3).unwrap();
        assert_eq!(sign_in_settings(&c, ks, "dga").unwrap().unwrap()["clientSecret"], Value::Null);
        // and no audit row carries it
        let details: Vec<String> = c.prepare("SELECT target_ref FROM audit").unwrap().query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
        assert!(details.iter().all(|d| !d.contains("s3cret") && !d.contains("rotated")), "{details:?}");
        assert!(details.iter().any(|d| d.contains("secret=set")) && details.iter().any(|d| d.contains("secret=kept")) && details.iter().any(|d| d.contains("secret=removed")));
    }

    #[test]
    fn the_mfa_grace_period_counts_from_when_it_was_first_required() {
        let c = tables();
        let at = |c: &Connection| policy(c, "dga").unwrap().unwrap().mfa_required_at;
        put_policy(&c, None, "dga", &json!({"mfaRequired": true}), T0).unwrap();
        assert_eq!(at(&c), Some(stamp(T0)));
        put_policy(&c, None, "dga", &json!({"mfaRequired": true, "acceptIdpMfa": true}), T0 + 100).unwrap();
        assert_eq!(at(&c), Some(stamp(T0)), "saving again does not start it again");
        put_policy(&c, None, "dga", &json!({"mfaRequired": false}), T0 + 200).unwrap();
        assert_eq!(at(&c), None);
        put_policy(&c, None, "dga", &json!({"mfaRequired": true}), T0 + 300).unwrap();
        assert_eq!(at(&c), Some(stamp(T0 + 300)), "off and on again starts a new one");
        // what a migration carries over from Strapi's tenant row is kept, in the one format
        put_policy(&c, None, "dga", &json!({"mfaRequired": true, "mfaRequiredAt": "2026-03-01T08:00:00Z"}), T0 + 400).unwrap();
        assert_eq!(at(&c), Some("2026-03-01T08:00:00.000Z".to_string()));
    }

    #[test]
    fn a_table_from_step_two_is_brought_up_to_date_and_comes_out_legacy() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(audit::DDL).unwrap();
        c.execute_batch(identity::DDL).unwrap();
        c.execute_batch(DDL).unwrap();
        c.execute_batch("CREATE TABLE workspace_identity(tenant_key TEXT PRIMARY KEY, issuer TEXT NOT NULL, allow_jit INTEGER NOT NULL DEFAULT 0, jit_role TEXT, require_verified_email INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
                         INSERT INTO workspace_identity VALUES ('dga', 'https://idp.example/realms/dga', 1, 'viewer', 0, '2026-11-26T00:00:00.000Z');").unwrap();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
        let p = policy(&c, "dga").unwrap().unwrap();
        assert_eq!((p.mode.as_str(), p.issuer.as_deref(), p.allow_jit, p.jit_role.as_deref(), p.require_verified_email, p.mfa_required), ("legacy", Some(DGA), true, Some("viewer"), false, false));
        // and the new table takes what the old one could not
        put_policy(&c, None, "pea", &json!({}), T0).unwrap();
        assert_eq!(count(&c, "SELECT COUNT(*) FROM sqlite_master WHERE name='workspace_identity_step2'"), 0);
    }

    // ---------------------------------------------------------------- step 4: the second factor

    fn code(secret: &str, t: i64) -> String {
        mfa::hotp(&mfa::base32_decode(secret).unwrap(), (t / 30) as u64, 6)
    }
    /// a 6-digit code that is no step's code around `t`
    fn wrong(secret: &str, t: i64) -> String {
        (0..10).map(|i| format!("00000{i}")).find(|x| (-2..=2).all(|d| code(secret, t + d * 30) != *x)).unwrap()
    }
    /// Ann sets up an authenticator through her own session (as Studio's Security screen will); returns its secret and her recovery codes
    fn ann_enrols(c: &Connection, k: &Keys, cfg: &Config, key: &SecretKey, now: i64) -> (String, Vec<String>) {
        let s = ann_signs_in(c, k, cfg, now);
        let token = s["accessToken"].as_str().unwrap();
        let started = mfa_start(c, k, Some(key), token, None, now).unwrap();
        let secret = started["secret"].as_str().unwrap().to_string();
        let done = mfa_confirm(c, k, cfg, Some(key), token, &code(&secret, now), now).unwrap();
        (secret, done["recoveryCodes"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect())
    }
    fn pending(b: Begun) -> String {
        match b {
            Begun::MfaRequired(v) => v["pendingId"].as_str().unwrap().to_string(),
            Begun::Session(v) => panic!("expected a wait for the second factor, got a session: {v}"),
        }
    }

    #[test]
    fn a_person_with_a_second_factor_gives_it_before_any_session_exists() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        let (secret, recovery) = ann_enrols(&c, &k, &cfg, &key, T0);
        let sessions_before = count(&c, "SELECT COUNT(*) FROM sessions");
        let id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 60).unwrap());
        assert_eq!(count(&c, "SELECT COUNT(*) FROM sessions"), sessions_before, "no session yet");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM auth_pending"), 1);
        let stored: Vec<u8> = c.query_row("SELECT id_hash FROM auth_pending", [], |r| r.get(0)).unwrap();
        assert_eq!(stored, sha(&id), "only the hash of the id is kept");
        // a wrong code: refused, counted, on the record
        let w = complete_mfa(&c, &k, &cfg, Some(&key), &id, &wrong(&secret, T0 + 61), T0 + 61).unwrap_err();
        assert_eq!((w.status, w.reason), (401, "mfa_invalid"));
        assert!(c.query_row("SELECT COUNT(*) FROM audit WHERE action='mfa_failed'", [], |r| r.get::<_, i64>(0)).unwrap() == 1);
        // the right one: a session, multi-factor
        let s = complete_mfa(&c, &k, &cfg, Some(&key), &id, &code(&secret, T0 + 62), T0 + 62).unwrap();
        let claims = identity::verify(&c, &k, s["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 62).unwrap();
        assert_eq!((claims["mfa"].clone(), claims["scope"].clone(), s["mfa"].clone()), (json!(true), json!("full"), json!(true)));
        assert_eq!(count(&c, "SELECT COUNT(*) FROM auth_pending"), 0, "used up");
        assert_eq!(complete_mfa(&c, &k, &cfg, Some(&key), &id, &code(&secret, T0 + 90), T0 + 90).unwrap_err().reason, "mfa_pending_expired");
        assert!(c.query_row("SELECT target_ref FROM audit WHERE action='sign_in' ORDER BY id DESC LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap().contains("mfa=totp"));
        // a recovery code does too, once
        let id2 = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 120).unwrap());
        assert!(complete_mfa(&c, &k, &cfg, Some(&key), &id2, &recovery[0], T0 + 121).is_ok());
        let id3 = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 130).unwrap());
        assert_eq!(complete_mfa(&c, &k, &cfg, Some(&key), &id3, &recovery[0], T0 + 131).unwrap_err().reason, "mfa_invalid");
        // a guessed id is nothing
        assert_eq!(complete_mfa(&c, &k, &cfg, Some(&key), "guess", "123456", T0 + 132).unwrap_err().reason, "mfa_pending_expired");
    }

    #[test]
    fn a_waiting_sign_in_expires_and_is_decided_again_when_the_code_comes() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        let (secret, _) = ann_enrols(&c, &k, &cfg, &key, T0);
        let id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 60).unwrap());
        assert_eq!(complete_mfa(&c, &k, &cfg, Some(&key), &id, &code(&secret, T0 + 60 + PENDING_SECS), T0 + 60 + PENDING_SECS).unwrap_err().reason, "mfa_pending_expired");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM auth_pending"), 0, "and it is gone");
        // disabled in the minutes between: the code is right, the sign-in is not
        let id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 1000).unwrap());
        set_user(&c, "ann@example.org", json!({"disabled": true, "memberships": [{"tenantKey": "dga", "role": "editor"}]}), T0 + 1001);
        assert_eq!(complete_mfa(&c, &k, &cfg, Some(&key), &id, &code(&secret, T0 + 1002), T0 + 1002).unwrap_err().reason, "user_disabled");
        // without the secret key nothing can be checked
        set_user(&c, "ann@example.org", json!({"memberships": [{"tenantKey": "dga", "role": "editor"}]}), T0 + 1003);
        let id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 1004).unwrap());
        assert_eq!(complete_mfa(&c, &k, &cfg, None, &id, &code(&secret, T0 + 1005), T0 + 1005).unwrap_err().reason, "mfa_unavailable");
    }

    #[test]
    fn eight_wrong_codes_lock_the_sign_in_and_say_so() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        let (secret, _) = ann_enrols(&c, &k, &cfg, &key, T0);
        let id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 60).unwrap());
        for i in 0..mfa::MAX_FAILURES {
            assert_eq!(complete_mfa(&c, &k, &cfg, Some(&key), &id, &wrong(&secret, T0 + 61), T0 + 61 + i).unwrap_err().reason, "mfa_invalid");
        }
        let locked = complete_mfa(&c, &k, &cfg, Some(&key), &id, &code(&secret, T0 + 70), T0 + 70).unwrap_err();
        assert_eq!((locked.status, locked.reason), (429, "mfa_locked"));
        assert_eq!(count(&c, "SELECT COUNT(*) FROM audit WHERE action='mfa_locked'"), 1);
    }

    #[test]
    fn the_providers_second_factor_counts_where_the_workspace_believes_its_provider() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        ann_enrols(&c, &k, &cfg, &key, T0);
        let mut r = req("ann@example.org", "sub-ann", "dga");
        r.amr = vec!["pwd".into(), "mfa".into()];
        // not believed until the workspace says so
        assert!(matches!(super::sign_in(&c, &k, &cfg, &r, T0 + 60).unwrap(), Begun::MfaRequired(_)));
        open(&c, "dga", DGA, json!({"acceptIdpMfa": true}), T0 + 60).unwrap();
        let s = sign_in(&c, &k, &cfg, &r, T0 + 61).unwrap();
        assert_eq!(s["mfa"], json!(true));
        assert!(c.query_row("SELECT target_ref FROM audit WHERE action='sign_in' ORDER BY id DESC LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap().contains("mfa=provider"));
        // the provider has to say "mfa"
        r.amr = vec!["pwd".into(), "otp".into()];
        assert!(matches!(super::sign_in(&c, &k, &cfg, &r, T0 + 62).unwrap(), Begun::MfaRequired(_)));
        // and only the workspace's own provider is believed: a super admin's platform provider is not dga's
        identity::upsert(&c, "root@example.org", &json!({"superAdmin": true, "memberships": []}), &stamp(T0)).unwrap();
        set_identities(&c, "root@example.org", &json!({"identities": [{"issuer": PEA, "subject": "sub-root"}]}), T0).unwrap();
        open(&c, "dga", DGA, json!({"acceptIdpMfa": true, "mfaRequired": true, "mfaRequiredAt": "2020-01-01T00:00:00.000Z"}), T0 + 63).unwrap();
        let mut root = req("root@example.org", "sub-root", "dga");
        root.issuer = PEA.into();
        root.amr = vec!["mfa".into()];
        assert_eq!(sign_in(&c, &k, &cfg, &root, T0 + 64).unwrap()["scope"], json!("enroll"), "pea's provider is not believed about dga");
    }

    #[test]
    fn after_the_grace_period_a_person_without_a_second_factor_may_only_set_one_up() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        // required since almost fourteen days: the deadline is 100 seconds away
        let first_required = T0 - mfa::GRACE_SECS + 100;
        open(&c, "dga", DGA, json!({"mfaRequired": true, "mfaRequiredAt": stamp(first_required)}), T0).unwrap();
        assert_eq!(policy(&c, "dga").unwrap().unwrap().mfa_required_at, Some(stamp(first_required)));
        // within the grace period: a full session, and the deadline to show
        let early = ann_signs_in(&c, &k, &cfg, T0);
        assert_eq!((early["scope"].clone(), early["mfaDeadline"].clone()), (json!("full"), json!(T0 + 100)));
        let st = mfa_status(&c, &k, early["accessToken"].as_str().unwrap(), T0).unwrap();
        assert_eq!((st["required"].clone(), st["overdue"].clone(), st["enrolled"].clone()), (json!(true), json!(false), json!(false)));
        // the deadline passes while that session is open: it is over, and a refresh says so
        let after = T0 + 200;
        assert_eq!(status(&c, early["sessionId"].as_str().unwrap(), after).unwrap().unwrap()["reason"], json!("mfa_required"));
        assert_eq!(reason(refresh(&c, &k, &cfg, early["refreshToken"].as_str().unwrap(), after)), "session_ended");
        // signing in again: a session that may only set one up
        let s = ann_signs_in(&c, &k, &cfg, after);
        let sid = s["sessionId"].as_str().unwrap().to_string();
        let token = s["accessToken"].as_str().unwrap().to_string();
        assert_eq!(s["scope"], json!("enroll"));
        assert_eq!(identity::verify(&c, &k, &token, AUD_STUDIO, after).unwrap()["scope"], json!("enroll"));
        assert_eq!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid: &sid, tenant: None }, after).unwrap_err().reason, "mfa_enrolment_required");
        assert_eq!(mfa_status(&c, &k, &token, after).unwrap()["overdue"], json!(true));
        // it lives on as it is (refreshes keep the scope) until the person sets one up
        let r = refresh(&c, &k, &cfg, s["refreshToken"].as_str().unwrap(), after + 5).unwrap();
        assert_eq!(identity::verify(&c, &k, r["accessToken"].as_str().unwrap(), AUD_STUDIO, after + 5).unwrap()["scope"], json!("enroll"));
        let started = mfa_start(&c, &k, Some(&key), &token, None, after + 10).unwrap();
        let secret = started["secret"].as_str().unwrap();
        let done = mfa_confirm(&c, &k, &cfg, Some(&key), &token, &code(secret, after + 20), after + 20).unwrap();
        let claims = identity::verify(&c, &k, done["accessToken"].as_str().unwrap(), AUD_STUDIO, after + 20).unwrap();
        assert_eq!((claims["scope"].clone(), claims["mfa"].clone()), (json!("full"), json!(true)), "the session has just seen the second factor");
        assert!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid: &sid, tenant: None }, after + 21).is_ok());
        assert_eq!(done["recoveryCodes"].as_array().unwrap().len(), 8);
    }

    #[test]
    fn an_enroll_session_is_whole_again_once_the_workspace_stops_requiring_a_factor() {
        let (c, k, cfg) = setup();
        open(&c, "dga", DGA, json!({"mfaRequired": true, "mfaRequiredAt": "2020-01-01T00:00:00.000Z"}), T0).unwrap();
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let sid = s["sessionId"].as_str().unwrap().to_string();
        assert_eq!(s["scope"], json!("enroll"));
        // the requirement is lifted (same provider, still `both`): nothing ends, and the next refresh gives the session its full scope
        // back, without claiming a second factor it never saw
        open(&c, "dga", DGA, json!({}), T0 + 10).unwrap();
        assert_eq!(status(&c, &sid, T0 + 11).unwrap().unwrap()["active"], json!(true));
        let r = refresh(&c, &k, &cfg, s["refreshToken"].as_str().unwrap(), T0 + 20).unwrap();
        let claims = identity::verify(&c, &k, r["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 20).unwrap();
        assert_eq!((claims["scope"].clone(), claims["mfa"].clone()), (json!("full"), json!(false)));
        assert!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid: &sid, tenant: None }, T0 + 21).is_ok());
        // the token from when the session could only set up a factor says a scope the session no longer has: only the new one passes
        assert!(verify_access(&c, &k, s["accessToken"].as_str().unwrap(), T0 + 21).is_err());
        assert!(verify_access(&c, &k, r["accessToken"].as_str().unwrap(), T0 + 21).is_ok());
    }

    #[test]
    fn a_person_who_has_a_factor_but_a_session_without_it_signs_in_again_once_it_is_required() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        let before = ann_signs_in(&c, &k, &cfg, T0);
        // she sets one up in another session; the first one was made without it
        ann_enrols_in_new_session_with_code(&c, &k, &cfg, &key);
        open(&c, "dga", DGA, json!({"mfaRequired": true, "mfaRequiredAt": "2020-01-01T00:00:00.000Z"}), T0 + 300).unwrap();
        assert_eq!(status(&c, before["sessionId"].as_str().unwrap(), T0 + 301).unwrap().unwrap()["reason"], json!("mfa_required"));
        assert!(verify_access(&c, &k, before["accessToken"].as_str().unwrap(), T0 + 301).is_err());
    }
    /// enrol Ann in a session of its own (the code given at sign-in counts as that session's second factor afterwards)
    fn ann_enrols_in_new_session_with_code(c: &Connection, k: &Keys, cfg: &Config, key: &SecretKey) {
        let s = ann_signs_in(c, k, cfg, T0 + 100);
        let t = s["accessToken"].as_str().unwrap();
        let secret = mfa_start(c, k, Some(key), t, None, T0 + 100).unwrap()["secret"].as_str().unwrap().to_string();
        mfa_confirm(c, k, cfg, Some(key), t, &code(&secret, T0 + 100), T0 + 100).unwrap();
    }

    #[test]
    fn moving_takes_on_the_requirement_of_the_workspace_moved_to() {
        let (c, k, cfg) = setup();
        open(&c, "dga", DGA, json!({"mfaRequired": true, "mfaRequiredAt": "2020-01-01T00:00:00.000Z"}), T0).unwrap();
        // pea and dga share a provider here, so the session may move
        open(&c, "pea", DGA, json!({}), T0).unwrap();
        let mut r = req("ann@example.org", "sub-ann", "pea");
        r.issuer = DGA.into();
        let s = sign_in(&c, &k, &cfg, &r, T0).unwrap();
        let sid = s["sessionId"].as_str().unwrap().to_string();
        assert_eq!(s["scope"], json!("full"));
        let moved = switch(&c, &k, &cfg, &sid, "dga", T0 + 1).unwrap();
        assert_eq!(identity::verify(&c, &k, moved["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 1).unwrap()["scope"], json!("enroll"), "into the workspace that requires it");
        let back = switch(&c, &k, &cfg, &sid, "pea", T0 + 2).unwrap();
        assert_eq!(identity::verify(&c, &k, back["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 2).unwrap()["scope"], json!("full"), "and out of it");
    }

    #[test]
    fn an_overdue_owners_jobs_wait_and_an_operator_can_take_a_factor_away() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        open(&c, "dga", DGA, json!({"mfaRequired": true, "mfaRequiredAt": "2020-01-01T00:00:00.000Z"}), T0).unwrap();
        let running = running_job(&c, "dga", "ann@example.org", T0);
        let job = |now| engine_token(&c, &k, &cfg, &job_req(&running), now);
        assert_eq!(job(T0).unwrap_err().reason, "owner_mfa_required");
        // once she has one, they run
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let t = s["accessToken"].as_str().unwrap();
        let secret = mfa_start(&c, &k, Some(&key), t, None, T0).unwrap()["secret"].as_str().unwrap().to_string();
        mfa_confirm(&c, &k, &cfg, Some(&key), t, &code(&secret, T0), T0).unwrap();
        assert!(job(T0 + 1).is_ok());
        // an operator takes it away (a lost phone): her sessions end and her jobs wait again
        assert_eq!(mfa_reset(&c, "ann@example.org", T0 + 2).unwrap(), Some(true));
        assert_eq!(status(&c, s["sessionId"].as_str().unwrap(), T0 + 3).unwrap().unwrap()["reason"], json!("revoked: mfa_reset"));
        assert_eq!(job(T0 + 3).unwrap_err().reason, "owner_mfa_required");
        assert_eq!(mfa_reset(&c, "ann@example.org", T0 + 4).unwrap(), Some(false));
        assert_eq!(mfa_reset(&c, "nobody@example.org", T0 + 4).unwrap(), None);
    }

    #[test]
    fn a_persons_own_mfa_needs_a_session_token() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        let (no_session, _) = identity::issue(&c, &k, "ann@example.org", Some("dga"), 900, T0).unwrap();
        assert_eq!(mfa_status(&c, &k, &no_session, T0).unwrap_err().status, 401);
        assert_eq!(mfa_start(&c, &k, Some(&key), "not a token", None, T0).unwrap_err().status, 401);
        let s = ann_signs_in(&c, &k, &cfg, T0);
        let t = s["accessToken"].as_str().unwrap();
        logout(&c, s["sessionId"].as_str().unwrap(), T0 + 1).unwrap();
        assert_eq!(mfa_start(&c, &k, Some(&key), t, None, T0 + 2).unwrap_err().status, 401, "a session that ended");
        let s = ann_signs_in(&c, &k, &cfg, T0 + 3);
        let t = s["accessToken"].as_str().unwrap();
        assert_eq!(mfa_start(&c, &k, None, t, None, T0 + 3).unwrap_err().reason, "mfa_unavailable");
        assert_eq!(mfa_confirm(&c, &k, &cfg, Some(&key), t, "123456", T0 + 3).unwrap_err().reason, "mfa_not_started");
        assert_eq!(mfa_disable(&c, &k, &cfg, Some(&key), t, "123456", T0 + 3).unwrap_err().reason, "mfa_not_enrolled");
        // replacing a factor that is on needs a code; switching it off too
        let secret = mfa_start(&c, &k, Some(&key), t, None, T0 + 3).unwrap()["secret"].as_str().unwrap().to_string();
        let done = mfa_confirm(&c, &k, &cfg, Some(&key), t, &code(&secret, T0 + 3), T0 + 3).unwrap();
        assert_eq!(mfa_status(&c, &k, t, T0 + 4).unwrap_err().status, 401, "the token from before the session became multi-factor is out of date");
        let t = done["accessToken"].as_str().unwrap();
        assert_eq!(mfa_start(&c, &k, Some(&key), t, None, T0 + 40).unwrap_err().status, 400);
        assert_eq!(mfa_disable(&c, &k, &cfg, Some(&key), t, &wrong(&secret, T0 + 40), T0 + 40).unwrap_err().reason, "mfa_invalid");
        let off = mfa_disable(&c, &k, &cfg, Some(&key), t, &code(&secret, T0 + 40), T0 + 40).unwrap();
        assert_eq!(off["enrolled"], json!(false));
        // the session lives on (dga requires nothing), no longer multi-factor, with a token that says so
        let after = identity::verify(&c, &k, off["accessToken"].as_str().unwrap(), AUD_STUDIO, T0 + 41).unwrap();
        assert_eq!(after["mfa"], json!(false));
        assert!(verify_access(&c, &k, t, T0 + 41).is_err(), "the token that said multi-factor is out of date");
        let rows: Vec<String> = c.prepare("SELECT action FROM audit WHERE content_type='webx::mfa' ORDER BY id").unwrap().query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
        assert_eq!(rows, ["mfa_enrolment_started", "mfa_enabled", "mfa_failed", "mfa_disabled"]);
    }

    #[test]
    fn switching_the_factor_off_or_replacing_it_ends_the_persons_other_sessions() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        // dga requires a second factor and its grace period is over
        open(&c, "dga", DGA, json!({"mfaRequired": true, "mfaRequiredAt": "2020-01-01T00:00:00.000Z"}), T0).unwrap();
        let (secret, recovery) = ann_enrols(&c, &k, &cfg, &key, T0);
        // two sessions with the code: a laptop and a phone
        let laptop_id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 60).unwrap());
        let laptop = complete_mfa(&c, &k, &cfg, Some(&key), &laptop_id, &code(&secret, T0 + 60), T0 + 60).unwrap();
        let phone_id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 61).unwrap());
        let phone = complete_mfa(&c, &k, &cfg, Some(&key), &phone_id, &recovery[0], T0 + 61).unwrap();
        // replacing the factor from the laptop ends the phone's session (it was made with the factor that is gone)
        let t = laptop["accessToken"].as_str().unwrap();
        let new_secret = mfa_start(&c, &k, Some(&key), t, Some(&code(&secret, T0 + 90)), T0 + 90).unwrap()["secret"].as_str().unwrap().to_string();
        let replaced = mfa_confirm(&c, &k, &cfg, Some(&key), t, &code(&new_secret, T0 + 91), T0 + 91).unwrap();
        assert_eq!(status(&c, phone["sessionId"].as_str().unwrap(), T0 + 92).unwrap().unwrap()["reason"], json!("revoked: mfa_replaced"));
        assert_eq!(status(&c, laptop["sessionId"].as_str().unwrap(), T0 + 92).unwrap().unwrap()["active"], json!(true));
        // switching it off: the laptop's session is no longer multi-factor, and where a factor is required that ends it, no engine token
        let t = replaced["accessToken"].as_str().unwrap();
        let other = complete_mfa(&c, &k, &cfg, Some(&key), &pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 120).unwrap()), &code(&new_secret, T0 + 150), T0 + 120).unwrap();
        let off = mfa_disable(&c, &k, &cfg, Some(&key), t, &code(&new_secret, T0 + 180), T0 + 180).unwrap();
        assert!(off.get("accessToken").is_none(), "no token: the session no longer meets dga's requirement");
        let laptop_sid = laptop["sessionId"].as_str().unwrap();
        assert_eq!(status(&c, laptop_sid, T0 + 181).unwrap().unwrap()["reason"], json!("mfa_required"));
        assert!(engine_token(&c, &k, &cfg, &EngineRequest::Session { sid: laptop_sid, tenant: None }, T0 + 181).is_err());
        assert_eq!(status(&c, other["sessionId"].as_str().unwrap(), T0 + 181).unwrap().unwrap()["reason"], json!("revoked: mfa_disabled"));
    }

    #[test]
    fn an_operators_copy_over_a_factor_ends_the_sessions_made_with_the_old_one() {
        let (c, k, cfg) = setup();
        let key = secret_key();
        let (secret, _) = ann_enrols(&c, &k, &cfg, &key, T0);
        let id = pending(super::sign_in(&c, &k, &cfg, &req("ann@example.org", "sub-ann", "dga"), T0 + 60).unwrap());
        let s = complete_mfa(&c, &k, &cfg, Some(&key), &id, &code(&secret, T0 + 60), T0 + 60).unwrap();
        // without replace nothing is written, and nothing ends
        assert_eq!(mfa_import(&c, Some(&key), "ann@example.org", &json!({"secret": "JBSWY3DPEHPK3PXP"}), T0 + 70).unwrap(), Some(false));
        assert_eq!(status(&c, s["sessionId"].as_str().unwrap(), T0 + 71).unwrap().unwrap()["active"], json!(true));
        // with it, the factor is Strapi's and the sessions the old one stood behind end
        assert_eq!(mfa_import(&c, Some(&key), "ann@example.org", &json!({"secret": "JBSWY3DPEHPK3PXP", "replace": true}), T0 + 80).unwrap(), Some(true));
        assert_eq!(status(&c, s["sessionId"].as_str().unwrap(), T0 + 81).unwrap().unwrap()["reason"], json!("revoked: mfa_replaced"));
        assert_eq!(mfa_import(&c, Some(&key), "ann@example.org", &json!({"secret": "JBSWY3DPEHPK3PXP", "replace": "yes"}), T0 + 82).unwrap_err().status, 400);
        assert_eq!(mfa_import(&c, Some(&key), "nobody@example.org", &json!({"secret": "JBSWY3DPEHPK3PXP"}), T0 + 83).unwrap(), None);
    }

    #[test]
    fn linking_an_identity_and_removing_a_workspace_are_on_the_record() {
        let (c, k, cfg) = setup();
        identity::upsert(&c, "root@example.org", &json!({"superAdmin": true, "memberships": []}), &stamp(T0)).unwrap();
        set_identities(&c, "root@example.org", &json!({"identities": [{"issuer": PEA, "subject": "sub-root"}]}), T0).unwrap();
        // the same again changes nothing and writes nothing
        set_identities(&c, "root@example.org", &json!({"identities": [{"issuer": PEA, "subject": "sub-root"}]}), T0 + 1).unwrap();
        let rows: Vec<String> = c.prepare("SELECT target_ref FROM audit WHERE action='identities_saved'").unwrap().query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
        assert_eq!(rows, [format!("super admin; from [] to [{PEA}#sub-root]")]);
        // a workspace removed: its settings and sessions go in the caller's transaction, with a row that says so
        let s = ann_signs_in(&c, &k, &cfg, T0 + 2);
        let tx = c.unchecked_transaction().unwrap();
        workspace_removed(&tx, "dga", T0 + 3).unwrap();
        tx.rollback().unwrap();
        assert_eq!(status(&c, s["sessionId"].as_str().unwrap(), T0 + 4).unwrap().unwrap()["active"], json!(true), "rolled back with its caller");
        let tx = c.unchecked_transaction().unwrap();
        workspace_removed(&tx, "dga", T0 + 5).unwrap();
        tx.commit().unwrap();
        assert!(policy(&c, "dga").unwrap().is_none());
        assert_eq!(status(&c, s["sessionId"].as_str().unwrap(), T0 + 6).unwrap().unwrap()["reason"], json!("revoked: workspace_removed"));
        let removed: String = c.query_row("SELECT target_ref FROM audit WHERE action='workspace_removed'", [], |r| r.get(0)).unwrap();
        assert_eq!(removed, "sign-in settings removed; 1 session(s) ended");
    }

    #[test]
    fn an_operators_changes_leave_rows_in_the_audit_table() {
        let c = tables();
        assert!(replace_user(&c, "Ann@Example.org", &json!({"memberships": [{"tenantKey": "dga", "role": "editor", "customRole": "reviewer"}]}), T0).unwrap());
        assert!(!replace_user(&c, "ann@example.org", &json!({"disabled": true, "memberships": [{"tenantKey": "dga", "role": "viewer"}]}), T0 + 1).unwrap());
        assert!(remove_user(&c, "ann@example.org", T0 + 2).unwrap());
        put_policy(&c, None, "dga", &json!({"mode": "both", "issuer": DGA, "clientId": "studio", "allowJit": true, "jitRole": "viewer", "mfaRequired": true}), T0 + 3).unwrap();
        delete_policy(&c, "dga", T0 + 4).unwrap();
        let rows: Vec<(String, String, String)> = c.prepare("SELECT action, content_type, target_ref FROM audit ORDER BY id").unwrap().query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().map(Result::unwrap).collect();
        let want = [
            ("user_created", "webx::user", "enabled memberships=[dga/editor+reviewer]"),
            ("user_saved", "webx::user", "disabled memberships=[dga/viewer]"),
            ("user_removed", "webx::user", "disabled memberships=[dga/viewer]"),
            ("workspace_identity_saved", "webx::workspace-identity", "mode=both issuer=https://idp.example/realms/dga client=studio secret=kept jit=viewer verified_email=true mfa_required=true accept_idp_mfa=false"),
            ("workspace_identity_removed", "webx::workspace-identity", "removed"),
        ];
        assert_eq!(rows.len(), want.len(), "{rows:?}");
        for (row, (a, t, d)) in rows.iter().zip(want) {
            assert_eq!((row.0.as_str(), row.1.as_str(), row.2.as_str()), (a, t, d));
        }
    }
}
