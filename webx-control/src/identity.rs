//! Identity (docs/target-architecture.md, track C4, decisions D10 and D11):
//! who the users are, which workspaces they belong to and in what role, and the
//! signed tokens that prove it. No passwords are stored here: people are
//! authenticated by an OIDC provider (Studio does the sign-in today), and this
//! service then issues a short-lived token that Studio and every content engine
//! verify with the public key from `/.well-known/jwks.json`.
//!
//! Token: a JWT signed with Ed25519 (`alg` EdDSA).
//!   {"iss":"webx-control","sub":"<email>","name":..,"tenants":[{"key":"dga","role":"editor"}],"iat":..,"exp":..}
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rusqlite::Connection;
use serde_json::{json, Value};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_key TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY(user_id, tenant_key)
);
CREATE TABLE IF NOT EXISTS signing_key(id INTEGER PRIMARY KEY CHECK (id = 1), seed BLOB NOT NULL);
";

fn e<E: std::fmt::Display>(x: E) -> String {
    x.to_string()
}

pub fn valid_email(s: &str) -> bool {
    s.len() <= 254 && s.split_once('@').is_some_and(|(l, d)| !l.is_empty() && d.contains('.') && !d.starts_with('.') && !d.ends_with('.') && !s.contains(char::is_whitespace))
}
fn valid_tenant(k: &str) -> bool {
    (2..=32).contains(&k.len()) && k.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn valid_role(r: &str) -> bool {
    (1..=64).contains(&r.len()) && r.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b' ')
}

/// The signing key: the seed from `WEBX_CONTROL_SIGNING_KEY` (base64, 32 bytes) when given,
/// else the one stored in the database, made on first use.
pub fn signing_key(conn: &Connection, from_env: Option<&str>) -> Result<SigningKey, String> {
    if let Some(s) = from_env.filter(|s| !s.is_empty()) {
        let raw = base64::engine::general_purpose::STANDARD.decode(s.trim()).map_err(|_| "WEBX_CONTROL_SIGNING_KEY is not base64")?;
        let seed: [u8; 32] = raw.try_into().map_err(|_| "WEBX_CONTROL_SIGNING_KEY must be 32 bytes")?;
        return Ok(SigningKey::from_bytes(&seed));
    }
    if let Ok(seed) = conn.query_row("SELECT seed FROM signing_key WHERE id=1", [], |r| r.get::<_, Vec<u8>>(0)) {
        let seed: [u8; 32] = seed.try_into().map_err(|_| "stored signing key is damaged")?;
        return Ok(SigningKey::from_bytes(&seed));
    }
    let mut seed = [0u8; 32];
    getrandom::getrandom(&mut seed).map_err(e)?;
    conn.execute("INSERT INTO signing_key(id, seed) VALUES (1, ?1)", [seed.as_slice()]).map_err(e)?;
    Ok(SigningKey::from_bytes(&seed))
}

/// The key id: the first bytes of the public key, so a key change shows in the token header.
pub fn kid(key: &VerifyingKey) -> String {
    B64.encode(&key.to_bytes()[..8])
}

