//! A second factor kept by control (docs/c4-identity-plan.md, step 4, decision D20): TOTP as every authenticator app does it
//! (RFC 6238: HMAC-SHA-1 over 30-second steps, 6 digits, one step either side for a phone's clock), and eight single-use recovery
//! codes. What Studio does today (lib/totp.ts, governance.ts), with what its review found missing:
//!  - the authenticator secret is sealed (secrets.rs), bound to its user; recovery codes are kept only as tags (HMAC under a key
//!    derived from WEBX_CONTROL_SECRET_KEY), never as plain SHA-256;
//!  - a code that was accepted is never accepted again: the last time step used is kept (no replay within its 90 seconds);
//!  - failures are counted in the database, per user, across every place a code is given (signing in, replacing or switching the
//!    factor off): 8 within 10 minutes lock the account's codes until the 10 minutes are over, on every replica alike;
//!  - replacing the factor or switching it off takes a current code (or a recovery code), never a password; and replacing it keeps
//!    the old factor working until the new one is confirmed, so a half-finished replacement locks nobody out.
//!
//! A factor copied from Strapi (tools/migrate-mfa.mjs) keeps its secret, so the person's authenticator goes on working, and the
//! recovery codes they still have: those are Strapi's SHA-256 hashes, each accepted once like any recovery code, and gone when a new
//! set is made.
use crate::jobs;
use crate::secrets::{self, SecretKey};
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256};

pub const DDL: &str = "
CREATE TABLE IF NOT EXISTS mfa(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  secret TEXT,
  pending_secret TEXT,
  pending_at INTEGER,
  last_step INTEGER,
  recovery TEXT NOT NULL DEFAULT '[]',
  legacy_recovery TEXT NOT NULL DEFAULT '[]',
  failures INTEGER NOT NULL DEFAULT 0,
  failures_since INTEGER,
  enabled_at INTEGER,
  source TEXT,
  removed_at INTEGER,
  updated_at INTEGER NOT NULL
);
";

