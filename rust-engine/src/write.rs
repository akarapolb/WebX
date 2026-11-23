//! R3: the content write API (docs/engine-contract.md, section 8 for the Rust
//! engine). Drafts and published versions of entries, per tenant and locale.
//! The published version is what the read API serves; a draft is what editors
//! change. Every call is scoped to the one tenant of the bearer token.
//!
//! `Engine` is the logic, with no HTTP and no database: each operation returns
//! what to persist, which `main.rs` applies to SQLite.
use crate::Snapshot;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

pub enum Persist {
    SaveDraft { plural: String, tenant: String, locale: String, doc_id: String, data: Value },
    DeleteDraft { plural: String, tenant: String, locale: String, doc_id: String },
    /// the published rows of this (type, tenant, locale) changed: rewrite them
    Published { plural: String, tenant: String, locale: String },
}

#[derive(Debug)]
pub struct WErr {
    pub status: u16,
    pub name: &'static str,
    pub message: String,
}
fn err<T>(status: u16, name: &'static str, message: impl Into<String>) -> Result<T, WErr> {
    Err(WErr { status, name, message: message.into() })
}
fn not_found<T>() -> Result<T, WErr> {
    err(404, "NotFoundError", "Not Found")
}

pub struct Engine {
    pub snap: Snapshot,
    /// drafts[type][tenant][locale] = entries
    pub drafts: Value,
}

pub fn sha256_hex(s: &str) -> String {
    Sha256::digest(s.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn random_hex(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    getrandom::getrandom(&mut b).expect("random bytes");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// A Strapi-like document id: 24 characters of a-z0-9.
fn new_document_id() -> String {
    let mut b = [0u8; 24];
    getrandom::getrandom(&mut b).expect("random bytes");
    b.iter().map(|x| "abcdefghijklmnopqrstuvwxyz0123456789".as_bytes()[(*x as usize) % 36] as char).collect()
}

/// ISO 8601 UTC, millisecond precision, like Strapi's timestamps.
pub fn now_iso() -> String {
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

const META: [&str; 6] = ["id", "documentId", "createdAt", "updatedAt", "publishedAt", "locale"];

fn obj(v: &mut Value) -> &mut Map<String, Value> {
    if !v.is_object() {
        *v = json!({});
    }
    v.as_object_mut().unwrap()
}
fn rows_mut<'a>(root: &'a mut Value, plural: &str, tenant: &str, locale: &str) -> &'a mut Vec<Value> {
    let t = obj(root).entry(plural).or_insert_with(|| json!({}));
    let l = obj(t).entry(tenant).or_insert_with(|| json!({}));
    let r = obj(l).entry(locale).or_insert_with(|| json!([]));
    r.as_array_mut().unwrap()
}
fn rows<'a>(root: &'a Value, plural: &str, tenant: &str, locale: &str) -> &'a [Value] {
    root.get(plural)
        .and_then(|t| t.get(tenant))
        .and_then(|l| l.get(locale))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}
