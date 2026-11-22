//! The subset of Strapi 5's REST query language that public-site uses
//! (docs/engine-contract.md, section 6). Anything else is rejected with 400,
//! so a public-site change that needs more fails loudly instead of quietly
//! getting different data.

use serde_json::{Map, Value};
use std::cmp::Ordering;

/// Strapi's rest.defaultLimit / rest.maxLimit (strapi-cms/config/api.ts).
pub const DEFAULT_LIMIT: usize = 25;
pub const MAX_LIMIT: usize = 100;

#[derive(Debug, Clone, PartialEq)]
pub enum Populate {
    /// Not populated: media, relations, components and dynamic zones are left out.
    None,
    /// `*`: every populatable attribute one level down, nothing inside them.
    Star,
    /// Named attributes, each with what to populate inside it.
    Some(Vec<(String, Populate)>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Filter {
    And(Vec<Filter>),
    Or(Vec<Filter>),
    /// A path into the entry (`slug`, or `tenant.key`) and a comparison.
    Cmp(Vec<String>, Op),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Op {
    Eq(String),
    Ne(String),
    Null(bool),
    NotNull(bool),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub tenant: Option<String>,
    pub locale: Option<String>,
    pub filters: Option<Filter>,
    pub sort: Vec<(String, bool)>, // (field, descending)
    pub page: usize,
    pub page_size: usize,
    pub fields: Option<Vec<String>>,
    pub populate: Populate,
}

// ---- query string -> nested tree (like the `qs` package Strapi uses) ----

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                let h = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                match h {
                    Some(v) => { out.push(v); i += 2; }
                    None => out.push(b'%'),
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `a[b][0][c]` -> ["a", "b", "0", "c"]
fn key_path(k: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let first_end = k.find('[').unwrap_or(k.len());
    parts.push(k[..first_end].to_string());
    let mut rest = &k[first_end..];
    while let Some(stripped) = rest.strip_prefix('[') {
        match stripped.find(']') {
            Some(end) => { parts.push(stripped[..end].to_string()); rest = &stripped[end + 1..]; }
            None => break,
        }
    }
    parts
}

fn insert(tree: &mut Map<String, Value>, path: &[String], value: String) {
    let (head, tail) = (&path[0], &path[1..]);
    if tail.is_empty() {
        // a repeated plain key (`populate=a&populate=b`) becomes a list
        match tree.get_mut(head) {
            Some(Value::Array(list)) => list.push(Value::String(value)),
            Some(old @ Value::String(_)) => { let prev = old.take(); *old = Value::Array(vec![prev, Value::String(value)]); }
            _ => { tree.insert(head.clone(), Value::String(value)); }
        }
        return;
    }
    let child = tree.entry(head.clone()).or_insert_with(|| Value::Object(Map::new()));
    if !child.is_object() { *child = Value::Object(Map::new()); }
    insert(child.as_object_mut().unwrap(), tail, value);
}

pub fn parse_tree(raw: &str) -> Map<String, Value> {
    let mut tree = Map::new();
    for pair in raw.split('&').filter(|p| !p.is_empty()) {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let path = key_path(&percent_decode(k));
        if path[0].is_empty() { continue; }
        insert(&mut tree, &path, percent_decode(v));
    }
    tree
}

/// Objects keyed "0", "1", ... (qs arrays) or lists, as an ordered list.
fn as_list(v: &Value) -> Vec<&Value> {
    match v {
        Value::Array(a) => a.iter().collect(),
        Value::Object(m) => {
            let mut items: Vec<(usize, &Value)> = m.iter().filter_map(|(k, v)| k.parse().ok().map(|i| (i, v))).collect();
            items.sort_by_key(|(i, _)| *i);
            items.into_iter().map(|(_, v)| v).collect()
        }
        other => vec![other],
    }
}

fn is_index_object(v: &Value) -> bool {
    matches!(v, Value::Object(m) if !m.is_empty() && m.keys().all(|k| k.parse::<usize>().is_ok()))
}

fn text(v: &Value) -> Result<String, String> {
    match v {
        Value::String(s) => Ok(s.clone()),
        _ => Err("expected a single value".into()),
    }
}

fn bool_text(s: &str) -> bool { matches!(s, "true" | "1") }

// ---- interpret ----

pub fn parse(raw: &str) -> Result<Query, String> {
    let tree = parse_tree(raw);
    let mut q = Query { tenant: None, locale: None, filters: None, sort: vec![], page: 1, page_size: DEFAULT_LIMIT, fields: None, populate: Populate::None };
    for (k, v) in &tree {
        match k.as_str() {
            "tenant" => q.tenant = Some(text(v)?.to_lowercase()),
            "locale" => q.locale = Some(text(v)?),
            "filters" => q.filters = Some(parse_filter_obj(v)?),
            "sort" => q.sort = parse_sort(v)?,
            "pagination" => {
                let m = v.as_object().ok_or("pagination must be an object")?;
                for (pk, pv) in m {
                    let n: usize = text(pv)?.parse().map_err(|_| format!("invalid pagination[{pk}]"))?;
                    match pk.as_str() {
                        "pageSize" => q.page_size = n.clamp(1, MAX_LIMIT),
                        "page" => q.page = n.max(1),
                        "withCount" => {}
                        _ => return Err(format!("unsupported pagination[{pk}]")),
                    }
                }
            }
            "fields" => {
                let list: Result<Vec<String>, String> = match v {
                    Value::String(s) => Ok(s.split(',').map(|x| x.trim().to_string()).collect()),
                    _ => as_list(v).into_iter().map(text).collect(),
                };
                q.fields = Some(list?);
            }
            "populate" => q.populate = parse_populate(v)?,
            other => return Err(format!("unsupported query parameter `{other}`")),
        }
    }
    Ok(q)
}

fn parse_sort(v: &Value) -> Result<Vec<(String, bool)>, String> {
    let mut out = vec![];
    let items: Vec<String> = match v {
        Value::String(s) => s.split(',').map(str::to_string).collect(),
        _ => as_list(v).into_iter().map(text).collect::<Result<_, _>>()?,
    };
    for item in items {
        let (field, dir) = item.split_once(':').unwrap_or((&item, "asc"));
        let desc = match dir.to_lowercase().as_str() { "asc" => false, "desc" => true, d => return Err(format!("unsupported sort direction `{d}`")) };
        if field.contains('.') { return Err(format!("unsupported sort on relation `{field}`")); }
        out.push((field.trim().to_string(), desc));
    }
    Ok(out)
}

fn parse_populate(v: &Value) -> Result<Populate, String> {
    match v {
        Value::String(s) if s == "*" => Ok(Populate::Star),
        Value::String(s) if s == "true" => Ok(Populate::Star),
        Value::String(s) => Ok(Populate::Some(s.split(',').map(|x| (x.trim().to_string(), Populate::None)).collect())),
        Value::Array(_) => {
            let mut names = vec![];
            for item in as_list(v) { for n in text(item)?.split(',') { names.push((n.trim().to_string(), Populate::None)); } }
            Ok(Populate::Some(names))
        }
        v if is_index_object(v) => parse_populate(&Value::Array(as_list(v).into_iter().cloned().collect())),
        Value::Object(m) => {
            let mut out = vec![];
            for (name, spec) in m {
                let inner = match spec {
                    Value::String(s) if s == "true" || s == "*" => Populate::None,
                    Value::String(s) if s == "false" => continue,
                    Value::Object(o) => {
                        let mut inner = Populate::None;
                        for (ok, ov) in o {
                            match ok.as_str() {
                                "populate" => inner = parse_populate(ov)?,
                                other => return Err(format!("unsupported populate[{name}][{other}]")),
                            }
                        }
                        inner
                    }
                    _ => return Err(format!("unsupported populate[{name}]")),
                };
                out.push((name.clone(), inner));
            }
            Ok(Populate::Some(out))
        }
        _ => Err("unsupported populate".into()),
    }
}

fn parse_filter_obj(v: &Value) -> Result<Filter, String> {
    let m = v.as_object().ok_or("filters must be an object")?;
    let mut all = vec![];
    for (k, val) in m {
        match k.as_str() {
            "$or" => all.push(Filter::Or(as_list(val).into_iter().map(parse_filter_obj).collect::<Result<_, _>>()?)),
            "$and" => all.push(Filter::And(as_list(val).into_iter().map(parse_filter_obj).collect::<Result<_, _>>()?)),
            k if k.starts_with('$') => return Err(format!("unsupported filter operator `{k}`")),
            field => all.push(parse_field_filter(vec![field.to_string()], val)?),
        }
    }
    Ok(if all.len() == 1 { all.pop().unwrap() } else { Filter::And(all) })
}

fn parse_field_filter(path: Vec<String>, v: &Value) -> Result<Filter, String> {
    match v {
        // `filters[slug]=x` is shorthand for $eq
        Value::String(s) => Ok(Filter::Cmp(path, Op::Eq(s.clone()))),
        Value::Object(m) => {
            let mut all = vec![];
            for (k, val) in m {
                let op = match k.as_str() {
                    "$eq" => Op::Eq(text(val)?),
                    "$ne" => Op::Ne(text(val)?),
                    "$null" => Op::Null(bool_text(&text(val)?)),
                    "$notNull" => Op::NotNull(bool_text(&text(val)?)),
                    k if k.starts_with('$') => return Err(format!("unsupported filter operator `{k}`")),
                    sub => {
                        let mut p = path.clone();
                        p.push(sub.to_string());
                        all.push(parse_field_filter(p, val)?);
                        continue;
                    }
                };
                all.push(Filter::Cmp(path.clone(), op));
            }
            Ok(if all.len() == 1 { all.pop().unwrap() } else { Filter::And(all) })
        }
        _ => Err("unsupported filter value".into()),
    }
}

// ---- evaluate ----

fn lookup<'a>(doc: &'a Value, path: &[String]) -> Option<&'a Value> {
    let mut cur = doc;
    for p in path {
        cur = cur.get(p)?;
        if cur.is_null() { return None; }
    }
    Some(cur)
}

fn equals(v: Option<&Value>, s: &str) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::String(x)) => x == s,
        Some(Value::Bool(b)) => *b == bool_text(s) && (s == "true" || s == "false" || s == "1" || s == "0"),
        Some(Value::Number(n)) => s.parse::<f64>().ok().zip(n.as_f64()).is_some_and(|(a, b)| a == b),
        Some(other) => other.to_string() == s,
    }
}