/// A table made before `removed_at` existed gets it (idempotent).
pub fn migrate(conn: &Connection) -> Result<(), String> {
    let has = conn.query_row("SELECT COUNT(*) FROM pragma_table_info('mfa') WHERE name='removed_at'", [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())? > 0;
    if !has {
        conn.execute("ALTER TABLE mfa ADD COLUMN removed_at INTEGER", []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// How long an unenrolled person may keep working after a workspace starts requiring a second factor (Studio's MFA_GRACE_DAYS).
pub const GRACE_SECS: i64 = 14 * 86_400;
/// Failed codes allowed per user within FAILURE_WINDOW_SECS (Studio's MFA_MAX_ATTEMPTS, now counted in the database).
pub const MAX_FAILURES: i64 = 8;
pub const FAILURE_WINDOW_SECS: i64 = 600;
/// An enrolment not confirmed within this long has to be started again.
const PENDING_SECS: i64 = 15 * 60;
const STEP_SECS: i64 = 30;
const DIGITS: u32 = 6;
const RECOVERY_CODES: usize = 8;
/// no I, O, 0 or 1: they are read wrong (Studio's alphabet)
const RECOVERY_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BASE32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Why a code or a change was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MfaError {
    /// the code is wrong (or was used already)
    Invalid,
    /// too many wrong codes: no code is accepted until `until` (seconds)
    Locked { until: i64 },
    /// the user has no second factor
    NotEnrolled,
    /// replacing or switching off the factor needs a current code
    CodeRequired,
    /// confirm came without a start, or too late
    NotStarted,
    /// WEBX_CONTROL_SECRET_KEY is not set
    NoKey,
    Internal(String),
}
impl From<String> for MfaError {
    fn from(m: String) -> MfaError {
        MfaError::Internal(m)
    }
}
impl From<rusqlite::Error> for MfaError {
    fn from(m: rusqlite::Error) -> MfaError {
        MfaError::Internal(m.to_string())
    }
}

// ---------------------------------------------------------------- TOTP

pub fn base32_encode(bytes: &[u8]) -> String {
    let mut out = String::new();
    let (mut buf, mut bits) = (0u32, 0u32);
    for &b in bytes {
        buf = (buf << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            out.push(BASE32[((buf >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(BASE32[((buf << (5 - bits)) & 31) as usize] as char);
    }
    out
}

/// A base32 secret as authenticator apps show it: letters in either case, spaces and padding ignored. None if anything else is in it.
pub fn base32_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let (mut buf, mut bits) = (0u32, 0u32);
    for c in s.chars().filter(|c| !c.is_whitespace() && *c != '=' && *c != '-') {
        let v = BASE32.iter().position(|&b| b as char == c.to_ascii_uppercase())? as u32;
        buf = (buf << 5) | v;
        bits += 5;
        if bits >= 8 {
            out.push((buf >> (bits - 8)) as u8);
            bits -= 8;
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/// The code for one time step (RFC 4226's HOTP with the step as the counter): HMAC-SHA-1, dynamic truncation, `DIGITS` digits.
pub fn hotp(key: &[u8], counter: u64, digits: u32) -> String {
    let mut m = <Hmac<Sha1> as Mac>::new_from_slice(key).expect("HMAC takes a key of any length");
    m.update(&counter.to_be_bytes());
    let h = m.finalize().into_bytes();
    let o = (h[h.len() - 1] & 0x0f) as usize;
    let n = (u32::from(h[o] & 0x7f) << 24) | (u32::from(h[o + 1]) << 16) | (u32::from(h[o + 2]) << 8) | u32::from(h[o + 3]);
    format!("{:0width$}", n % 10u32.pow(digits), width = digits as usize)
}

fn step_of(now: i64) -> i64 {
    now.div_euclid(STEP_SECS)
}

/// The time step at which `code` is right for `key`, within one step of `now`, and later than `after` (a step already used is never
/// accepted again).
fn matching_step(key: &[u8], code: &str, now: i64, after: Option<i64>) -> Option<i64> {
    if code.len() != DIGITS as usize || !code.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let mut found = None;
    // look at every step in the window, so the time taken does not say which one matched
    for step in (step_of(now) - 1)..=(step_of(now) + 1) {
        if step < 0 || after.is_some_and(|a| step <= a) {
            continue;
        }
        if secrets::same(hotp(key, step as u64, DIGITS).as_bytes(), code.as_bytes()) && found.is_none() {
            found = Some(step);
        }
    }
    found
}

/// A fresh secret: 20 random bytes (160 bits, RFC 4226's recommended length), in base32.
pub fn new_secret() -> String {
    let mut b = [0u8; 20];
    getrandom::getrandom(&mut b).expect("random bytes");
    base32_encode(&b)
}

/// What an authenticator app reads from the QR code.
pub fn otpauth_uri(secret: &str, account: &str, issuer: &str) -> String {
    let enc = |s: &str| s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect::<String>();
    format!("otpauth://totp/{}:{}?secret={secret}&issuer={}&period=30&digits=6", enc(issuer), enc(account), enc(issuer))
}

// ---------------------------------------------------------------- recovery codes

/// A recovery code as people type it: upper case, without the hyphen or spaces.
fn normalise(code: &str) -> String {
    code.chars().filter(|c| !c.is_whitespace() && *c != '-').collect::<String>().to_uppercase()
}

fn new_recovery_codes() -> Vec<String> {
    (0..RECOVERY_CODES)
        .map(|_| {
            let mut b = [0u8; 10];
            getrandom::getrandom(&mut b).expect("random bytes");
            // 256 is a multiple of 32: every letter is as likely as any other
            let s: String = b.iter().map(|x| RECOVERY_ALPHABET[(*x % 32) as usize] as char).collect();
            format!("{}-{}", &s[..5], &s[5..])
        })
        .collect()
}

fn recovery_context(user_id: i64) -> String {
    format!("recovery:{user_id}")
}
fn secret_context(user_id: i64) -> String {
    format!("totp:{user_id}")
}

/// Strapi's hash of a recovery code (lib/totp.ts hashRecoveryCode): SHA-256 hex of the code in upper case without hyphens.
fn legacy_hash(normalised: &str) -> String {
    Sha256::digest(normalised.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

// ---------------------------------------------------------------- the factor

struct Factor {
    enabled: bool,
    secret: Option<String>,
    pending_secret: Option<String>,
    pending_at: Option<i64>,
    last_step: Option<i64>,
    recovery: Vec<String>,
    legacy_recovery: Vec<String>,
    failures: i64,
    failures_since: Option<i64>,
    /// when the factor was taken away or switched off, if it was
    removed_at: Option<i64>,
}

fn load(conn: &Connection, user_id: i64) -> Result<Option<Factor>, String> {
    conn.query_row(
        "SELECT enabled, secret, pending_secret, pending_at, last_step, recovery, legacy_recovery, failures, failures_since, removed_at FROM mfa WHERE user_id=?1",
        [user_id],
        |r| {
            let list = |i: usize| -> rusqlite::Result<Vec<String>> { Ok(serde_json::from_str(&r.get::<_, String>(i)?).unwrap_or_default()) };
            Ok(Factor { enabled: r.get(0)?, secret: r.get(1)?, pending_secret: r.get(2)?, pending_at: r.get(3)?, last_step: r.get(4)?, recovery: list(5)?, legacy_recovery: list(6)?, failures: r.get(7)?, failures_since: r.get(8)?, removed_at: r.get(9)? })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Does the user have a second factor.
pub fn enrolled(conn: &Connection, user_id: i64) -> Result<bool, String> {
    Ok(load(conn, user_id)?.is_some_and(|f| f.enabled))
}

/// Until when the user's codes are locked, if they are.
fn locked_until(f: &Factor, now: i64) -> Option<i64> {
    let since = f.failures_since?;
    (f.failures >= MAX_FAILURES && now < since + FAILURE_WINDOW_SECS).then_some(since + FAILURE_WINDOW_SECS)
}

/// Until when the user's codes are locked, if they are (for the audit row that says so).
pub fn check_locked(conn: &Connection, user_id: i64, now: i64) -> Result<Option<i64>, String> {
    Ok(load(conn, user_id)?.and_then(|f| locked_until(&f, now)))
}

fn record_failure(conn: &Connection, user_id: i64, f: &Factor, now: i64) -> Result<(), String> {
    let fresh = f.failures_since.is_none_or(|s| now >= s + FAILURE_WINDOW_SECS);
    let (failures, since) = if fresh { (1, now) } else { (f.failures + 1, f.failures_since.unwrap_or(now)) };
    conn.execute("UPDATE mfa SET failures=?2, failures_since=?3, updated_at=?4 WHERE user_id=?1", params![user_id, failures, since, now]).map_err(|e| e.to_string())?;
    Ok(())
}

/// How a code was accepted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Accepted {
    Totp,
    /// a recovery code, now used up; how many are left
    Recovery { left: usize },
}

/// Check a code the user gives for their second factor: a current authenticator code, or one of their recovery codes (used up by
/// this). Wrong codes count towards the lock. The caller commits or rolls back with the rest of what the code is for, so the counter
/// and the used step are written in the caller's transaction.
pub fn check(conn: &Connection, keys: Option<&SecretKey>, user_id: i64, code: &str, now: i64) -> Result<Accepted, MfaError> {
    let f = load(conn, user_id)?.filter(|f| f.enabled).ok_or(MfaError::NotEnrolled)?;
    if let Some(until) = locked_until(&f, now) {
        return Err(MfaError::Locked { until });
    }
    let keys = keys.ok_or(MfaError::NoKey)?;
    let code = code.trim();
    if code.len() == DIGITS as usize {
        let secret = keys.open(&secret_context(user_id), f.secret.as_deref().unwrap_or("")).map_err(MfaError::Internal)?;
        let key = base32_decode(&secret).ok_or_else(|| MfaError::Internal("the stored secret is not base32".into()))?;
        if let Some(step) = matching_step(&key, code, now, f.last_step) {
            conn.execute("UPDATE mfa SET last_step=?2, failures=0, failures_since=NULL, updated_at=?3 WHERE user_id=?1", params![user_id, step, now])?;
            return Ok(Accepted::Totp);
        }
    } else {
        let n = normalise(code);
        if n.len() == 10 && n.bytes().all(|b| b.is_ascii_alphanumeric()) {
            let ctx = recovery_context(user_id);
            if let Some(i) = f.recovery.iter().position(|t| keys.recognises(&ctx, &n, t)) {
                let mut rest = f.recovery.clone();
                rest.remove(i);
                conn.execute("UPDATE mfa SET recovery=?2, failures=0, failures_since=NULL, updated_at=?3 WHERE user_id=?1", params![user_id, json!(rest).to_string(), now])?;
                return Ok(Accepted::Recovery { left: rest.len() + f.legacy_recovery.len() });
            }
            let h = legacy_hash(&n);
            if let Some(i) = f.legacy_recovery.iter().position(|x| secrets::same(x.as_bytes(), h.as_bytes())) {
                let mut rest = f.legacy_recovery.clone();
                rest.remove(i);
                conn.execute("UPDATE mfa SET legacy_recovery=?2, failures=0, failures_since=NULL, updated_at=?3 WHERE user_id=?1", params![user_id, json!(rest).to_string(), now])?;
                return Ok(Accepted::Recovery { left: f.recovery.len() + rest.len() });
            }
        }
    }
    record_failure(conn, user_id, &f, now)?;
    Err(MfaError::Invalid)
}

/// Begin enrolling a (new) authenticator: a fresh secret, kept as pending. With a factor already on, a current code is needed (a
/// session alone does not replace a security control), and the old factor keeps working until the new one is confirmed. Returns the
/// secret, the otpauth URI, and how the current code was accepted when one was needed.
pub fn start(conn: &Connection, keys: Option<&SecretKey>, user_id: i64, account: &str, current: Option<&str>, now: i64) -> Result<(String, String, Option<Accepted>), MfaError> {
    let keys = keys.ok_or(MfaError::NoKey)?;
    let f = load(conn, user_id)?;
    let mut used = None;
    if f.as_ref().is_some_and(|f| f.enabled) {
        let code = current.filter(|c| !c.trim().is_empty()).ok_or(MfaError::CodeRequired)?;
        used = Some(check(conn, Some(keys), user_id, code, now)?);
    } else if let Some(until) = f.as_ref().and_then(|f| locked_until(f, now)) {
        return Err(MfaError::Locked { until });
    }
    let secret = new_secret();
    let sealed = keys.seal(&secret_context(user_id), &secret)?;
    conn.execute(
        "INSERT INTO mfa(user_id, enabled, pending_secret, pending_at, updated_at) VALUES (?1, 0, ?2, ?3, ?3)
         ON CONFLICT(user_id) DO UPDATE SET pending_secret=?2, pending_at=?3, updated_at=?3",
        params![user_id, sealed, now],
    )?;
    Ok((secret.clone(), otpauth_uri(&secret, account, "WebX Studio"), used))
}

/// Confirm the pending authenticator with a code from it: it becomes the factor, the old one (if any) and every old recovery code
/// stop working, and eight new recovery codes are made and returned (shown once; only their tags are kept), with whether an old
/// factor was replaced.
pub fn confirm(conn: &Connection, keys: Option<&SecretKey>, user_id: i64, code: &str, now: i64) -> Result<(Vec<String>, bool), MfaError> {
    let keys = keys.ok_or(MfaError::NoKey)?;
    let f = load(conn, user_id)?.ok_or(MfaError::NotStarted)?;
    if let Some(until) = locked_until(&f, now) {
        return Err(MfaError::Locked { until });
    }
    let (Some(pending), Some(at)) = (f.pending_secret.as_deref(), f.pending_at) else { return Err(MfaError::NotStarted) };
    if now > at + PENDING_SECS {
        return Err(MfaError::NotStarted);
    }
    let secret = keys.open(&secret_context(user_id), pending).map_err(MfaError::Internal)?;
    let key = base32_decode(&secret).ok_or_else(|| MfaError::Internal("the pending secret is not base32".into()))?;
    let Some(step) = matching_step(&key, code.trim(), now, None) else {
        record_failure(conn, user_id, &f, now)?;
        return Err(MfaError::Invalid);
    };
    let codes = new_recovery_codes();
    let ctx = recovery_context(user_id);
    let tags: Vec<String> = codes.iter().map(|c| keys.tag(&ctx, &normalise(c))).collect();
    conn.execute(
        "UPDATE mfa SET enabled=1, secret=pending_secret, pending_secret=NULL, pending_at=NULL, last_step=?2, recovery=?3, legacy_recovery='[]',
           failures=0, failures_since=NULL, enabled_at=?4, source='control', removed_at=NULL, updated_at=?4 WHERE user_id=?1",
        params![user_id, step, json!(tags).to_string(), now],
    )?;
    Ok((codes, f.enabled))
}

/// Switch the second factor off, with a current code or a recovery code. Returns how the code was accepted.
pub fn disable(conn: &Connection, keys: Option<&SecretKey>, user_id: i64, code: &str, now: i64) -> Result<Accepted, MfaError> {
    let a = check(conn, keys, user_id, code, now)?;
    remove(conn, user_id, now)?;
    Ok(a)
}

/// An operator takes a person's second factor away (a lost phone, no recovery code left). Returns false when there was none.
pub fn reset(conn: &Connection, user_id: i64, now: i64) -> Result<bool, String> {
    if !enrolled(conn, user_id)? {
        return Ok(false);
    }
    remove(conn, user_id, now)?;
    Ok(true)
}

/// The factor is gone, and the row says when: a copy from Strapi (`import`) never brings back a factor that was taken away here.
fn remove(conn: &Connection, user_id: i64, now: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE mfa SET enabled=0, secret=NULL, pending_secret=NULL, pending_at=NULL, last_step=NULL, recovery='[]', legacy_recovery='[]',
           failures=0, failures_since=NULL, enabled_at=NULL, removed_at=?2, updated_at=?2 WHERE user_id=?1",
        params![user_id, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// What a person's own MFA screen shows.
pub fn status(conn: &Connection, user_id: i64, now: i64) -> Result<Value, String> {
    let f = load(conn, user_id)?;
    Ok(json!({
        "enrolled": f.as_ref().is_some_and(|f| f.enabled),
        "pendingEnrolment": f.as_ref().is_some_and(|f| f.pending_at.is_some_and(|a| now <= a + PENDING_SECS)),
        "recoveryCodesLeft": f.as_ref().filter(|f| f.enabled).map_or(0, |f| f.recovery.len() + f.legacy_recovery.len()),
        "lockedUntil": f.as_ref().and_then(|f| locked_until(f, now)),
        "removedAt": f.as_ref().and_then(|f| f.removed_at),
    }))
}

/// Copy a factor from Strapi's `mfa-enrollment` (tools/migrate-mfa.mjs): the secret as it was (so the person's authenticator goes on
/// working) and the hashes of the recovery codes they have not used. A person whose second factor control already knows anything about
/// (one set up here, a set-up started, one taken away or switched off) is left alone unless `replace`: what happened here is newer than
/// Strapi's copy, and a factor taken away for a lost phone must not come back. Returns false when it was left alone.
pub fn import(conn: &Connection, keys: Option<&SecretKey>, user_id: i64, body: &Value, replace: bool, now: i64) -> Result<bool, MfaError> {
    let keys = keys.ok_or(MfaError::NoKey)?;
    let secret = body.get("secret").and_then(Value::as_str).unwrap_or("");
    let decoded = base32_decode(secret).filter(|k| k.len() >= 10).ok_or_else(|| MfaError::Internal("secret must be base32 of at least 10 bytes".into()))?;
    let hashes: Vec<String> = match body.get("legacyRecoveryHashes") {
        None | Some(Value::Null) => vec![],
        Some(Value::Array(a)) => a.iter().map(|h| h.as_str().filter(|h| h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit())).map(str::to_lowercase).ok_or_else(|| MfaError::Internal("legacyRecoveryHashes must be SHA-256 hex".into()))).collect::<Result<_, _>>()?,
        _ => return Err(MfaError::Internal("legacyRecoveryHashes must be a list".into())),
    };
    if !replace && load(conn, user_id)?.is_some() {
        return Ok(false);
    }
    let sealed = keys.seal(&secret_context(user_id), &base32_encode(&decoded))?;
    conn.execute(
        "INSERT INTO mfa(user_id, enabled, secret, recovery, legacy_recovery, enabled_at, source, updated_at) VALUES (?1, 1, ?2, '[]', ?3, ?4, 'strapi', ?4)
         ON CONFLICT(user_id) DO UPDATE SET enabled=1, secret=?2, pending_secret=NULL, pending_at=NULL, last_step=NULL, recovery='[]', legacy_recovery=?3,
           failures=0, failures_since=NULL, enabled_at=?4, source='strapi', removed_at=NULL, updated_at=?4",
        params![user_id, sealed, json!(hashes).to_string(), now],
    )?;
    Ok(true)
}

/// Where a workspace's MFA requirement stands for someone without a second factor: None when it does not require one; otherwise
/// the deadline (seconds) and whether it has passed.
pub fn requirement(mfa_required: bool, required_at: Option<&str>, now: i64) -> Option<(i64, bool)> {
    if !mfa_required {
        return None;
    }
    let since = required_at.and_then(jobs::parse_iso).map_or(now, |ms| ms.div_euclid(1000));
    let deadline = since + GRACE_SECS;
    Some((deadline, now >= deadline))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    fn key() -> SecretKey {
        SecretKey::from_base64(&STANDARD.encode([9u8; 32])).unwrap()
    }
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE users(id INTEGER PRIMARY KEY);").unwrap();
        c.execute_batch(DDL).unwrap();
        c.execute("INSERT INTO users(id) VALUES (1), (2)", []).unwrap();
        c
    }
    const T: i64 = 1_800_000_000;
    fn code_at(secret: &str, t: i64) -> String {
        hotp(&base32_decode(secret).unwrap(), step_of(t) as u64, 6)
    }
    /// a 6-digit code that is no step's code around `t`
    fn wrong(secret: &str, t: i64) -> String {
        (0..10).map(|i| format!("00000{i}")).find(|c| (-2..=2).all(|d| code_at(secret, t + d * 30) != *c)).unwrap()
    }
    /// enrol user 1 and return the secret and recovery codes
    fn enrol(c: &Connection, k: &SecretKey) -> (String, Vec<String>) {
        let (secret, _, _) = start(c, Some(k), 1, "ann@example.org", None, T).unwrap();
        let (codes, replaced) = confirm(c, Some(k), 1, &code_at(&secret, T), T).unwrap();
        assert!(!replaced, "a first factor replaces nothing");
        (secret, codes)
    }

    #[test]
    fn rfc_6238_vectors() {
        // RFC 6238 appendix B, SHA-1, secret "12345678901234567890": 8 digits there; the last 6 are what a 6-digit app shows
        let k = b"12345678901234567890";
        for (t, want) in [(59i64, "94287082"), (1_111_111_109, "07081804"), (1_111_111_111, "14050471"), (1_234_567_890, "89005924"), (2_000_000_000, "69279037"), (20_000_000_000, "65353130")] {
            assert_eq!(hotp(k, (t / 30) as u64, 8), want, "{t}");
            assert_eq!(hotp(k, (t / 30) as u64, 6), want[2..], "{t}");
        }
    }

    #[test]
    fn base32_round_trips_and_reads_what_apps_show() {
        let b = b"12345678901234567890";
        let s = base32_encode(b);
        assert_eq!(s, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
        assert_eq!(base32_decode(&s).unwrap(), b);
        assert_eq!(base32_decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").unwrap(), b);
        assert!(base32_decode("GEZD1").is_none(), "1 is not base32");
        assert_eq!(new_secret().len(), 32);
    }

    #[test]
    fn a_code_is_accepted_one_step_either_side_and_never_twice() {
        let (c, k) = (db(), key());
        let (secret, _) = enrol(&c, &k);
        // the code confirm used is spent
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, T), T), Err(MfaError::Invalid));
        // the next step's code, early (a phone ahead by up to 30 seconds)
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, T + 30), T), Ok(Accepted::Totp));
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, T + 30), T + 1), Err(MfaError::Invalid), "replayed");
        // a code from before the last used step is refused even inside the window
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, T), T + 31), Err(MfaError::Invalid));
        // two steps away is too far
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, T + 300), T + 240), Err(MfaError::Invalid));
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, T + 90), T + 60), Ok(Accepted::Totp));
        for bad in ["", "12345", "1234567", "abcdef", " 12345 "] {
            assert_eq!(check(&c, Some(&k), 1, bad, T + 600), Err(MfaError::Invalid), "{bad:?}");
        }
    }

    #[test]
    fn eight_wrong_codes_lock_the_codes_for_ten_minutes_whoever_asks() {
        let (c, k) = (db(), key());
        let (secret, codes) = enrol(&c, &k);
        let t = T + 1000;
        for _ in 0..MAX_FAILURES {
            assert_eq!(check(&c, Some(&k), 1, &wrong(&secret, t), t), Err(MfaError::Invalid));
        }
        // the right code, and a recovery code, are refused while it lasts
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, t), t + 1), Err(MfaError::Locked { until: t + FAILURE_WINDOW_SECS }));
        assert_eq!(check(&c, Some(&k), 1, &codes[0], t + 1), Err(MfaError::Locked { until: t + FAILURE_WINDOW_SECS }));
        assert_eq!(status(&c, 1, t + 2).unwrap()["lockedUntil"], json!(t + FAILURE_WINDOW_SECS));
        // counted in the database: another connection (another replica) sees it
        assert_eq!(c.query_row("SELECT failures FROM mfa WHERE user_id=1", [], |r| r.get::<_, i64>(0)).unwrap(), MAX_FAILURES);
        // after the window, the right code works and the count starts again
        let later = t + FAILURE_WINDOW_SECS;
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, later), later), Ok(Accepted::Totp));
        assert_eq!(c.query_row("SELECT failures FROM mfa WHERE user_id=1", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        // seven, then a right one, then seven more: no lock (a success clears the count)
        for _ in 0..7 {
            let _ = check(&c, Some(&k), 1, &wrong(&secret, later + 100), later + 100);
        }
        assert_eq!(check(&c, Some(&k), 1, &codes[1], later + 100), Ok(Accepted::Recovery { left: 7 }));
        for _ in 0..7 {
            let _ = check(&c, Some(&k), 1, &wrong(&secret, later + 100), later + 100);
        }
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, later + 120), later + 120), Ok(Accepted::Totp));
    }

    #[test]
    fn recovery_codes_work_once_each_and_are_kept_only_as_tags() {
        let (c, k) = (db(), key());
        let (_, codes) = enrol(&c, &k);
        assert_eq!(codes.len(), 8);
        assert!(codes.iter().all(|x| x.len() == 11 && x.as_bytes()[5] == b'-' && x.bytes().filter(|b| *b != b'-').all(|b| RECOVERY_ALPHABET.contains(&b))));
        let stored: String = c.query_row("SELECT recovery FROM mfa WHERE user_id=1", [], |r| r.get(0)).unwrap();
        assert!(codes.iter().all(|x| !stored.contains(&x.replace('-', ""))), "no code is stored");
        // typed in lower case, without the hyphen, with spaces: the same code
        let typed = format!(" {} ", codes[2].replace('-', "").to_lowercase());
        assert_eq!(check(&c, Some(&k), 1, &typed, T + 100), Ok(Accepted::Recovery { left: 7 }));
        assert_eq!(check(&c, Some(&k), 1, &codes[2], T + 100), Err(MfaError::Invalid), "used up");
        // another user's tag does not match: tags are bound to their user
        c.execute("INSERT INTO mfa(user_id, enabled, secret, recovery, updated_at) SELECT 2, 1, secret, recovery, updated_at FROM mfa WHERE user_id=1", []).unwrap();
        assert_eq!(check(&c, Some(&k), 2, &codes[3], T + 100), Err(MfaError::Invalid));
    }

    #[test]
    fn replacing_the_factor_needs_a_code_and_keeps_the_old_one_until_the_new_one_is_confirmed() {
        let (c, k) = (db(), key());
        let (old, codes) = enrol(&c, &k);
        assert_eq!(start(&c, Some(&k), 1, "a", None, T + 60).unwrap_err(), MfaError::CodeRequired);
        assert_eq!(start(&c, Some(&k), 1, "a", Some(&wrong(&old, T + 60)), T + 60).unwrap_err(), MfaError::Invalid);
        let (new, _, _) = start(&c, Some(&k), 1, "a", Some(&code_at(&old, T + 60)), T + 60).unwrap();
        // not confirmed yet: the old authenticator still signs in, the new one does not
        assert_eq!(check(&c, Some(&k), 1, &code_at(&new, T + 90), T + 90), Err(MfaError::Invalid));
        assert_eq!(check(&c, Some(&k), 1, &code_at(&old, T + 90), T + 90), Ok(Accepted::Totp));
        let (fresh, replaced) = confirm(&c, Some(&k), 1, &code_at(&new, T + 120), T + 120).unwrap();
        assert!(replaced, "the old factor was replaced");
        assert_eq!(check(&c, Some(&k), 1, &code_at(&old, T + 150), T + 150), Err(MfaError::Invalid), "the old one is gone");
        assert_eq!(check(&c, Some(&k), 1, &codes[0], T + 150), Err(MfaError::Invalid), "and its recovery codes");
        assert_eq!(check(&c, Some(&k), 1, &fresh[0], T + 150), Ok(Accepted::Recovery { left: 7 }));
        // a recovery code can stand in for the authenticator when replacing it (a lost phone)
        assert!(start(&c, Some(&k), 1, "a", Some(&fresh[1]), T + 200).is_ok());
    }

    #[test]
    fn confirm_needs_a_recent_start_and_the_new_authenticators_code() {
        let (c, k) = (db(), key());
        assert_eq!(confirm(&c, Some(&k), 1, "123456", T).unwrap_err(), MfaError::NotStarted);
        let (secret, _, _) = start(&c, Some(&k), 1, "a", None, T).unwrap();
        assert_eq!(confirm(&c, Some(&k), 1, &wrong(&secret, T), T).unwrap_err(), MfaError::Invalid);
        assert!(!enrolled(&c, 1).unwrap());
        assert_eq!(confirm(&c, Some(&k), 1, &code_at(&secret, T + PENDING_SECS + 1), T + PENDING_SECS + 1).unwrap_err(), MfaError::NotStarted, "too late");
        assert_eq!(status(&c, 1, T + PENDING_SECS + 1).unwrap()["pendingEnrolment"], json!(false));
    }

    #[test]
    fn switching_off_needs_a_code() {
        let (c, k) = (db(), key());
        let (secret, codes) = enrol(&c, &k);
        assert_eq!(disable(&c, Some(&k), 1, &wrong(&secret, T + 60), T + 60), Err(MfaError::Invalid));
        assert!(enrolled(&c, 1).unwrap());
        assert_eq!(disable(&c, Some(&k), 1, &codes[0], T + 60).unwrap(), Accepted::Recovery { left: 7 });
        assert!(!enrolled(&c, 1).unwrap());
        assert_eq!(check(&c, Some(&k), 1, &code_at(&secret, T + 90), T + 90), Err(MfaError::NotEnrolled));
        assert_eq!(disable(&c, Some(&k), 1, "123456", T + 90), Err(MfaError::NotEnrolled));
    }

    #[test]
    fn the_secret_is_sealed_for_its_user_and_needs_the_key() {
        let (c, k) = (db(), key());
        let (secret, _) = enrol(&c, &k);
        let stored: String = c.query_row("SELECT secret FROM mfa WHERE user_id=1", [], |r| r.get(0)).unwrap();
        assert!(stored.starts_with("v1.") && !stored.contains(&secret));
        assert_eq!(check(&c, None, 1, &code_at(&secret, T + 60), T + 60), Err(MfaError::NoKey));
        // moved to another user's row it does not open
        c.execute("INSERT INTO mfa(user_id, enabled, secret, updated_at) VALUES (2, 1, ?1, 0)", [&stored]).unwrap();
        assert!(matches!(check(&c, Some(&k), 2, &code_at(&secret, T + 60), T + 60), Err(MfaError::Internal(_))));
        assert_eq!(start(&c, None, 1, "a", None, T).unwrap_err(), MfaError::NoKey);
    }

    #[test]
    fn a_factor_from_strapi_keeps_the_authenticator_and_its_unused_recovery_codes() {
        let (c, k) = (db(), key());
        let secret = "JBSWY3DPEHPK3PXP"; // what Studio's generateSecret made, as Strapi stored it
        let unused = "ABCDE-23456";
        let hash = legacy_hash(&normalise(unused));
        assert!(import(&c, Some(&k), 1, &json!({"secret": secret, "legacyRecoveryHashes": [hash.to_uppercase()]}), false, T).unwrap());
        assert_eq!(check(&c, Some(&k), 1, &code_at(secret, T), T), Ok(Accepted::Totp), "the old authenticator works");
        assert_eq!(check(&c, Some(&k), 1, "abcde23456", T), Ok(Accepted::Recovery { left: 0 }));
        assert_eq!(check(&c, Some(&k), 1, unused, T), Err(MfaError::Invalid), "once");
        // a factor already here is left alone, unless asked
        assert!(!import(&c, Some(&k), 1, &json!({"secret": "GEZDGNBVGY3TQOJQ"}), false, T).unwrap());
        assert!(import(&c, Some(&k), 1, &json!({"secret": "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"}), true, T).unwrap());
        // a new set of codes ends the old ones
        let (new, _, _) = start(&c, Some(&k), 1, "a", Some(&code_at("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", T + 60)), T + 60).unwrap();
        confirm(&c, Some(&k), 1, &code_at(&new, T + 60), T + 60).unwrap();
        assert_eq!(c.query_row("SELECT legacy_recovery, source FROM mfa WHERE user_id=1", [], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).unwrap(), ("[]".to_string(), "control".to_string()));
        for bad in [json!({"secret": "short"}), json!({"secret": "JBSWY3DPEHPK3PXP", "legacyRecoveryHashes": ["nothex"]}), json!({"secret": "1111"})] {
            assert!(import(&c, Some(&k), 2, &bad, false, T).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_factor_taken_away_here_is_not_brought_back_by_a_copy() {
        let (c, k) = (db(), key());
        let strapi = json!({"secret": "JBSWY3DPEHPK3PXP"});
        // copied, then taken away by an operator (a lost phone)
        assert!(import(&c, Some(&k), 1, &strapi, false, T).unwrap());
        assert!(reset(&c, 1, T + 10).unwrap());
        assert!(!reset(&c, 1, T + 11).unwrap(), "nothing left to take away");
        assert_eq!((enrolled(&c, 1).unwrap(), status(&c, 1, T + 12).unwrap()["removedAt"].clone()), (false, json!(T + 10)));
        // the same copy run again leaves it gone; the lost phone's codes do not work
        assert!(!import(&c, Some(&k), 1, &strapi, false, T + 20).unwrap());
        assert_eq!(check(&c, Some(&k), 1, &code_at("JBSWY3DPEHPK3PXP", T + 30), T + 30), Err(MfaError::NotEnrolled));
        // nor after the person switches their own factor off, or only started one here
        let (secret, _) = enrol_user(&c, &k, 2);
        disable(&c, Some(&k), 2, &code_at(&secret, T + 60), T + 60).unwrap();
        assert!(!import(&c, Some(&k), 2, &strapi, false, T + 70).unwrap());
        c.execute("INSERT INTO users(id) VALUES (3)", []).unwrap();
        start(&c, Some(&k), 3, "a", None, T).unwrap();
        assert!(!import(&c, Some(&k), 3, &strapi, false, T + 80).unwrap());
        // an operator who means it says so
        assert!(import(&c, Some(&k), 1, &strapi, true, T + 90).unwrap());
        assert!(enrolled(&c, 1).unwrap());
        assert_eq!(status(&c, 1, T + 91).unwrap()["removedAt"], Value::Null);
        // a factor set up again here after a removal clears it too
        let (_, _) = enrol_user(&c, &k, 2);
        assert_eq!(status(&c, 2, T + 92).unwrap()["removedAt"], Value::Null);
    }
    /// enrol `user` and return the secret and recovery codes
    fn enrol_user(c: &Connection, k: &SecretKey, user: i64) -> (String, Vec<String>) {
        let (secret, _, _) = start(c, Some(k), user, "someone", None, T).unwrap();
        let (codes, _) = confirm(c, Some(k), user, &code_at(&secret, T), T).unwrap();
        (secret, codes)
    }

    #[test]
    fn the_grace_period() {
        assert_eq!(requirement(false, Some("2026-01-01T00:00:00.000Z"), T), None);
        let since = 1_767_225_600; // 2026-01-01
        assert_eq!(requirement(true, Some("2026-01-01T00:00:00.000Z"), since + 10), Some((since + GRACE_SECS, false)));
        assert_eq!(requirement(true, Some("2026-01-01T00:00:00.000Z"), since + GRACE_SECS), Some((since + GRACE_SECS, true)));
        assert_eq!(requirement(true, None, T), Some((T + GRACE_SECS, false)), "no start recorded: it starts now");
    }

    #[test]
    fn the_otpauth_uri() {
        assert_eq!(otpauth_uri("ABC", "ann@example.org", "WebX Studio"), "otpauth://totp/WebX%20Studio:ann%40example.org?secret=ABC&issuer=WebX%20Studio&period=30&digits=6");
    }
}