/// The public key as a JWK set (what engines and Studio fetch).
pub fn jwks(key: &VerifyingKey) -> Value {
    json!({"keys": [{"kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "use": "sig", "kid": kid(key), "x": B64.encode(key.to_bytes())}]})
}

pub struct Membership {
    pub tenant_key: String,
    pub role: String,
}
pub struct User {
    pub email: String,
    pub name: Option<String>,
    pub disabled: bool,
    pub memberships: Vec<Membership>,
}
impl User {
    pub fn to_json(&self) -> Value {
        json!({"email": self.email, "name": self.name, "disabled": self.disabled,
               "memberships": self.memberships.iter().map(|m| json!({"tenantKey": m.tenant_key, "role": m.role})).collect::<Vec<_>>()})
    }
}

/// Create or replace a user and their memberships. Returns true when it was created.
/// body: {name?, disabled?, memberships: [{tenantKey, role}]}
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
    let mut members: Vec<(String, String)> = Vec::new();
    for m in body.get("memberships").and_then(Value::as_array).ok_or("memberships must be a list")? {
        let (k, r) = (m.get("tenantKey").and_then(Value::as_str).unwrap_or(""), m.get("role").and_then(Value::as_str).unwrap_or(""));
        if !valid_tenant(k) {
            return Err(format!("tenantKey {k:?} is not valid"));
        }
        if !valid_role(r) {
            return Err(format!("role {r:?} is not valid"));
        }
        if members.iter().any(|(x, _)| x == k) {
            return Err(format!("tenantKey {k} is listed twice"));
        }
        members.push((k.to_string(), r.to_string()));
    }
    let existing: Option<i64> = conn.query_row("SELECT id FROM users WHERE email=?1", [&email], |r| r.get(0)).ok();
    let id = match existing {
        Some(id) => {
            conn.execute("UPDATE users SET name=?1, disabled=?2, updated_at=?3 WHERE id=?4", rusqlite::params![name, disabled, now, id]).map_err(e)?;
            conn.execute("DELETE FROM memberships WHERE user_id=?1", [id]).map_err(e)?;
            id
        }
        None => {
            conn.execute("INSERT INTO users(email, name, disabled, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)", rusqlite::params![email, name, disabled, now]).map_err(e)?;
            conn.last_insert_rowid()
        }
    };
    for (k, r) in &members {
        conn.execute("INSERT INTO memberships(user_id, tenant_key, role) VALUES (?1,?2,?3)", rusqlite::params![id, k, r]).map_err(e)?;
    }
    Ok(existing.is_none())
}

pub fn get(conn: &Connection, email: &str) -> Result<Option<User>, String> {
    let email = email.to_lowercase();
    let row: Option<(i64, Option<String>, bool)> = conn.query_row("SELECT id, name, disabled FROM users WHERE email=?1", [&email], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).ok();
    let Some((id, name, disabled)) = row else { return Ok(None) };
    let mut st = conn.prepare("SELECT tenant_key, role FROM memberships WHERE user_id=?1 ORDER BY tenant_key").map_err(e)?;
    let memberships = st.query_map([id], |r| Ok(Membership { tenant_key: r.get(0)?, role: r.get(1)? })).map_err(e)?.collect::<Result<Vec<_>, _>>().map_err(e)?;
    Ok(Some(User { email, name, disabled, memberships }))
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

/// Issue a token for `email`. With `tenant`, the user must be a member of it and the token carries
/// only that workspace; without, it carries all of theirs. A disabled or unknown user gets none.
pub fn issue(conn: &Connection, key: &SigningKey, email: &str, tenant: Option<&str>, ttl_secs: i64, now_secs: i64) -> Result<(String, i64), String> {
    let u = get(conn, email)?.ok_or("unknown user")?;
    if u.disabled {
        return Err("user is disabled".into());
    }
    let tenants: Vec<Value> = u.memberships.iter().filter(|m| tenant.is_none_or(|t| t == m.tenant_key)).map(|m| json!({"key": m.tenant_key, "role": m.role})).collect();
    if tenant.is_some() && tenants.is_empty() {
        return Err("user is not a member of that workspace".into());
    }
    let exp = now_secs + ttl_secs;
    let header = json!({"alg": "EdDSA", "typ": "JWT", "kid": kid(&key.verifying_key())});
    let claims = json!({"iss": "webx-control", "sub": u.email, "name": u.name, "tenants": tenants, "iat": now_secs, "exp": exp});
    let signing_input = format!("{}.{}", B64.encode(header.to_string()), B64.encode(claims.to_string()));
    let sig = key.sign(signing_input.as_bytes());
    Ok((format!("{signing_input}.{}", B64.encode(sig.to_bytes())), exp))
}

/// Check a token's signature, issuer and expiry, and return its claims. Whether the user still
/// exists and is enabled is checked too, so disabling a user cuts them off before their token expires.
pub fn verify(conn: &Connection, key: &VerifyingKey, token: &str, now_secs: i64) -> Result<Value, String> {
    let parts: Vec<&str> = token.split('.').collect();
    let [h, c, s] = parts.as_slice() else { return Err("not a token".into()) };
    let header: Value = serde_json::from_slice(&B64.decode(h).map_err(|_| "not a token")?).map_err(|_| "not a token")?;
    if header["alg"] != "EdDSA" {
        return Err("unsupported algorithm".into());
    }
    let sig = Signature::from_slice(&B64.decode(s).map_err(|_| "not a token")?).map_err(|_| "bad signature")?;
    key.verify(format!("{h}.{c}").as_bytes(), &sig).map_err(|_| "bad signature")?;
    let claims: Value = serde_json::from_slice(&B64.decode(c).map_err(|_| "not a token")?).map_err(|_| "not a token")?;
    if claims["iss"] != "webx-control" {
        return Err("wrong issuer".into());
    }
    if claims["exp"].as_i64().is_none_or(|x| x <= now_secs) {
        return Err("token expired".into());
    }
    match get(conn, claims["sub"].as_str().unwrap_or(""))? {
        Some(u) if !u.disabled => Ok(claims),
        _ => Err("user is unknown or disabled".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: &str = "2026-11-24T10:00:00.000Z";
    fn db() -> (Connection, SigningKey) {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(DDL).unwrap();
        let k = signing_key(&c, None).unwrap();
        (c, k)
    }
    fn editor(c: &Connection) {
        upsert(c, "Ann@Example.org", &json!({"name": "Ann", "memberships": [{"tenantKey": "dga", "role": "editor"}, {"tenantKey": "pea", "role": "viewer"}]}), NOW).unwrap();
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
            ("a@b.co", json!({"memberships": [{"tenantKey": "dga", "role": "a"}, {"tenantKey": "dga", "role": "b"}]})),
        ] {
            assert!(upsert(&c, email, &body, NOW).is_err(), "{email} {body}");
        }
    }

    #[test]
    fn a_token_verifies_and_carries_the_workspaces() {
        let (c, k) = db();
        editor(&c);
        let (t, exp) = issue(&c, &k, "ann@example.org", None, 900, 1_000).unwrap();
        assert_eq!(exp, 1_900);
        let claims = verify(&c, &k.verifying_key(), &t, 1_500).unwrap();
        assert_eq!((claims["sub"].clone(), claims["tenants"].as_array().unwrap().len()), (json!("ann@example.org"), 2));
        let (one, _) = issue(&c, &k, "ann@example.org", Some("pea"), 900, 1_000).unwrap();
        assert_eq!(verify(&c, &k.verifying_key(), &one, 1_500).unwrap()["tenants"], json!([{"key": "pea", "role": "viewer"}]));
    }

    #[test]
    fn tokens_are_refused_when_expired_forged_or_the_user_is_gone() {
        let (c, k) = db();
        editor(&c);
        let (t, _) = issue(&c, &k, "ann@example.org", None, 900, 1_000).unwrap();
        let vk = k.verifying_key();
        assert_eq!(verify(&c, &vk, &t, 1_900).unwrap_err(), "token expired");
        let other = SigningKey::from_bytes(&[7u8; 32]);
        assert_eq!(verify(&c, &other.verifying_key(), &t, 1_500).unwrap_err(), "bad signature");
        let mut parts: Vec<String> = t.split('.').map(String::from).collect();
        parts[1] = B64.encode(json!({"iss": "webx-control", "sub": "ann@example.org", "tenants": [{"key": "orst", "role": "admin"}], "exp": 99_999}).to_string());
        assert_eq!(verify(&c, &vk, &parts.join("."), 1_500).unwrap_err(), "bad signature", "claims cannot be changed");
        assert!(verify(&c, &vk, "a.b", 1).is_err() && verify(&c, &vk, "", 1).is_err());
        upsert(&c, "ann@example.org", &json!({"disabled": true, "memberships": []}), NOW).unwrap();
        assert_eq!(verify(&c, &vk, &t, 1_500).unwrap_err(), "user is unknown or disabled", "disabling cuts a live token off");
        assert!(issue(&c, &k, "ann@example.org", None, 900, 1_000).is_err());
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
        assert_eq!(signing_key(&c, None).unwrap().to_bytes(), k.to_bytes(), "stored, not remade");
        let env = base64::engine::general_purpose::STANDARD.encode([9u8; 32]);
        assert_eq!(signing_key(&c, Some(&env)).unwrap().to_bytes(), [9u8; 32]);
        assert!(signing_key(&c, Some("not base64!!")).is_err());
        let j = jwks(&k.verifying_key());
        assert_eq!((j["keys"][0]["kty"].clone(), j["keys"][0]["crv"].clone()), (json!("OKP"), json!("Ed25519")));
    }
}
