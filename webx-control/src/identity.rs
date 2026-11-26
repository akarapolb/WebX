//! Identity (docs/target-architecture.md, track C4, decisions D10 and D11): who the
//! users are, which workspaces they belong to and in what role, and the signed tokens
//! that prove it. No passwords are stored here: people are authenticated by an OIDC
//! provider (Studio does the sign-in), and this service then issues a short-lived token
//! that Studio and every content engine verify with the public keys from
//! `/.well-known/jwks.json`. Sessions (who is signed in, and how to end that) are in
//! sessions.rs; this file is the users and the token.
//!
//! Token (version 2): a JWT signed with Ed25519 (`alg` EdDSA), header `{alg, typ, kid}`:
//!   iss  "webx-control"
//!   aud  "webx-studio" for a signed-in person's token, "engine" for the 60-second token an engine verifies
//!   sub  the e-mail; uid the user's stable id (a deleted and re-created user is a different uid); name
//!   sid  the session this token belongs to (null for a token made without one)
//!   tid  the one workspace the token acts in (null: no workspace chosen); role the user's base role there (roles.rs; null if
//!        none); crole the custom role there (null: none), which can only take away from what the base role allows
//!   sa   the user is a super admin (tied to no workspace); `superAdmin` says the same, for what read the first version
//!   mfa  control considers the session multi-factor; amr what the sign-in used. `amr` is informational: decide on `mfa`
//!   scope "full", or "enroll": the session may only set up a second factor (C4 step 4); a verifier refuses everything else
//!   tenants [{key, role}] (kept from the first version), iat nbf exp jti
//! A job's acting token also has `purpose: "job"` and `job`.
//!
//! A verifier takes the key named by `kid` from the set it fetched (the current key and, while a rotation settles,
//! the previous one), checks `alg`, the signature, `iss`, `aud`, `nbf` and `exp`, and refuses anything missing.
use crate::roles;
use base64::{engine::general_purpose::STANDARD, engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use rusqlite::Connection;
use serde_json::{json, Value};

pub const ISSUER: &str = "webx-control";
/// the audience of the token a signed-in person's session carries
pub const AUD_STUDIO: &str = "webx-studio";
/// the audience of the short token an engine verifies
pub const AUD_ENGINE: &str = "engine";
/// a token longer than this is refused before anything is decoded
const MAX_TOKEN_LEN: usize = 32 * 1024;

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  super_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_key TEXT NOT NULL,
  role TEXT NOT NULL,
  custom_role TEXT,
  PRIMARY KEY(user_id, tenant_key)
);
CREATE TABLE IF NOT EXISTS signing_key(id INTEGER PRIMARY KEY CHECK (id = 1), seed BLOB NOT NULL);
";

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

/// Whether `table` exists and lacks `column`.
fn lacks_column(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let count = |sql: &str, args: &[&str]| conn.query_row(sql, rusqlite::params_from_iter(args), |r| r.get::<_, i64>(0)).map_err(e);
    Ok(count("SELECT COUNT(*) FROM pragma_table_info(?1)", &[table])? > 0 && count("SELECT COUNT(*) FROM pragma_table_info(?1) WHERE name=?2", &[table, column])? == 0)
}

/// A database made before `super_admin` or `custom_role` existed gets the column (idempotent).
pub fn migrate(conn: &Connection) -> Result<(), String> {
    if lacks_column(conn, "users", "super_admin")? {
        conn.execute("ALTER TABLE users ADD COLUMN super_admin INTEGER NOT NULL DEFAULT 0", []).map_err(e)?;
    }
    if lacks_column(conn, "memberships", "custom_role")? {
        conn.execute("ALTER TABLE memberships ADD COLUMN custom_role TEXT", []).map_err(e)?;
    }
    Ok(())
}

