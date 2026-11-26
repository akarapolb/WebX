//! The role catalogue (docs/c4-identity-plan.md, step 3, decision D22). A member of a workspace has one of four base roles, fixed
//! here so that what each may do can be read in one place, and may also have a custom role: the workspace's own named set of
//! permissions per content type (the records collection `custom-role`), which can only take away from what the base role allows,
//! never add to it. Managing the workspace (its members and their roles, how it signs in, its security settings, the agent's
//! policy) is for an `admin` without a custom role only.
//!
//! Engines take `role` and `crole` from the acting token (steps 8 and 9) and apply this table, then the custom role. A role this
//! table does not know (written before it existed, when roles were free text) may do nothing.
use serde_json::{json, Value};

pub const BASE_ROLES: [&str; 4] = ["admin", "editor", "author", "viewer"];

/// What a base role may do, content first, then managing the workspace. `read` is every entry of the workspace, `read_own` the entries
/// the person made (Strapi's Author reads only those, and so does `author` here).
pub const ACTIONS: [&str; 12] = ["read", "read_own", "create", "update_own", "update_any", "delete_own", "delete_any", "publish", "upload_media", "manage_people", "manage_sign_in", "manage_agent"];

/// The actions that manage the workspace rather than its content: never with a custom role.
pub const MANAGEMENT: [&str; 3] = ["manage_people", "manage_sign_in", "manage_agent"];

/// What `role` may do. Empty for a role this catalogue does not know.
pub fn allowed(role: &str) -> &'static [&'static str] {
    match role {
        "admin" => &ACTIONS,
        "editor" => &["read", "create", "update_own", "update_any", "delete_own", "delete_any", "publish", "upload_media"],
        "author" => &["read_own", "create", "update_own", "delete_own", "upload_media"],
        "viewer" => &["read"],
        _ => &[],
    }
}

pub fn is_base_role(r: &str) -> bool {
    BASE_ROLES.contains(&r)
}

/// May a member with `role`, and `custom_role` if any, do `action`? A content action is the base role's; a custom role may take it
/// away again per content type, which whoever holds the content applies. A management action needs `admin` and no custom role.
pub fn may(role: &str, custom_role: Option<&str>, action: &str) -> bool {
    allowed(role).contains(&action) && !(MANAGEMENT.contains(&action) && custom_role.is_some())
}

/// A custom role's key, as Studio makes it from the role's name (`slugifyOrgKey`): lower-case letters, digits, Thai letters and
/// hyphens, at most 64 characters.
pub fn valid_custom_role_key(k: &str) -> bool {
    let n = k.chars().count();
    (1..=64).contains(&n) && k.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || ('\u{0E01}'..='\u{0E59}').contains(&c))
}

/// The table, for engines (`GET /engine/roles`).
pub fn catalogue() -> Value {
    let roles: serde_json::Map<String, Value> = BASE_ROLES.iter().map(|r| (r.to_string(), json!(allowed(r)))).collect();
    json!({"roles": roles, "actions": ACTIONS, "management": MANAGEMENT})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_matrix() {
        // every role reads (an author only what they made, as Strapi's Author); only admin manages; publishing is editor and up;
        // an author changes only their own
        let row = |r: &str| ACTIONS.iter().map(|a| if may(r, None, a) { '1' } else { '.' }).collect::<String>();
        //                          r o c u U d D p m P S A
        assert_eq!(row("admin"), "111111111111");
        assert_eq!(row("editor"), "1.1111111...");
        assert_eq!(row("author"), ".111.1..1...");
        assert_eq!(row("viewer"), "1...........");
        assert_eq!(row("Lead Editor"), "............");
        assert_eq!(row(""), "............");
    }

    #[test]
    fn a_custom_role_takes_management_away_and_adds_nothing() {
        for a in MANAGEMENT {
            assert!(may("admin", None, a));
            assert!(!may("admin", Some("reviewer"), a), "{a}");
        }
        // content is still the base role's (the custom role narrows it per content type where the content is held)
        assert!(may("admin", Some("reviewer"), "publish"));
        assert!(!may("viewer", Some("everything"), "create"));
        assert!(!may("author", Some("publisher"), "publish"));
    }

    #[test]
    fn every_action_is_named_once_and_management_is_a_subset() {
        let mut seen = std::collections::HashSet::new();
        assert!(ACTIONS.iter().all(|a| seen.insert(*a)));
        assert!(MANAGEMENT.iter().all(|m| ACTIONS.contains(m)));
        for r in BASE_ROLES {
            assert!(allowed(r).iter().all(|a| ACTIONS.contains(a)), "{r}");
            assert!(allowed(r).contains(&"read") || allowed(r).contains(&"read_own"), "{r}");
        }
    }

    #[test]
    fn base_roles_are_exact() {
        for r in BASE_ROLES {
            assert!(is_base_role(r));
        }
        for r in ["Admin", "editor ", "super_admin", "owner", "", "strapi-editor"] {
            assert!(!is_base_role(r), "{r:?}");
        }
    }

    #[test]
    fn custom_role_keys_follow_studios_slugs() {
        for k in ["reviewer", "editor-lite", "ผู้ตรวจ", "team-2", "บรรณาธิการ-ข่าว"] {
            assert!(valid_custom_role_key(k), "{k}");
        }
        for k in ["", "Reviewer", "a b", "a_b", "x/y", "a.b", &"a".repeat(65), "role\n"] {
            assert!(!valid_custom_role_key(k), "{k:?}");
        }
    }

    #[test]
    fn the_catalogue_lists_every_role() {
        let c = catalogue();
        assert_eq!(c["roles"].as_object().unwrap().len(), 4);
        assert_eq!(c["roles"]["viewer"], json!(["read"]));
        assert_eq!(c["management"], json!(MANAGEMENT));
    }
}
