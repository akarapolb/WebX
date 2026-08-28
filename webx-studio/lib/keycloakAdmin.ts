// Keycloak Admin REST API — distinct from lib/oidc.ts's login-flow concerns
// (PKCE authorization code exchange, per-tenant OIDC client). This talks to
// Keycloak's own admin API using a master-realm admin credential, used by
// governance.ts's reconcileSsoDeprovisioning() to check whether an
// SSO-provisioned account is still enabled in its tenant's realm.
import "server-only";
import { KEYCLOAK_URL, KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD } from "./config";

/** No caching — admin tokens are short-lived (~60s in Keycloak's own
 * defaults) and this only runs once per reconciliation tick (minutes
 * apart), so a fresh login per run is simpler than managing a refresh
 * cycle for a token that would be stale before the next tick anyway. */
export async function keycloakAdminToken(): Promise<string | null> {
  if (!KEYCLOAK_URL || !KEYCLOAK_ADMIN || !KEYCLOAK_ADMIN_PASSWORD) return null;
  try {
    const r = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: KEYCLOAK_ADMIN, password: KEYCLOAK_ADMIN_PASSWORD }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.access_token || null;
  } catch { return null; }
}

/** Lowercased emails of currently-enabled users in one realm. Single page
 * (up to 1000) — matches this feature's own v1, don't-over-engineer scope. */
export async function listEnabledKeycloakEmails(adminToken: string, realm: string): Promise<Set<string>> {
  const emails = new Set<string>();
  try {
    const r = await fetch(`${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(realm)}/users?enabled=true&max=1000`, {
      headers: { Authorization: "Bearer " + adminToken }, cache: "no-store",
    });
    if (!r.ok) return emails;
    const list = await r.json();
    for (const u of Array.isArray(list) ? list : []) {
      if (u?.email) emails.add(String(u.email).toLowerCase());
    }
  } catch { /* return whatever we have — caller treats an empty set from a failed fetch as "couldn't determine", not "nobody enabled" */ }
  return emails;
}

/** Extracts the realm name from a tenant's own issuerUrl (Keycloak's own URL
 * convention: .../realms/<realm>) — sso.realm exists on the type but was
 * never actually populated by the settings UI (no realm input field), so
 * this is the only reliable source. */
export function realmFromIssuerUrl(issuerUrl: string | undefined): string | null {
  if (!issuerUrl) return null;
  const m = issuerUrl.match(/\/realms\/([^/]+)/);
  return m ? m[1] : null;
}