fn fields_of(row: &Value) -> Map<String, Value> {
    row.as_object()
        .map(|m| m.iter().filter(|(k, _)| !META.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default()
}
fn same_doc(r: &Value, doc_id: &str) -> bool {
    r["documentId"].as_str() == Some(doc_id)
}

impl Engine {
    pub fn new(snap: Snapshot) -> Self {
        Engine { snap, drafts: json!({}) }
    }

    fn known(&self, plural: &str) -> bool {
        self.snap.doc["data"].get(plural).is_some()
    }
    fn check_locale(&self, locale: &str) -> Result<(), WErr> {
        let ok = match self.snap.doc["locales"].as_array() {
            Some(a) => a.iter().any(|l| l.as_str() == Some(locale)),
            None => locale == "th" || locale == "en",
        };
        if ok { Ok(()) } else { err(400, "ValidationError", format!("unknown locale {locale}")) }
    }
    fn max_id(&self, plural: &str) -> i64 {
        let mut m = 0;
        for root in [&self.snap.doc["data"], &self.drafts] {
            if let Some(t) = root.get(plural).and_then(Value::as_object) {
                for l in t.values().filter_map(Value::as_object) {
                    for rs in l.values().filter_map(Value::as_array) {
                        for r in rs {
                            m = m.max(r["id"].as_i64().unwrap_or(0));
                        }
                    }
                }
            }
        }
        m
    }
    /// does this document exist in the tenant, in any locale, as a draft or published?
    fn exists(&self, plural: &str, tenant: &str, doc_id: &str) -> bool {
        [&self.snap.doc["data"], &self.drafts].iter().any(|root| {
            root.get(plural)
                .and_then(|t| t.get(tenant))
                .and_then(Value::as_object)
                .map(|l| l.values().filter_map(Value::as_array).any(|rs| rs.iter().any(|r| same_doc(r, doc_id))))
                .unwrap_or(false)
        })
    }
    fn draft(&self, plural: &str, tenant: &str, locale: &str, doc_id: &str) -> Option<&Value> {
        rows(&self.drafts, plural, tenant, locale).iter().find(|r| same_doc(r, doc_id))
    }
    fn published(&self, plural: &str, tenant: &str, locale: &str, doc_id: &str) -> Option<&Value> {
        rows(&self.snap.doc["data"], plural, tenant, locale).iter().find(|r| same_doc(r, doc_id))
    }

    /// The draft with its status: "draft" (never published), "published" (same
    /// fields as the published version) or "modified" (changed since).
    fn view(&self, plural: &str, tenant: &str, locale: &str, d: &Value) -> Value {
        let doc_id = d["documentId"].as_str().unwrap_or("");
        let status = match self.published(plural, tenant, locale, doc_id) {
            None => "draft",
            Some(p) if fields_of(p) == fields_of(d) => "published",
            Some(_) => "modified",
        };
        let mut v = d.clone();
        v["status"] = json!(status);
        v
    }

    fn new_row(&self, plural: &str, doc_id: &str, locale: &str, data: Map<String, Value>) -> Value {
        let now = now_iso();
        let mut row = json!({"id": self.max_id(plural) + 1, "documentId": doc_id});
        for (k, v) in data {
            row[&k] = v;
        }
        row["createdAt"] = json!(now);
        row["updatedAt"] = json!(now);
        row["publishedAt"] = Value::Null;
        row["locale"] = json!(locale);
        row
    }

    #[allow(clippy::too_many_arguments)]
    pub fn list(&self, plural: &str, tenant: &str, locale: &str, status: Option<&str>, filters: Option<&crate::query::Filter>, sort: &[(String, bool)], q: Option<&str>, page: usize, size: usize) -> Result<Value, WErr> {
        if !self.known(plural) {
            return not_found();
        }
        self.check_locale(locale)?;
        let mut all: Vec<Value> = rows(&self.drafts, plural, tenant, locale).iter().map(|d| self.view(plural, tenant, locale, d)).collect();
        if let Some(s) = status {
            all.retain(|v| v["status"] == s);
        }
        if let Some(f) = filters {
            all.retain(|r| crate::query::matches(f, r));
        }
        if let Some(q) = q.map(str::to_lowercase).filter(|q| !q.is_empty()) {
            all.retain(|r| r.as_object().is_some_and(|m| m.values().any(|v| v.as_str().is_some_and(|s| s.to_lowercase().contains(&q)))));
        }
        if !sort.is_empty() {
            all.sort_by(|a, b| {
                for (field, desc) in sort {
                    let o = crate::query::compare(a, b, field);
                    let o = if *desc { o.reverse() } else { o };
                    if o != std::cmp::Ordering::Equal {
                        return o;
                    }
                }
                std::cmp::Ordering::Equal
            });
        }
        let total = all.len();
        let data: Vec<Value> = all.into_iter().skip((page - 1) * size).take(size).collect();
        Ok(json!({"data": data, "meta": {"pagination": {"page": page, "pageSize": size, "pageCount": total.div_ceil(size), "total": total}}}))
    }

    pub fn get(&self, plural: &str, tenant: &str, locale: &str, doc_id: &str) -> Result<Value, WErr> {
        if !self.known(plural) {
            return not_found();
        }
        self.check_locale(locale)?;
        match self.draft(plural, tenant, locale, doc_id) {
            Some(d) => Ok(json!({"data": self.view(plural, tenant, locale, d), "meta": {}})),
            // a locale never written: the document exists, with no data for this locale
            None if self.exists(plural, tenant, doc_id) => Ok(json!({"data": null, "meta": {}})),
            None => not_found(),
        }
    }

    pub fn create(&mut self, plural: &str, tenant: &str, locale: &str, body: &Value) -> Result<(Value, Vec<Persist>), WErr> {
        if !self.known(plural) {
            return not_found();
        }
        self.check_locale(locale)?;
        let data = body_data(body)?;
        let doc_id = new_document_id();
        let row = self.new_row(plural, &doc_id, locale, data);
        rows_mut(&mut self.drafts, plural, tenant, locale).push(row.clone());
        let out = json!({"data": self.view(plural, tenant, locale, &row), "meta": {}});
        Ok((out, vec![Persist::SaveDraft { plural: plural.into(), tenant: tenant.into(), locale: locale.into(), doc_id, data: row }]))
    }

    /// Updates the draft; also creates a missing locale of an existing document.
    pub fn update(&mut self, plural: &str, tenant: &str, locale: &str, doc_id: &str, body: &Value) -> Result<(Value, Vec<Persist>), WErr> {
        if !self.known(plural) {
            return not_found();
        }
        self.check_locale(locale)?;
        if !self.exists(plural, tenant, doc_id) {
            return not_found();
        }
        let data = body_data(body)?;
        let row = match self.draft(plural, tenant, locale, doc_id).cloned() {
            Some(mut r) => {
                for (k, v) in data {
                    r[&k] = v;
                }
                r["updatedAt"] = json!(now_iso());
                r
            }
            None => self.new_row(plural, doc_id, locale, data),
        };
        let list = rows_mut(&mut self.drafts, plural, tenant, locale);
        match list.iter_mut().find(|r| same_doc(r, doc_id)) {
            Some(slot) => *slot = row.clone(),
            None => list.push(row.clone()),
        }
        let out = json!({"data": self.view(plural, tenant, locale, &row), "meta": {}});
        Ok((out, vec![Persist::SaveDraft { plural: plural.into(), tenant: tenant.into(), locale: locale.into(), doc_id: doc_id.into(), data: row }]))
    }

    /// Removes the document in every locale (a DELETE that names no locale, as Strapi does).
    pub fn remove_all(&mut self, plural: &str, tenant: &str, doc_id: &str) -> Result<Vec<Persist>, WErr> {
        if !self.known(plural) {
            return not_found();
        }
        if !self.exists(plural, tenant, doc_id) {
            return not_found();
        }
        let mut locales: Vec<String> = Vec::new();
        for root in [&self.snap.doc["data"], &self.drafts] {
            if let Some(l) = root.get(plural).and_then(|t| t.get(tenant)).and_then(Value::as_object) {
                for (k, rs) in l {
                    if rs.as_array().is_some_and(|a| a.iter().any(|r| same_doc(r, doc_id))) && !locales.contains(k) {
                        locales.push(k.clone());
                    }
                }
            }
        }
        let mut out = Vec::new();
        for l in locales {
            out.extend(self.remove(plural, tenant, &l, doc_id)?);
        }
        Ok(out)
    }

    /// Removes the draft and the published version of one locale.
    pub fn remove(&mut self, plural: &str, tenant: &str, locale: &str, doc_id: &str) -> Result<Vec<Persist>, WErr> {
        if !self.known(plural) {
            return not_found();
        }
        self.check_locale(locale)?;
        if self.draft(plural, tenant, locale, doc_id).is_none() && self.published(plural, tenant, locale, doc_id).is_none() {
            return not_found();
        }
        rows_mut(&mut self.drafts, plural, tenant, locale).retain(|r| !same_doc(r, doc_id));
        let mut out = vec![Persist::DeleteDraft { plural: plural.into(), tenant: tenant.into(), locale: locale.into(), doc_id: doc_id.into() }];
        let pubs = rows_mut(&mut self.snap.doc["data"], plural, tenant, locale);
        let before = pubs.len();
        pubs.retain(|r| !same_doc(r, doc_id));
        if pubs.len() != before {
            out.push(Persist::Published { plural: plural.into(), tenant: tenant.into(), locale: locale.into() });
        }
        Ok(out)
    }

    /// Copies the draft to the published version. Fails 400 when a field the
    /// type requires (`schema.types[plural].required`) is missing or empty.
    pub fn publish(&mut self, plural: &str, tenant: &str, locale: &str, doc_id: &str) -> Result<(Value, Vec<Persist>), WErr> {
        if !self.known(plural) {
            return not_found();
        }
        self.check_locale(locale)?;
        let Some(d) = self.draft(plural, tenant, locale, doc_id).cloned() else { return not_found() };
        let missing: Vec<String> = self.snap.doc["schema"]["types"][plural]["required"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .filter(|f| matches!(d.get(*f), None | Some(Value::Null)) || d[*f].as_str() == Some(""))
            .map(str::to_string)
            .collect();
        if !missing.is_empty() {
            return err(400, "ValidationError", format!("required: {}", missing.join(", ")));
        }
        let mut p = d.clone();
        p["publishedAt"] = json!(now_iso());
        let pubs = rows_mut(&mut self.snap.doc["data"], plural, tenant, locale);
        match pubs.iter_mut().find(|r| same_doc(r, doc_id)) {
            Some(slot) => {
                p["id"] = slot["id"].clone();
                p["createdAt"] = slot["createdAt"].clone();
                *slot = p;
            }
            None => pubs.push(p),
        }
        let out = json!({"data": self.view(plural, tenant, locale, &d), "meta": {}});
        Ok((out, vec![Persist::Published { plural: plural.into(), tenant: tenant.into(), locale: locale.into() }]))
    }

    /// Removes the published version and keeps the draft.
    pub fn unpublish(&mut self, plural: &str, tenant: &str, locale: &str, doc_id: &str) -> Result<(Value, Vec<Persist>), WErr> {
        if !self.known(plural) {
            return not_found();
        }
        self.check_locale(locale)?;
        let Some(d) = self.draft(plural, tenant, locale, doc_id).cloned() else { return not_found() };
        rows_mut(&mut self.snap.doc["data"], plural, tenant, locale).retain(|r| !same_doc(r, doc_id));
        let out = json!({"data": self.view(plural, tenant, locale, &d), "meta": {}});
        Ok((out, vec![Persist::Published { plural: plural.into(), tenant: tenant.into(), locale: locale.into() }]))
    }

    /// The content types, as Studio's CmsAdapter lists them.
    pub fn types(&self) -> Value {
        let types = self.snap.doc["schema"]["types"].as_object();
        let data: Vec<Value> = types.into_iter().flatten().map(|(plural, t)| {
            let uid = t["uid"].as_str().unwrap_or(plural);
            let api = uid.rsplit('.').next().unwrap_or(uid);
            json!({"uid": uid, "name": api, "api": api, "pluralName": plural, "attributes": if t["fields"].is_object() { &t["fields"] } else { &t["attrs"] }, "localized": t["i18n"] == true})
        }).collect();
        json!({"data": data})
    }

    pub fn published_rows(&self, plural: &str, tenant: &str, locale: &str) -> Vec<Value> {
        rows(&self.snap.doc["data"], plural, tenant, locale).to_vec()
    }

    pub fn load_drafts(&mut self, list: Vec<(String, String, String, Value)>) {
        for (plural, tenant, locale, row) in list {
            rows_mut(&mut self.drafts, &plural, &tenant, &locale).push(row);
        }
    }
}

fn body_data(body: &Value) -> Result<Map<String, Value>, WErr> {
    let Some(m) = body.get("data").and_then(Value::as_object) else {
        return err(400, "ValidationError", "body must be {\"data\": {...}}");
    };
    if let Some(k) = m.keys().find(|k| META.contains(&k.as_str()) || *k == "status") {
        return err(400, "ValidationError", format!("{k} is set by the engine"));
    }
    Ok(m.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> Engine {
        let doc = json!({"format": 1, "defaultTenant": "dga", "tenants": ["dga", "pea"], "locales": ["th", "en"],
            "schema": {"types": {"faqs": {"attrs": {}, "required": ["question"]}}, "components": {}},
            "special": {}, "data": {"faqs": {"dga": {"th": []}}}});
        Engine::new(Snapshot::from_doc(doc).unwrap())
    }
    fn body(q: &str) -> Value {
        json!({"data": {"question": q}})
    }
    fn id_of(v: &Value) -> String {
        v["data"]["documentId"].as_str().unwrap().to_string()
    }

    #[test]
    fn a_draft_is_not_read_until_it_is_published() {
        let mut e = engine();
        let (c, _) = e.create("faqs", "dga", "th", &body("a")).unwrap();
        let id = id_of(&c);
        assert_eq!(c["data"]["status"], "draft");
        assert!(e.published_rows("faqs", "dga", "th").is_empty());
        let (p, persist) = e.publish("faqs", "dga", "th", &id).unwrap();
        assert_eq!(p["data"]["status"], "published");
        assert!(matches!(persist[0], Persist::Published { .. }));
        let rows = e.published_rows("faqs", "dga", "th");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["question"], "a");
        assert!(rows[0]["publishedAt"].is_string());
    }

    #[test]
    fn editing_changes_only_the_draft_until_publish() {
        let mut e = engine();
        let id = id_of(&e.create("faqs", "dga", "th", &body("a")).unwrap().0);
        e.publish("faqs", "dga", "th", &id).unwrap();
        let (u, _) = e.update("faqs", "dga", "th", &id, &body("b")).unwrap();
        assert_eq!(u["data"]["status"], "modified");
        assert_eq!(e.published_rows("faqs", "dga", "th")[0]["question"], "a");
        e.publish("faqs", "dga", "th", &id).unwrap();
        assert_eq!(e.published_rows("faqs", "dga", "th")[0]["question"], "b");
        assert_eq!(e.published_rows("faqs", "dga", "th").len(), 1);
    }

    #[test]
    fn unpublish_keeps_the_draft() {
        let mut e = engine();
        let id = id_of(&e.create("faqs", "dga", "th", &body("a")).unwrap().0);
        e.publish("faqs", "dga", "th", &id).unwrap();
        let (u, _) = e.unpublish("faqs", "dga", "th", &id).unwrap();
        assert_eq!(u["data"]["status"], "draft");
        assert!(e.published_rows("faqs", "dga", "th").is_empty());
        assert!(e.get("faqs", "dga", "th", &id).unwrap()["data"].is_object());
    }

    #[test]
    fn publish_refuses_a_missing_required_field() {
        let mut e = engine();
        let id = id_of(&e.create("faqs", "dga", "th", &json!({"data": {"answer": "x"}})).unwrap().0);
        let r = e.publish("faqs", "dga", "th", &id).err().unwrap();
        assert_eq!((r.status, r.name), (400, "ValidationError"));
        assert!(e.published_rows("faqs", "dga", "th").is_empty());
    }

    #[test]
    fn a_missing_locale_resolves_empty_and_update_creates_it() {
        let mut e = engine();
        let id = id_of(&e.create("faqs", "dga", "th", &body("a")).unwrap().0);
        assert!(e.get("faqs", "dga", "en", &id).unwrap()["data"].is_null());
        e.update("faqs", "dga", "en", &id, &body("a-en")).unwrap();
        assert_eq!(e.get("faqs", "dga", "en", &id).unwrap()["data"]["question"], "a-en");
    }

    #[test]
    fn unknown_document_and_other_tenants_are_404() {
        let mut e = engine();
        let id = id_of(&e.create("faqs", "dga", "th", &body("a")).unwrap().0);
        assert_eq!(e.get("faqs", "dga", "th", "nope").err().unwrap().status, 404);
        assert_eq!(e.get("faqs", "pea", "th", &id).err().unwrap().status, 404);
        assert_eq!(e.update("faqs", "pea", "th", &id, &body("x")).err().unwrap().status, 404);
        assert_eq!(e.publish("faqs", "pea", "th", &id).err().unwrap().status, 404);
        assert_eq!(e.remove("faqs", "pea", "th", &id).err().unwrap().status, 404);
        assert_eq!(e.get("nothing", "dga", "th", &id).err().unwrap().status, 404);
    }

    #[test]
    fn remove_deletes_both_versions() {
        let mut e = engine();
        let id = id_of(&e.create("faqs", "dga", "th", &body("a")).unwrap().0);
        e.publish("faqs", "dga", "th", &id).unwrap();
        e.remove("faqs", "dga", "th", &id).unwrap();
        assert!(e.published_rows("faqs", "dga", "th").is_empty());
        assert_eq!(e.get("faqs", "dga", "th", &id).err().unwrap().status, 404);
    }

    #[test]
    fn remove_all_takes_every_locale() {
        let mut e = engine();
        let id = id_of(&e.create("faqs", "dga", "th", &body("a")).unwrap().0);
        e.update("faqs", "dga", "en", &id, &body("a-en")).unwrap();
        e.publish("faqs", "dga", "en", &id).unwrap();
        e.remove_all("faqs", "dga", &id).unwrap();
        assert!(e.published_rows("faqs", "dga", "en").is_empty());
        assert_eq!(e.get("faqs", "dga", "en", &id).err().unwrap().status, 404);
        assert_eq!(e.remove_all("faqs", "pea", &id).err().unwrap().status, 404);
    }

    #[test]
    fn list_filters_by_status_and_paginates() {
        let mut e = engine();
        for q in ["a", "b", "c"] {
            e.create("faqs", "dga", "th", &body(q)).unwrap();
        }
        let id = id_of(&e.create("faqs", "dga", "th", &body("d")).unwrap().0);
        e.publish("faqs", "dga", "th", &id).unwrap();
        assert_eq!(e.list("faqs", "dga", "th", Some("draft"), None, &[], None, 1, 25).unwrap()["meta"]["pagination"]["total"], 3);
        assert_eq!(e.list("faqs", "dga", "th", None, None, &[], None, 2, 3).unwrap()["data"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn the_body_cannot_set_engine_fields() {
        let mut e = engine();
        assert_eq!(e.create("faqs", "dga", "th", &json!({"data": {"documentId": "x"}})).err().unwrap().status, 400);
        assert_eq!(e.create("faqs", "dga", "xx", &body("a")).err().unwrap().status, 400);
        assert_eq!(e.create("faqs", "dga", "th", &json!({"question": "a"})).err().unwrap().status, 400);
    }

    #[test]
    fn time_and_hash() {
        assert!(now_iso().ends_with('Z') && now_iso().len() == 24);
        assert_eq!(sha256_hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