pub fn valid_email(s: &str) -> bool {
    s.len() <= 254 && s.split_once('@').is_some_and(|(l, d)| !l.is_empty() && d.contains('.') && !d.starts_with('.') && !d.ends_with('.') && !s.contains(char::is_whitespace))
}
pub fn valid_tenant(k: &str) -> bool {
    (2..=32).contains(&k.len()) && k.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

// ---------------------------------------------------------------- keys

fn seed_from_base64(name: &str, s: &str) -> Result<SigningKey, String> {
    let raw = STANDARD.decode(s.trim()).map_err(|_| format!("{name} is not base64"))?;
    let seed: [u8; 32] = raw.try_into().map_err(|_| format!("{name} must be 32 bytes"))?;
    Ok(SigningKey::from_bytes(&seed))
}

/// The key kept in the database, if one was made.
pub fn stored_key(conn: &Connection) -> Result<Option<SigningKey>, String> {
    match conn.query_row("SELECT seed FROM signing_key WHERE id=1", [], |r| r.get::<_, Vec<u8>>(0)) {
        Ok(seed) => {
            let seed: [u8; 32] = seed.try_into().map_err(|_| "stored signing key is damaged")?;
            Ok(Some(SigningKey::from_bytes(&seed)))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(x) => Err(e(x)),
    }
}

/// The signing key: the seed from `WEBX_CONTROL_SIGNING_KEY` (base64, 32 bytes) when given,
/// else the one stored in the database, made on first use.
pub fn signing_key(conn: &Connection, from_env: Option<&str>) -> Result<SigningKey, String> {
    if let Some(s) = from_env.filter(|s| !s.trim().is_empty()) {
        return seed_from_base64("WEBX_CONTROL_SIGNING_KEY", s);
    }
    if let Some(k) = stored_key(conn)? {
        return Ok(k);
    }
    let mut seed = [0u8; 32];
    getrandom::getrandom(&mut seed).map_err(e)?;
    conn.execute("INSERT INTO signing_key(id, seed) VALUES (1, ?1)", [seed.as_slice()]).map_err(e)?;
    Ok(SigningKey::from_bytes(&seed))
}

/// A fresh seed to put in `WEBX_CONTROL_SIGNING_KEY` (`webx-control keygen`).
pub fn new_seed() -> Result<String, String> {
    let mut seed = [0u8; 32];
    getrandom::getrandom(&mut seed).map_err(e)?;
    Ok(STANDARD.encode(seed))
}

/// The key id: the first bytes of the public key, so a key change shows in the token header.
pub fn kid(key: &VerifyingKey) -> String {
    B64.encode(&key.to_bytes()[..8])
}

/// The keys tokens are signed and checked with: the key that signs, and, while a rotation settles, the key that signed
/// before it, believed only for the tokens it already made. A key that is in neither place is refused (a retired key).
pub struct Keys {
    signing: SigningKey,
    /// the public keys whose signatures are accepted, the signing key's first
    verifying: Vec<VerifyingKey>,
    /// where the keys came from, for the start-up line ("environment" or "database")
    pub current_from: &'static str,
    pub previous_from: Option<&'static str>,
}

impl Keys {
    pub fn new(signing: SigningKey, previous: Option<VerifyingKey>) -> Keys {
        let mut verifying = vec![signing.verifying_key()];
        if let Some(p) = previous.filter(|p| p.to_bytes() != verifying[0].to_bytes()) {
            verifying.push(p);
        }
        Keys { signing, verifying, current_from: "environment", previous_from: None }
    }

    /// The keys from the settings. `current` is `WEBX_CONTROL_SIGNING_KEY` (the database's key when absent); `previous` is
    /// `WEBX_CONTROL_SIGNING_KEY_PREVIOUS`: the seed of the key being retired, or the word `database` for the key that is
    /// stored in the database (so a deployment that never set a key can rotate to one). Only the retired key's public half
    /// is kept: it is never used to sign.
    pub fn load(conn: &Connection, current: Option<&str>, previous: Option<&str>) -> Result<Keys, String> {
        let current_from = if current.is_some_and(|s| !s.trim().is_empty()) { "environment" } else { "database" };
        let signing = signing_key(conn, current)?;
        let (prev, previous_from) = match previous.map(str::trim).filter(|s| !s.is_empty()) {
            None => (None, None),
            Some("database") => match stored_key(conn)? {
                Some(k) => (Some(k.verifying_key()), Some("database")),
                None => return Err("WEBX_CONTROL_SIGNING_KEY_PREVIOUS is `database`, but no key is stored in the database".into()),
            },
            Some(s) => (Some(seed_from_base64("WEBX_CONTROL_SIGNING_KEY_PREVIOUS", s)?.verifying_key()), Some("environment")),
        };
        let mut keys = Keys::new(signing, prev);
        keys.current_from = current_from;
        keys.previous_from = if keys.verifying.len() > 1 { previous_from } else { None };
        Ok(keys)
    }

    #[cfg(test)]
    pub fn signing(&self) -> &SigningKey {
        &self.signing
    }

    /// The key ids a verifier will accept, the signing key's first.
    pub fn kids(&self) -> Vec<String> {
        self.verifying.iter().map(kid).collect()
    }

    /// The public keys as a JWK set (what engines and Studio fetch).
    pub fn jwks(&self) -> Value {
        json!({"keys": self.verifying.iter().map(|k| json!({"kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "use": "sig", "kid": kid(k), "x": B64.encode(k.to_bytes())})).collect::<Vec<_>>()})
    }

    fn find(&self, kid_wanted: &str) -> Option<&VerifyingKey> {
        self.verifying.iter().find(|k| kid(k) == kid_wanted)
    }
}

// ---------------------------------------------------------------- users

pub struct Membership {
    pub tenant_key: String,
    /// one of roles::BASE_ROLES (a row from before the catalogue may hold free text, which may do nothing)
    pub role: String,
    /// the workspace's own role that narrows the base role (`custom-role` records, by `roleKey`)
    pub custom_role: Option<String>,
}
pub struct User {
    pub id: i64,
    pub email: String,
    pub name: Option<String>,
    pub disabled: bool,
    /// not tied to one workspace: may act on every tenant (Studio's "unscoped" admin)
    pub super_admin: bool,
    pub memberships: Vec<Membership>,
}
impl User {
    pub fn to_json(&self) -> Value {
        json!({"email": self.email, "name": self.name, "disabled": self.disabled, "superAdmin": self.super_admin,
               "memberships": self.memberships.iter().map(|m| json!({"tenantKey": m.tenant_key, "role": m.role, "customRole": m.custom_role})).collect::<Vec<_>>()})
    }
    /// The user's role in `tenant`, if they are a member of it.
    pub fn role_in(&self, tenant: &str) -> Option<&str> {
        self.memberships.iter().find(|m| m.tenant_key == tenant).map(|m| m.role.as_str())
    }
    /// The user's custom role in `tenant`, if they are a member of it and have one.
    pub fn custom_role_in(&self, tenant: &str) -> Option<&str> {
        self.memberships.iter().find(|m| m.tenant_key == tenant).and_then(|m| m.custom_role.as_deref())
    }
    /// May the user act in `tenant`: a member of it, or a super admin.
    pub fn may_act_in(&self, tenant: &str) -> bool {
        self.super_admin || self.role_in(tenant).is_some()
    }
}

/// Create or replace a user and their memberships. Returns true when it was created.
/// body: {name?, disabled?, superAdmin?, memberships: [{tenantKey, role, customRole?}]}; `role` is one of roles::BASE_ROLES.
pub fn upsert(conn: &Connection, email: &str, body: &Value, now: &str) -> Result<bool, String> {
    let email = email.to_lowercase();
    if !valid_email(&email) {
        return Err("email is not valid".into());
    }
    let name = match body.get("name") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) if s.len() <= 200 => Some(s.clone()),
        _ => return Err("name must be text of at most 200 characters".into()),
    };
    let disabled = body.get("disabled").and_then(Value::as_bool).unwrap_or(false);
    let super_admin = body.get("superAdmin").and_then(Value::as_bool).unwrap_or(false);
    let mut members: Vec<(String, String, Option<String>)> = Vec::new();
    for m in body.get("memberships").and_then(Value::as_array).ok_or("memberships must be a list")? {
        let (k, r) = (m.get("tenantKey").and_then(Value::as_str).unwrap_or(""), m.get("role").and_then(Value::as_str).unwrap_or(""));
        if !valid_tenant(k) {
            return Err(format!("tenantKey {k:?} is not valid"));
        }
        if !roles::is_base_role(r) {
            return Err(format!("role {r:?} is not one of {}", roles::BASE_ROLES.join(", ")));
        }
        let custom = match m.get("customRole") {
            None | Some(Value::Null) => None,
            Some(Value::String(c)) if roles::valid_custom_role_key(c) => Some(c.clone()),
            Some(c) => return Err(format!("customRole {c} is not a custom role's key")),
        };
        if members.iter().any(|(x, _, _)| x == k) {
            return Err(format!("tenantKey {k} is listed twice"));
        }
        members.push((k.to_string(), r.to_string(), custom));
    }
    let existing: Option<i64> = conn.query_row("SELECT id FROM users WHERE email=?1", [&email], |r| r.get(0)).ok();
    let id = match existing {
        Some(id) => {
            conn.execute("UPDATE users SET name=?1, disabled=?2, super_admin=?3, updated_at=?4 WHERE id=?5", rusqlite::params![name, disabled, super_admin, now, id]).map_err(e)?;
            conn.execute("DELETE FROM memberships WHERE user_id=?1", [id]).map_err(e)?;
            id
        }
        None => {
            conn.execute("INSERT INTO users(email, name, disabled, super_admin, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5)", rusqlite::params![email, name, disabled, super_admin, now]).map_err(e)?;
            conn.last_insert_rowid()
        }
    };
    for (k, r, c) in &members {
        conn.execute("INSERT INTO memberships(user_id, tenant_key, role, custom_role) VALUES (?1,?2,?3,?4)", rusqlite::params![id, k, r, c]).map_err(e)?;
    }
    Ok(existing.is_none())
}

fn load_user(conn: &Connection, row: Option<(i64, String, Option<String>, bool, bool)>) -> Result<Option<User>, String> {
    let Some((id, email, name, disabled, super_admin)) = row else { return Ok(None) };
    let mut st = conn.prepare("SELECT tenant_key, role, custom_role FROM memberships WHERE user_id=?1 ORDER BY tenant_key").map_err(e)?;
    let memberships = st.query_map([id], |r| Ok(Membership { tenant_key: r.get(0)?, role: r.get(1)?, custom_role: r.get(2)? })).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    Ok(Some(User { id, email, name, disabled, super_admin, memberships }))
}

pub fn get(conn: &Connection, email: &str) -> Result<Option<User>, String> {
    let row = conn.query_row("SELECT id, email, name, disabled, super_admin FROM users WHERE email=?1", [email.to_lowercase()], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).ok();
    load_user(conn, row)
}

pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<User>, String> {
    let row = conn.query_row("SELECT id, email, name, disabled, super_admin FROM users WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).ok();
    load_user(conn, row)
}

pub fn list(conn: &Connection) -> Result<Vec<User>, String> {
    let mut st = conn.prepare("SELECT email FROM users ORDER BY id").map_err(e)?;
    let emails = st.query_map([], |r| r.get::<_, String>(0)).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    let mut out = Vec::new();
    for m in emails {
        if let Some(u) = get(conn, &m)? {
            out.push(u);
        }
    }
    Ok(out)
}

pub fn remove(conn: &Connection, email: &str) -> Result<bool, String> {
    Ok(conn.execute("DELETE FROM users WHERE email=?1", [email.to_lowercase()]).map_err(e)? > 0)
}

// ---------------------------------------------------------------- tokens

/// What a token states about its holder beyond who they are.
pub struct Grant<'a> {
    pub aud: &'a str,
    /// the workspace the token acts in (`tid`); none lists all of the user's workspaces and names no active one
    pub tenant: Option<&'a str>,
    pub sid: Option<&'a str>,
    pub mfa: bool,
    pub amr: &'a [String],
    /// "full", or "enroll": a session that may only set up a second factor (a workspace requires one, its grace period is over)
    pub scope: &'a str,
    pub ttl: i64,
    /// the background job this acting token is for
    pub job: Option<&'a str>,
}

fn new_jti() -> String {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).expect("random bytes");
    B64.encode(b)
}

/// A token for `user`, as `grant` says. The user must be enabled; for a workspace they must be a member of it, or a
/// super admin (who is tied to none). Returns the token and when it expires.
pub fn issue_token(keys: &Keys, user: &User, grant: &Grant, now_secs: i64) -> Result<(String, i64), String> {
    if user.disabled {
        return Err("user is disabled".into());
    }
    if let Some(t) = grant.tenant {
        if !valid_tenant(t) {
            return Err("tenantKey is not valid".into());
        }
        if !user.may_act_in(t) {
            return Err("user is not a member of that workspace".into());
        }
    }
    let tenants: Vec<Value> = user.memberships.iter().filter(|m| grant.tenant.is_none_or(|t| t == m.tenant_key)).map(|m| json!({"key": m.tenant_key, "role": m.role})).collect();
    let role = grant.tenant.and_then(|t| user.role_in(t));
    let crole = grant.tenant.and_then(|t| user.custom_role_in(t));
    let exp = now_secs + grant.ttl;
    let header = json!({"alg": "EdDSA", "typ": "JWT", "kid": kid(&keys.signing.verifying_key())});
    let mut claims = json!({
        "iss": ISSUER, "aud": grant.aud, "sub": user.email, "uid": user.id.to_string(), "name": user.name,
        "sid": grant.sid, "tid": grant.tenant, "role": role, "crole": crole,
        "sa": user.super_admin, "superAdmin": user.super_admin, "mfa": grant.mfa, "amr": grant.amr, "scope": grant.scope,
        "tenants": tenants, "iat": now_secs, "nbf": now_secs, "exp": exp, "jti": new_jti(),
    });
    if let Some(job) = grant.job {
        claims["purpose"] = json!("job");
        claims["job"] = json!(job);
    }
    let signing_input = format!("{}.{}", B64.encode(header.to_string()), B64.encode(claims.to_string()));
    let sig = keys.signing.sign(signing_input.as_bytes());
    Ok((format!("{signing_input}.{}", B64.encode(sig.to_bytes())), exp))
}

/// A token for `email` (what `/internal/token` has always done): enabled users only, for the workspace named or, without one,
/// carrying all of theirs. It belongs to no session, so it cannot be ended on its own.
pub fn issue(conn: &Connection, keys: &Keys, email: &str, tenant: Option<&str>, ttl_secs: i64, now_secs: i64) -> Result<(String, i64), String> {
    let u = get(conn, email)?.ok_or("unknown user")?;
    issue_token(keys, &u, &Grant { aud: AUD_STUDIO, tenant, sid: None, mfa: false, amr: &[], scope: "full", ttl: ttl_secs, job: None }, now_secs)
}

/// The checks every verifier makes, and nothing about the database: the algorithm, the key named by `kid`, the signature,
/// the issuer, the audience, `nbf` and `exp` (each given `leeway_secs` of clock difference), and that the claims a token
/// always has are there. Returns the claims.
pub fn verify_token(keys: &Keys, token: &str, aud: &str, now_secs: i64, leeway_secs: i64) -> Result<Value, String> {
    let not_a_token = || "not a token".to_string();
    if token.len() > MAX_TOKEN_LEN {
        return Err(not_a_token());
    }
    let parts: Vec<&str> = token.split('.').collect();
    let [h, c, s] = parts.as_slice() else { return Err(not_a_token()) };
    let header: Value = serde_json::from_slice(&B64.decode(h).map_err(|_| not_a_token())?).map_err(|_| not_a_token())?;
    if header["alg"] != "EdDSA" {
        return Err("unsupported algorithm".into());
    }
    let key = header["kid"].as_str().and_then(|k| keys.find(k)).ok_or("unknown signing key")?;
    let sig = Signature::from_slice(&B64.decode(s).map_err(|_| not_a_token())?).map_err(|_| "bad signature")?;
    key.verify_strict(format!("{h}.{c}").as_bytes(), &sig).map_err(|_| "bad signature")?;
    let claims: Value = serde_json::from_slice(&B64.decode(c).map_err(|_| not_a_token())?).map_err(|_| not_a_token())?;
    if claims["iss"] != ISSUER {
        return Err("wrong issuer".into());
    }
    if claims["aud"] != aud {
        return Err("wrong audience".into());
    }
    let (Some(exp), Some(nbf)) = (claims["exp"].as_i64(), claims["nbf"].as_i64()) else { return Err(not_a_token()) };
    if exp + leeway_secs <= now_secs {
        return Err("token expired".into());
    }
    if nbf - leeway_secs > now_secs {
        return Err("token not yet valid".into());
    }
    if claims["sub"].as_str().is_none_or(str::is_empty) || claims["uid"].as_str().is_none_or(str::is_empty) || claims["jti"].as_str().is_none_or(str::is_empty) {
        return Err(not_a_token());
    }
    Ok(claims)
}

/// `verify_token` for `aud`, and the user it names must still exist, be enabled and still have that e-mail: disabling a user cuts
/// them off before their token expires, and a user who was deleted and made again does not inherit the old one's tokens.
pub fn verify(conn: &Connection, keys: &Keys, token: &str, aud: &str, now_secs: i64) -> Result<Value, String> {
    let claims = verify_token(keys, token, aud, now_secs, 0)?;
    let id: i64 = claims["uid"].as_str().and_then(|s| s.parse().ok()).ok_or("not a token")?;
    match get_by_id(conn, id)? {
        Some(u) if !u.disabled && claims["sub"] == u.email.as_str() => Ok(claims),
        _ => Err("user is unknown or disabled".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: &str = "2026-11-24T10:00:00.000Z";
    fn db() -> (Connection, Keys) {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        let k = Keys::load(&c, None, None).unwrap();
        (c, k)
    }
    fn editor(c: &Connection) {
        upsert(c, "Ann@Example.org", &json!({"name": "Ann", "memberships": [{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}]}), NOW).unwrap();
    }
    fn seed_b64(b: u8) -> String {
        STANDARD.encode([b; 32])
    }
    /// A token put together by hand: any header, any claims, signed by `key` (or not at all).
    fn forge(header: Value, claims: Value, key: Option<&SigningKey>) -> String {
        let input = format!("{}.{}", B64.encode(header.to_string()), B64.encode(claims.to_string()));
        let sig = key.map(|k| B64.encode(k.sign(input.as_bytes()).to_bytes())).unwrap_or_default();
        format!("{input}.{sig}")
    }
    fn claims_now(sub: &str, uid: &str, now: i64) -> Value {
        json!({"iss": ISSUER, "aud": AUD_STUDIO, "sub": sub, "uid": uid, "iat": now, "nbf": now, "exp": now + 900, "jti": "x"})
    }
    fn header_for(k: &SigningKey) -> Value {
        json!({"alg": "EdDSA", "typ": "JWT", "kid": kid(&k.verifying_key())})
    }

    #[test]
    fn users_round_trip_with_lowercase_emails_and_replace_memberships() {
        let (c, _) = db();
        assert!(upsert(&c, "Ann@Example.org", &json!({"name": "Ann", "memberships": [{"tenantKey": "dga", "role": "editor"}]}), NOW).unwrap());
        assert!(!upsert(&c, "ann@example.org", &json!({"memberships": [{"tenantKey": "pea", "role": "admin"}]}), NOW).unwrap(), "same user");
        let u = get(&c, "ANN@example.org").unwrap().unwrap();
        assert_eq!((u.email.as_str(), u.name, u.memberships.len(), u.memberships[0].tenant_key.as_str()), ("ann@example.org", None, 1, "pea"));
        assert!(remove(&c, "ann@example.org").unwrap());
        assert!(get(&c, "ann@example.org").unwrap().is_none());
        assert_eq!(c.query_row("SELECT COUNT(*) FROM memberships", [], |r| r.get::<_, i64>(0)).unwrap(), 0, "memberships go with the user");
    }

    #[test]
    fn bad_input_is_refused() {
        let (c, _) = db();
        for (email, body) in [
            ("not-an-email", json!({"memberships": []})),
            ("a@b.co", json!({})),
            ("a@b.co", json!({"memberships": [{"tenantKey": "X", "role": "editor"}]})),
            ("a@b.co", json!({"memberships": [{"tenantKey": "dga", "role": ""}]})),
            ("a@b.co", json!({"memberships": [{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "dga", "role": "viewer"}]})),
            // roles are the catalogue's (roles.rs), no longer free text
            ("a@b.co", json!({"memberships": [{"tenantKey": "dga", "role": "Lead Editor"}]})),
            ("a@b.co", json!({"memberships": [{"tenantKey": "dga", "role": "super_admin"}]})),
            ("a@b.co", json!({"memberships": [{"tenantKey": "dga", "role": "editor", "customRole": "Has Spaces"}]})),
            ("a@b.co", json!({"memberships": [{"tenantKey": "dga", "role": "editor", "customRole": 7}]})),
        ] {
            assert!(upsert(&c, email, &body, NOW).is_err(), "{email} {body}");
        }
        assert_eq!(c.query_row("SELECT COUNT(*) FROM users", [], |r| r.get::<_, i64>(0)).unwrap(), 0, "nothing half-written");
    }

    #[test]
    fn a_custom_role_is_kept_per_membership_and_named_in_the_token() {
        let (c, k) = db();
        upsert(&c, "ann@example.org", &json!({"memberships": [{"tenantKey": "dga", "role": "editor", "customRole": "ผู้ตรวจ"}, {"tenantKey": "pea", "role": "viewer", "customRole": null}]}), NOW).unwrap();
        let u = get(&c, "ann@example.org").unwrap().unwrap();
        assert_eq!((u.custom_role_in("dga"), u.custom_role_in("pea"), u.custom_role_in("orst")), (Some("ผู้ตรวจ"), None, None));
        assert_eq!(u.to_json()["memberships"][0]["customRole"], json!("ผู้ตรวจ"));
        let (t, _) = issue(&c, &k, "ann@example.org", Some("dga"), 900, 1_000).unwrap();
        assert_eq!(verify(&c, &k, &t, AUD_STUDIO, 1_000).unwrap()["crole"], json!("ผู้ตรวจ"));
        let (t, _) = issue(&c, &k, "ann@example.org", Some("pea"), 900, 1_000).unwrap();
        assert_eq!(verify(&c, &k, &t, AUD_STUDIO, 1_000).unwrap()["crole"], Value::Null);
    }

    #[test]
    fn an_old_database_gets_the_new_columns_and_keeps_its_rows() {
        let c = Connection::open_in_memory().unwrap();
        // the tables as the first version made them
        c.execute_batch("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                         CREATE TABLE memberships(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, tenant_key TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(user_id, tenant_key));
                         INSERT INTO users(email, created_at, updated_at) VALUES ('old@example.org', 'x', 'x');
                         INSERT INTO memberships VALUES (1, 'dga', 'Lead Editor');").unwrap();
        c.execute_batch(DDL).unwrap();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
        let u = get(&c, "old@example.org").unwrap().unwrap();
        // a free-text role from before the catalogue is read as it is: it may do nothing (roles::allowed), and the next write must name a base role
        assert_eq!((u.super_admin, u.role_in("dga"), u.custom_role_in("dga")), (false, Some("Lead Editor"), None));
        assert!(roles::allowed("Lead Editor").is_empty());
    }

    #[test]
    fn a_token_verifies_and_carries_the_workspaces() {
        let (c, k) = db();
        editor(&c);
        let (t, exp) = issue(&c, &k, "ann@example.org", None, 900, 1_000).unwrap();
        assert_eq!(exp, 1_900);
        let claims = verify(&c, &k, &t, AUD_STUDIO, 1_500).unwrap();
        assert_eq!((claims["sub"].clone(), claims["tenants"].as_array().unwrap().len()), (json!("ann@example.org"), 2));
        assert_eq!((claims["tid"].clone(), claims["role"].clone()), (Value::Null, Value::Null), "no workspace chosen, none active");
        let (one, _) = issue(&c, &k, "ann@example.org", Some("pea"), 900, 1_000).unwrap();
        let one = verify(&c, &k, &one, AUD_STUDIO, 1_500).unwrap();
        assert_eq!(one["tenants"], json!([{"key": "pea", "role": "viewer"}]));
        assert_eq!((one["tid"].clone(), one["role"].clone()), (json!("pea"), json!("viewer")));
    }

    #[test]
    fn a_token_has_every_version_two_claim() {
        let (c, k) = db();
        editor(&c);
        let (t, _) = issue(&c, &k, "ann@example.org", Some("dga"), 900, 1_000).unwrap();
        let claims = verify_token(&k, &t, AUD_STUDIO, 1_000, 0).unwrap();
        let uid = get(&c, "ann@example.org").unwrap().unwrap().id.to_string();
        assert_eq!(claims["iss"], "webx-control");
        assert_eq!(claims["aud"], "webx-studio");
        assert_eq!((claims["sub"].clone(), claims["uid"].clone(), claims["name"].clone()), (json!("ann@example.org"), json!(uid), json!("Ann")));
        assert_eq!((claims["tid"].clone(), claims["role"].clone(), claims["crole"].clone()), (json!("dga"), json!("editor"), Value::Null));
        assert_eq!((claims["sa"].clone(), claims["superAdmin"].clone()), (json!(false), json!(false)));
        assert_eq!((claims["mfa"].clone(), claims["amr"].clone(), claims["sid"].clone()), (json!(false), json!([]), Value::Null));
        assert_eq!((claims["iat"].clone(), claims["nbf"].clone(), claims["exp"].clone()), (json!(1_000), json!(1_000), json!(1_900)));
        assert!(claims["jti"].as_str().unwrap().len() >= 20);
        let (t2, _) = issue(&c, &k, "ann@example.org", Some("dga"), 900, 1_000).unwrap();
        assert_ne!(verify_token(&k, &t2, AUD_STUDIO, 1_000, 0).unwrap()["jti"], claims["jti"], "every token has its own id");
        let header: Value = serde_json::from_slice(&B64.decode(t.split('.').next().unwrap()).unwrap()).unwrap();
        assert_eq!((header["alg"].clone(), header["typ"].clone(), header["kid"].clone()), (json!("EdDSA"), json!("JWT"), json!(k.kids()[0])));
    }

    #[test]
    fn a_session_token_carries_its_session_and_a_job_token_its_job() {
        let (c, k) = db();
        editor(&c);
        let u = get(&c, "ann@example.org").unwrap().unwrap();
        let amr = vec!["oidc".to_string()];
        let g = Grant { aud: AUD_ENGINE, tenant: Some("dga"), sid: Some("S1"), mfa: true, amr: &amr, scope: "full", ttl: 60, job: Some("job-9") };
        let (t, exp) = issue_token(&k, &u, &g, 5_000).unwrap();
        assert_eq!(exp, 5_060);
        let claims = verify_token(&k, &t, AUD_ENGINE, 5_000, 0).unwrap();
        assert_eq!((claims["sid"].clone(), claims["mfa"].clone(), claims["amr"].clone()), (json!("S1"), json!(true), json!(["oidc"])));
        assert_eq!((claims["purpose"].clone(), claims["job"].clone()), (json!("job"), json!("job-9")));
        assert_eq!(verify_token(&k, &t, AUD_STUDIO, 5_000, 0).unwrap_err(), "wrong audience", "an engine token is not a Studio token, and the other way round");
    }

    #[test]
    fn tokens_are_refused_when_expired_forged_or_the_user_is_gone() {
        let (c, k) = db();
        editor(&c);
        let (t, _) = issue(&c, &k, "ann@example.org", None, 900, 1_000).unwrap();
        assert_eq!(verify(&c, &k, &t, AUD_STUDIO, 1_900).unwrap_err(), "token expired");
        let other = Keys::new(SigningKey::from_bytes(&[7u8; 32]), None);
        assert_eq!(verify(&c, &other, &t, AUD_STUDIO, 1_500).unwrap_err(), "unknown signing key");
        let mut parts: Vec<String> = t.split('.').map(String::from).collect();
        parts[1] = B64.encode(json!({"iss": "webx-control", "aud": "webx-studio", "sub": "ann@example.org", "tenants": [{"key": "orst", "role": "admin"}], "exp": 99_999, "nbf": 0, "uid": "1", "jti": "x"}).to_string());
        assert_eq!(verify(&c, &k, &parts.join("."), AUD_STUDIO, 1_500).unwrap_err(), "bad signature", "claims cannot be changed");
        assert!(verify(&c, &k, "a.b", AUD_STUDIO, 1).is_err() && verify(&c, &k, "", AUD_STUDIO, 1).is_err());
        upsert(&c, "ann@example.org", &json!({"disabled": true, "memberships": []}), NOW).unwrap();
        assert_eq!(verify(&c, &k, &t, AUD_STUDIO, 1_500).unwrap_err(), "user is unknown or disabled", "disabling cuts a live token off");
        assert!(issue(&c, &k, "ann@example.org", None, 900, 1_000).is_err());
    }

    #[test]
    fn a_user_made_again_does_not_inherit_the_old_users_tokens() {
        let (c, k) = db();
        editor(&c);
        let (t, _) = issue(&c, &k, "ann@example.org", None, 900, 1_000).unwrap();
        assert!(remove(&c, "ann@example.org").unwrap());
        editor(&c);
        assert_eq!(verify(&c, &k, &t, AUD_STUDIO, 1_500).unwrap_err(), "user is unknown or disabled", "same e-mail, different uid");
        let (fresh, _) = issue(&c, &k, "ann@example.org", None, 900, 1_000).unwrap();
        assert!(verify(&c, &k, &fresh, AUD_STUDIO, 1_500).is_ok());
    }

    #[test]
    fn the_algorithm_is_not_negotiable() {
        let (_, k) = db();
        let now = 1_000;
        let claims = claims_now("a@b.co", "1", now);
        let kid_now = k.kids()[0].clone();
        // alg none, with and without a signature part
        for h in [json!({"alg": "none", "typ": "JWT", "kid": kid_now}), json!({"alg": "None", "kid": kid_now}), json!({"alg": "HS256", "kid": kid_now}), json!({"kid": kid_now})] {
            assert_eq!(verify_token(&k, &forge(h.clone(), claims.clone(), None), AUD_STUDIO, now, 0).unwrap_err(), "unsupported algorithm", "{h}");
            assert_eq!(verify_token(&k, &forge(h.clone(), claims.clone(), Some(k.signing())), AUD_STUDIO, now, 0).unwrap_err(), "unsupported algorithm", "{h}, even signed");
        }
        // the public key used as an HMAC secret is the classic downgrade: the algorithm is refused before any key is read
        let hs = format!("{}.{}.{}", B64.encode(json!({"alg": "HS256", "typ": "JWT", "kid": kid_now}).to_string()), B64.encode(claims.to_string()), B64.encode([1u8; 32]));
        assert_eq!(verify_token(&k, &hs, AUD_STUDIO, now, 0).unwrap_err(), "unsupported algorithm");
        // an EdDSA header with an empty or short signature
        assert_eq!(verify_token(&k, &forge(header_for(k.signing()), claims.clone(), None), AUD_STUDIO, now, 0).unwrap_err(), "bad signature");
        assert!(verify_token(&k, &format!("{}.{}.", B64.encode(header_for(k.signing()).to_string()), B64.encode(claims.to_string())), AUD_STUDIO, now, 0).is_err());
    }

    #[test]
    fn the_key_id_must_name_a_key_we_hold() {
        let (_, k) = db();
        let now = 1_000;
        let claims = claims_now("a@b.co", "1", now);
        let good = forge(header_for(k.signing()), claims.clone(), Some(k.signing()));
        assert!(verify_token(&k, &good, AUD_STUDIO, now, 0).is_ok());
        // right signature, wrong or missing kid: refused, we do not try every key
        for h in [json!({"alg": "EdDSA", "typ": "JWT", "kid": "AAAAAAAAAAA"}), json!({"alg": "EdDSA", "typ": "JWT"}), json!({"alg": "EdDSA", "kid": 7}), json!({"alg": "EdDSA", "kid": null})] {
            assert_eq!(verify_token(&k, &forge(h.clone(), claims.clone(), Some(k.signing())), AUD_STUDIO, now, 0).unwrap_err(), "unknown signing key", "{h}");
        }
        // a header that names our key but a signature by another is a bad signature
        let stranger = SigningKey::from_bytes(&[3u8; 32]);
        assert_eq!(verify_token(&k, &forge(header_for(k.signing()), claims, Some(&stranger)), AUD_STUDIO, now, 0).unwrap_err(), "bad signature");
    }

    #[test]
    fn the_audience_issuer_and_times_are_checked() {
        let (_, k) = db();
        let now = 10_000;
        let sign = |c: Value| forge(header_for(k.signing()), c, Some(k.signing()));
        let ok = claims_now("a@b.co", "1", now);
        assert!(verify_token(&k, &sign(ok.clone()), AUD_STUDIO, now, 0).is_ok());
        let with = |k: &str, v: Value| {
            let mut c = ok.clone();
            c[k] = v;
            c
        };
        assert_eq!(verify_token(&k, &sign(with("aud", json!("engine"))), AUD_STUDIO, now, 0).unwrap_err(), "wrong audience");
        assert_eq!(verify_token(&k, &sign(with("aud", json!(["webx-studio"]))), AUD_STUDIO, now, 0).unwrap_err(), "wrong audience", "one audience, as a string");
        assert_eq!(verify_token(&k, &sign(with("aud", Value::Null)), AUD_STUDIO, now, 0).unwrap_err(), "wrong audience");
        assert_eq!(verify_token(&k, &sign(with("iss", json!("someone-else"))), AUD_STUDIO, now, 0).unwrap_err(), "wrong issuer");
        assert_eq!(verify_token(&k, &sign(with("exp", json!(now))), AUD_STUDIO, now, 0).unwrap_err(), "token expired", "expiry is exclusive");
        assert_eq!(verify_token(&k, &sign(with("exp", json!(now - 1))), AUD_STUDIO, now, 0).unwrap_err(), "token expired");
        assert_eq!(verify_token(&k, &sign(with("nbf", json!(now + 1))), AUD_STUDIO, now, 0).unwrap_err(), "token not yet valid");
        assert!(verify_token(&k, &sign(with("nbf", json!(now))), AUD_STUDIO, now, 0).is_ok(), "valid from nbf itself");
        // clock difference between machines is forgiven by the amount a verifier chooses
        assert!(verify_token(&k, &sign(with("nbf", json!(now + 25))), AUD_STUDIO, now, 30).is_ok());
        assert_eq!(verify_token(&k, &sign(with("nbf", json!(now + 31))), AUD_STUDIO, now, 30).unwrap_err(), "token not yet valid");
        assert!(verify_token(&k, &sign(with("exp", json!(now - 25))), AUD_STUDIO, now, 30).is_ok());
        assert_eq!(verify_token(&k, &sign(with("exp", json!(now - 30))), AUD_STUDIO, now, 30).unwrap_err(), "token expired");
        // the claims a token always has: their absence is a refusal, not a default
        for missing in ["exp", "nbf", "sub", "uid", "jti"] {
            let mut c = ok.clone();
            c.as_object_mut().unwrap().remove(missing);
            assert_eq!(verify_token(&k, &sign(c), AUD_STUDIO, now, 0).unwrap_err(), "not a token", "without {missing}");
        }
        let mut c = ok.clone();
        c.as_object_mut().unwrap().remove("aud");
        assert_eq!(verify_token(&k, &sign(c), AUD_STUDIO, now, 0).unwrap_err(), "wrong audience", "a first-version token has no aud");
        assert_eq!(verify_token(&k, &sign(with("exp", json!("soon"))), AUD_STUDIO, now, 0).unwrap_err(), "not a token");
    }

    #[test]
    fn shapes_that_are_not_tokens_are_refused_without_a_panic() {
        let (_, k) = db();
        let huge = format!("{}.{}.{}", "a".repeat(20_000), "b".repeat(20_000), "c");
        for t in ["", ".", "..", "a.b", "a.b.c.d", "e30.e30.e30", "!!!.!!!.!!!", huge.as_str(), "eyJhbGciOiJFZERTQSJ9.bm90IGpzb24.AAAA"] {
            assert!(verify_token(&k, t, AUD_STUDIO, 1, 0).is_err(), "{:?}", &t[..t.len().min(30)]);
        }
        // a padded encoding is not what we issue
        let ok = forge(header_for(k.signing()), claims_now("a@b.co", "1", 1), Some(k.signing()));
        let mut p: Vec<String> = ok.split('.').map(String::from).collect();
        p[2].push('=');
        assert!(verify_token(&k, &p.join("."), AUD_STUDIO, 1, 0).is_err());
    }

    #[test]
    fn a_super_admin_is_not_tied_to_a_workspace() {
        let (c, k) = db();
        upsert(&c, "root@example.org", &json!({"superAdmin": true, "memberships": []}), NOW).unwrap();
        assert!(get(&c, "root@example.org").unwrap().unwrap().super_admin);
        let (t, _) = issue(&c, &k, "root@example.org", Some("orst"), 900, 1_000).unwrap();
        let claims = verify(&c, &k, &t, AUD_STUDIO, 1_500).unwrap();
        assert_eq!((claims["superAdmin"].clone(), claims["tenants"].clone()), (json!(true), json!([])));
        assert_eq!((claims["sa"].clone(), claims["tid"].clone(), claims["role"].clone()), (json!(true), json!("orst"), Value::Null), "acts in the workspace, holds no role there");
        editor(&c);
        assert_eq!(get(&c, "ann@example.org").unwrap().unwrap().to_json()["superAdmin"], json!(false));
        assert_eq!(issue(&c, &k, "root@example.org", Some("BAD KEY"), 900, 1_000).unwrap_err(), "tenantKey is not valid");
    }

    #[test]
    fn an_older_database_gets_the_column() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); INSERT INTO users(email, created_at, updated_at) VALUES ('old@example.org','x','x');").unwrap();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
        c.execute_batch("CREATE TABLE IF NOT EXISTS memberships(user_id INTEGER NOT NULL, tenant_key TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(user_id, tenant_key));").unwrap();
        migrate(&c).unwrap();
        assert!(!get(&c, "old@example.org").unwrap().unwrap().super_admin);
    }

    #[test]
    fn a_token_for_a_workspace_needs_membership() {
        let (c, k) = db();
        editor(&c);
        assert_eq!(issue(&c, &k, "ann@example.org", Some("orst"), 900, 1).unwrap_err(), "user is not a member of that workspace");
        assert_eq!(issue(&c, &k, "nobody@example.org", None, 900, 1).unwrap_err(), "unknown user");
    }

    #[test]
    fn the_signing_key_is_stable_and_can_come_from_the_environment() {
        let (c, k) = db();
        assert_eq!(signing_key(&c, None).unwrap().to_bytes(), k.signing().to_bytes(), "stored, not remade");
        assert_eq!(k.current_from, "database");
        let env = seed_b64(9);
        assert_eq!(signing_key(&c, Some(&env)).unwrap().to_bytes(), [9u8; 32]);
        assert!(signing_key(&c, Some("not base64!!")).is_err());
        assert!(signing_key(&c, Some(&STANDARD.encode([1u8; 31]))).is_err(), "32 bytes exactly");
        let j = k.jwks();
        assert_eq!((j["keys"][0]["kty"].clone(), j["keys"][0]["crv"].clone(), j["keys"][0]["alg"].clone()), (json!("OKP"), json!("Ed25519"), json!("EdDSA")));
        assert_eq!(j["keys"].as_array().unwrap().len(), 1);
        let from_env = Keys::load(&c, Some(&env), None).unwrap();
        assert_eq!((from_env.current_from, from_env.previous_from), ("environment", None));
        assert_eq!(from_env.signing().to_bytes(), [9u8; 32], "the environment wins over the database");
    }

    #[test]
    fn a_new_seed_is_a_usable_key() {
        let a = new_seed().unwrap();
        let b = new_seed().unwrap();
        assert_ne!(a, b);
        let (c, _) = db();
        assert_eq!(Keys::load(&c, Some(&a), None).unwrap().signing().to_bytes().len(), 32);
    }

    #[test]
    fn a_rotated_key_still_verifies_and_a_retired_one_does_not() {
        let (c, _) = db();
        editor(&c);
        let (old_seed, new_seed_) = (seed_b64(1), seed_b64(2));
        // before the rotation: one key
        let before = Keys::load(&c, Some(&old_seed), None).unwrap();
        let (old_token, _) = issue(&c, &before, "ann@example.org", Some("dga"), 900, 1_000).unwrap();
        // during it: the new key signs, the old one is still believed
        let during = Keys::load(&c, Some(&new_seed_), Some(&old_seed)).unwrap();
        assert_eq!(during.kids().len(), 2);
        assert_eq!(during.kids()[0], kid(&SigningKey::from_bytes(&[2u8; 32]).verifying_key()), "the current key is listed first");
        assert_eq!((during.current_from, during.previous_from), ("environment", Some("environment")));
        assert!(verify(&c, &during, &old_token, AUD_STUDIO, 1_100).is_ok(), "a token made before the rotation still verifies");
        let (new_token, _) = issue(&c, &during, "ann@example.org", Some("dga"), 900, 1_100).unwrap();
        assert!(verify(&c, &during, &new_token, AUD_STUDIO, 1_200).is_ok());
        let new_kid: Value = serde_json::from_slice(&B64.decode(new_token.split('.').next().unwrap()).unwrap()).unwrap();
        assert_eq!(new_kid["kid"], json!(during.kids()[0]), "new tokens are signed by the new key");
        // a verifier that fetched only the new key refuses the old token (that is what the overlap is for)
        let only_new = Keys::load(&c, Some(&new_seed_), None).unwrap();
        assert_eq!(verify(&c, &only_new, &old_token, AUD_STUDIO, 1_200).unwrap_err(), "unknown signing key", "a retired key is refused");
        assert!(verify(&c, &only_new, &new_token, AUD_STUDIO, 1_200).is_ok());
        // and the old key cannot be used to sign now
        assert_ne!(during.signing().to_bytes(), [1u8; 32]);
        let j = during.jwks();
        assert_eq!(j["keys"].as_array().unwrap().len(), 2);
        assert_eq!(j["keys"][1]["kid"], json!(kid(&SigningKey::from_bytes(&[1u8; 32]).verifying_key())));
    }

    #[test]
    fn the_database_key_can_be_the_one_retired() {
        let (c, first) = db(); // the database holds a key now, as it does on a deployment that never set one
        editor(&c);
        let (t, _) = issue(&c, &first, "ann@example.org", None, 900, 1_000).unwrap();
        let rotated = Keys::load(&c, Some(&seed_b64(5)), Some("database")).unwrap();
        assert_eq!((rotated.current_from, rotated.previous_from), ("environment", Some("database")));
        assert!(verify(&c, &rotated, &t, AUD_STUDIO, 1_100).is_ok(), "the stored key still verifies while it is `previous`");
        let done = Keys::load(&c, Some(&seed_b64(5)), None).unwrap();
        assert_eq!(verify(&c, &done, &t, AUD_STUDIO, 1_100).unwrap_err(), "unknown signing key", "and not after");
        // `database` with nothing stored is a mistake worth stopping for
        let empty = Connection::open_in_memory().unwrap();
        empty.execute_batch(DDL).unwrap();
        assert!(Keys::load(&empty, Some(&seed_b64(5)), Some("database")).is_err());
        assert!(Keys::load(&empty, Some(&seed_b64(5)), Some("garbage!")).is_err());
        assert!(Keys::load(&empty, Some(&seed_b64(5)), Some("  ")).unwrap().previous_from.is_none(), "an empty variable is not set");
    }

    #[test]
    fn the_same_key_twice_is_listed_once() {
        let (c, _) = db();
        let s = seed_b64(4);
        let k = Keys::load(&c, Some(&s), Some(&s)).unwrap();
        assert_eq!(k.kids().len(), 1);
        assert_eq!(k.previous_from, None);
        assert_eq!(k.jwks()["keys"].as_array().unwrap().len(), 1);
    }
}