pub fn matches(f: &Filter, doc: &Value) -> bool {
    match f {
        Filter::And(all) => all.iter().all(|x| matches(x, doc)),
        Filter::Or(any) => any.iter().any(|x| matches(x, doc)),
        Filter::Cmp(path, op) => {
            let v = lookup(doc, path);
            match op {
                Op::Eq(s) => equals(v, s),
                Op::Ne(s) => !equals(v, s),
                Op::Null(want) => v.is_none() == *want,
                Op::NotNull(want) => v.is_some() == *want,
            }
        }
    }
}

/// SQLite's order: NULL first, then numbers, then text (byte order).
fn rank(v: Option<&Value>) -> u8 {
    match v { None | Some(Value::Null) => 0, Some(Value::Bool(_)) | Some(Value::Number(_)) => 1, _ => 2 }
}

pub fn compare(a: &Value, b: &Value, field: &str) -> Ordering {
    let (x, y) = (a.get(field), b.get(field));
    match (rank(x), rank(y)) {
        (rx, ry) if rx != ry => rx.cmp(&ry),
        (0, _) => Ordering::Equal,
        (1, _) => {
            let num = |v: &Value| match v { Value::Bool(b) => *b as i64 as f64, Value::Number(n) => n.as_f64().unwrap_or(0.0), _ => 0.0 };
            num(x.unwrap()).partial_cmp(&num(y.unwrap())).unwrap_or(Ordering::Equal)
        }
        _ => {
            let s = |v: &Value| match v { Value::String(s) => s.clone(), other => other.to_string() };
            s(x.unwrap()).cmp(&s(y.unwrap()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_page_query() {
        let q = parse("filters[slug][$eq]=about%20us&populate[blocks][populate]=*&pagination[pageSize]=1&tenant=DGAHUB&locale=en").unwrap();
        assert_eq!(q.tenant.as_deref(), Some("dgahub"));
        assert_eq!(q.page_size, 1);
        assert_eq!(q.filters, Some(Filter::Cmp(vec!["slug".into()], Op::Eq("about us".into()))));
        assert_eq!(q.populate, Populate::Some(vec![("blocks".into(), Populate::Star)]));
    }

    #[test]
    fn parses_or_filters_and_repeated_populate() {
        let q = parse("filters[$or][0][tenant][key][$eq]=x&filters[$or][1][tenant][id][$null]=true&populate=a&populate=b").unwrap();
        assert_eq!(q.filters, Some(Filter::Or(vec![
            Filter::Cmp(vec!["tenant".into(), "key".into()], Op::Eq("x".into())),
            Filter::Cmp(vec!["tenant".into(), "id".into()], Op::Null(true)),
        ])));
        assert_eq!(q.populate, Populate::Some(vec![("a".into(), Populate::None), ("b".into(), Populate::None)]));
    }

    #[test]
    fn rejects_what_it_does_not_know() {
        assert!(parse("filters[title][$containsi]=x").is_err());
        assert!(parse("status=draft").is_err());
        assert!(parse("sort=tenant.key:asc").is_err());
    }

    #[test]
    fn page_size_is_capped_like_strapi() {
        assert_eq!(parse("pagination[pageSize]=200").unwrap().page_size, MAX_LIMIT);
    }

    #[test]
    fn eq_compares_like_the_database() {
        let doc: Value = serde_json::json!({"active": true, "order": 3, "slug": "a", "tenant": null});
        assert!(matches(&parse("filters[active][$eq]=true").unwrap().filters.unwrap(), &doc));
        assert!(matches(&parse("filters[order][$eq]=3").unwrap().filters.unwrap(), &doc));
        assert!(matches(&parse("filters[tenant][id][$null]=true").unwrap().filters.unwrap(), &doc));
        assert!(!matches(&parse("filters[slug][$eq]=b").unwrap().filters.unwrap(), &doc));
    }
}
