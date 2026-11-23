//! webx-read-engine: a read-only stand-in for Strapi's public REST API, for
//! public-site builds (docs/rust-engine-plan.md). It serves a snapshot written
//! by tools/export-snapshot.mjs and answers the requests listed in
//! docs/engine-contract.md, section 6. No writes, no admin, no auth.
//!
//!   webx-read-engine [--snapshot snapshot/snapshot.json | --db snapshot/engine.db] [--port 1338] [--uploads ../strapi-cms/public/uploads]
//!   webx-read-engine import [--snapshot snapshot/snapshot.json] [--db snapshot/engine.db]
//!
//! `import` writes the snapshot into the engine's own SQLite store (store.rs,
//! docs/target-architecture.md track R2); `--db` then starts the engine from
//! that store instead of the export file. Reads are identical either way.

mod query;
mod store;

use axum::{
    extract::{Path, RawQuery, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use query::{Populate, Query};
use serde_json::{json, Map, Value};
use std::sync::Arc;
use tower_http::services::ServeDir;

pub struct Snapshot {
    pub doc: Value,
    pub default_tenant: String,
    pub tenants: Vec<String>,
}

impl Snapshot {
    pub fn load(text: &str) -> Result<Self, String> {
        Self::from_doc(serde_json::from_str(text).map_err(|e| format!("snapshot: {e}"))?)
    }

    pub fn from_doc(doc: Value) -> Result<Self, String> {
        if doc.get("format") != Some(&json!(1)) { return Err("snapshot: unsupported format (expected 1)".into()); }
        let tenants: Vec<String> = doc["tenants"].as_array().map(|a| a.iter().filter_map(|t| t.as_str().map(str::to_string)).collect()).unwrap_or_default();
        let default_tenant = doc["defaultTenant"].as_str().unwrap_or("dga").to_string();
        Ok(Snapshot { doc, default_tenant, tenants })
    }

    /// Strapi's tenant middleware: ?tenant=<key> when it is a known tenant,
    /// otherwise the default ("dga").
    fn tenant(&self, asked: Option<&str>) -> String {
        match asked { Some(t) if self.tenants.iter().any(|k| k == t) => t.to_string(), _ => self.default_tenant.clone() }
    }

    fn attrs_of_type(&self, plural: &str) -> Option<&Map<String, Value>> {
        self.doc["schema"]["types"].get(plural)?.get("attrs")?.as_object()
    }

    fn attrs_of_component(&self, uid: &str) -> Option<&Map<String, Value>> {
        self.doc["schema"]["components"].get(uid)?.get("attrs")?.as_object()
    }

    fn rows(&self, plural: &str, q: &Query) -> Option<Vec<Value>> {
        let by_tenant = self.doc["data"].get(plural)?;
        let tenant = self.tenant(q.tenant.as_deref());
        let locale = q.locale.as_deref().unwrap_or("th");
        Some(by_tenant.get(&tenant).and_then(|l| l.get(locale)).and_then(Value::as_array).cloned().unwrap_or_default())
    }

    /// Keep what the request asks for: scalar fields (or only `fields`), and
    /// populatable attributes only when `populate` names them.
    fn trim(&self, entry: &Value, attrs: Option<&Map<String, Value>>, pop: &Populate, fields: Option<&[String]>) -> Value {
        let Some(obj) = entry.as_object() else { return entry.clone() };
        let empty = Map::new();
        let attrs = attrs.unwrap_or(&empty);
        let mut out = Map::new();
        for (k, v) in obj {
            match attrs.get(k) {
                Some(attr) => {
                    let inner = match pop {
                        Populate::None => continue,
                        Populate::Star => Populate::None,
                        Populate::Some(list) => match list.iter().find(|(n, _)| n == k) { Some((_, inner)) => inner.clone(), None => continue },
                    };
                    out.insert(k.clone(), self.trim_attr(v, attr, &inner));
                }
                None => {
                    if let Some(f) = fields {
                        if k != "id" && k != "documentId" && !f.iter().any(|x| x == k) { continue; }
                    }
                    out.insert(k.clone(), v.clone());
                }
            }
        }
        Value::Object(out)
    }

    fn trim_attr(&self, v: &Value, attr: &Value, inner: &Populate) -> Value {
        match attr["type"].as_str() {
            Some("component") => {
                let comp = self.attrs_of_component(attr["component"].as_str().unwrap_or(""));
                match v {
                    Value::Array(items) => Value::Array(items.iter().map(|i| self.trim(i, comp, inner, None)).collect()),
                    Value::Null => Value::Null,
                    one => self.trim(one, comp, inner, None),
                }
            }
            Some("dynamiczone") => match v {
                Value::Array(items) => Value::Array(items.iter().map(|i| {
                    let comp = self.attrs_of_component(i["__component"].as_str().unwrap_or(""));
                    self.trim(i, comp, inner, None)
                }).collect()),
                other => other.clone(),
            },
            // media and relations: exported one level deep, served as they are
            _ => v.clone(),
        }
    }
}

/// Strapi quirk, kept for byte-identical builds: in a sorted list, the sort
/// fields come first in each entry (in sort order), then the rest as usual.
fn sort_fields_first(v: Value, sort: &[&str]) -> Value {
    let Value::Object(mut m) = v else { return v };
    if sort.is_empty() { return Value::Object(m); }
    let mut out = Map::new();
    for f in sort { if let Some(x) = m.shift_remove(*f) { out.insert(f.to_string(), x); } }
    out.extend(m);
    Value::Object(out)
}

type Shared = Arc<Snapshot>;

fn error(status: StatusCode, name: &str, message: &str) -> Response {
    (status, Json(json!({"data": null, "error": {"status": status.as_u16(), "name": name, "message": message, "details": {}}}))).into_response()
}
fn not_found() -> Response { error(StatusCode::NOT_FOUND, "NotFoundError", "Not Found") }

async fn api(State(s): State<Shared>, Path(rest): Path<String>, RawQuery(raw): RawQuery) -> Response {
    let q = match query::parse(raw.as_deref().unwrap_or("")) {
        Ok(q) => q,
        Err(msg) => return error(StatusCode::BAD_REQUEST, "ValidationError", &format!("webx-read-engine: {msg}")),
    };
    let parts: Vec<&str> = rest.trim_end_matches('/').split('/').collect();
    match parts.as_slice() {
        ["tenants", "keys"] => match s.doc["special"].get("tenants/keys") { Some(v) => Json(v.clone()).into_response(), None => not_found() },
        ["tenants", "resolve"] => {
            let t = s.tenant(q.tenant.as_deref());
            match s.doc["special"]["tenants/resolve"].get(&t) { Some(v) => Json(v.clone()).into_response(), None => not_found() }
        }
        [plural] => {
            let Some(mut rows) = s.rows(plural, &q) else { return not_found() };
            if let Some(f) = &q.filters { rows.retain(|r| query::matches(f, r)); }
            if !q.sort.is_empty() {
                rows.sort_by(|a, b| {
                    for (field, desc) in &q.sort {
                        let o = query::compare(a, b, field);
                        let o = if *desc { o.reverse() } else { o };
                        if o != std::cmp::Ordering::Equal { return o; }
                    }
                    std::cmp::Ordering::Equal
                });
            }
            let total = rows.len();
            let page_count = total.div_ceil(q.page_size);
            let attrs = s.attrs_of_type(plural);
            let sort_fields: Vec<&str> = q.sort.iter().map(|(f, _)| f.as_str()).collect();
            let data: Vec<Value> = rows.iter().skip((q.page - 1) * q.page_size).take(q.page_size)
                .map(|r| sort_fields_first(s.trim(r, attrs, &q.populate, q.fields.as_deref()), &sort_fields)).collect();
            Json(json!({"data": data, "meta": {"pagination": {"page": q.page, "pageSize": q.page_size, "pageCount": page_count, "total": total}}})).into_response()
        }
        [plural, document_id] => {
            let Some(rows) = s.rows(plural, &q) else { return not_found() };
            match rows.iter().find(|r| r["documentId"].as_str() == Some(document_id)) {
                Some(r) => Json(json!({"data": s.trim(r, s.attrs_of_type(plural), &q.populate, q.fields.as_deref()), "meta": {}})).into_response(),
                None => not_found(),
            }
        }
        _ => not_found(),
    }
}

fn arg(name: &str, default: &str) -> String {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == &format!("--{name}")).and_then(|i| args.get(i + 1).cloned()).unwrap_or_else(|| default.to_string())
}

/// `webx-read-engine import`: snapshot file -> the engine's own SQLite store.
fn import_command() {
    let path = arg("snapshot", "snapshot/snapshot.json");
    let db = arg("db", "snapshot/engine.db");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {path}: {e}"));
    let snap = Snapshot::load(&text).unwrap_or_else(|e| panic!("{e}"));
    let n = store::import(&snap.doc, &db).unwrap_or_else(|e| panic!("{e}"));
    eprintln!("[webx-read-engine] imported {n} entries from {path} into {db}");
}

#[tokio::main]
async fn main() {
    if std::env::args().nth(1).as_deref() == Some("import") { import_command(); return; }
    let db = arg("db", "");
    let port: u16 = arg("port", "1338").parse().expect("--port");
    let uploads = arg("uploads", "../strapi-cms/public/uploads");
    let (snap, from) = if db.is_empty() {
        let path = arg("snapshot", "snapshot/snapshot.json");
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {path}: {e}"));
        (Snapshot::load(&text).unwrap_or_else(|e| panic!("{e}")), format!("snapshot {path}"))
    } else {
        let doc = store::load(&db).unwrap_or_else(|e| panic!("{e}"));
        (Snapshot::from_doc(doc).unwrap_or_else(|e| panic!("{e}")), format!("database {db}"))
    };
    let n: usize = snap.doc["data"].as_object().map(|m| m.len()).unwrap_or(0);
    eprintln!("[webx-read-engine] from {from}: {n} collection(s), {} tenant(s), exported {} from {}", snap.tenants.len(),
        snap.doc["exportedAt"].as_str().unwrap_or("?"), snap.doc["source"].as_str().unwrap_or("?"));

    let app = Router::new()
        .route("/_health", get(|| async { Json(json!({"ok": true, "engine": "webx-read-engine", "readOnly": true})) }))
        .route("/api/*rest", get(api))
        .nest_service("/uploads", ServeDir::new(&uploads))
        .fallback(|| async { not_found() })
        .with_state(Arc::new(snap));

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap_or_else(|e| panic!("bind :{port}: {e}"));
    eprintln!("[webx-read-engine] http://localhost:{port} (read-only; uploads from {uploads})");
    axum::serve(listener, app).with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; }).await.unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap() -> Snapshot {
        Snapshot::load(&json!({
            "format": 1, "defaultTenant": "dga", "tenants": ["dga", "hub"],
            "schema": {
                "types": {"pages": {"attrs": {"blocks": {"type": "dynamiczone"}, "cover": {"type": "media"}}}},
                "components": {"block.hero": {"attrs": {"image": {"type": "media"}, "items": {"type": "component", "component": "block.item", "repeatable": true}}}}
            },
            "special": {},
            "data": {"pages": {"hub": {"th": [
                {"id": 1, "documentId": "a", "slug": "home", "cover": {"url": "/uploads/c.png"},
                 "blocks": [{"__component": "block.hero", "id": 1, "heading": "Hi", "image": {"url": "/uploads/h.png"}, "items": [{"id": 2, "t": "x"}]}]}
            ]}}}
        }).to_string()).unwrap()
    }

    #[test]
    fn trims_to_the_requested_populate() {
        let s = snap();
        let q = query::parse("tenant=hub&populate[blocks][populate]=*").unwrap();
        let rows = s.rows("pages", &q).unwrap();
        let out = s.trim(&rows[0], s.attrs_of_type("pages"), &q.populate, None);
        assert!(out.get("cover").is_none(), "cover not asked for");
        assert_eq!(out["blocks"][0]["image"]["url"], "/uploads/h.png");
        assert_eq!(out["blocks"][0]["items"][0]["t"], "x");

        let q = query::parse("tenant=hub&fields[0]=slug").unwrap();
        let out = s.trim(&rows[0], s.attrs_of_type("pages"), &q.populate, q.fields.as_deref());
        assert_eq!(out, json!({"id": 1, "documentId": "a", "slug": "home"}));
    }

    #[test]
    fn sort_fields_come_first_like_strapi() {
        let v = sort_fields_first(json!({"id": 1, "title": "a", "order": 2}), &["order"]);
        assert_eq!(serde_json::to_string(&v).unwrap(), r#"{"order":2,"id":1,"title":"a"}"#);
    }

    #[test]
    fn unknown_tenant_falls_back_to_default() {
        let s = snap();
        assert_eq!(s.tenant(Some("nope")), "dga");
        assert!(s.rows("pages", &query::parse("tenant=nope").unwrap()).unwrap().is_empty());
    }
}
