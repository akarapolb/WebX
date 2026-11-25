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

/** How many users to ask for at a time. Keycloak may serve fewer (a cap of its own), so a short page is NOT taken for
 * the last one: the list is read on until a page comes back empty. */
const USER_PAGE = 500;
/** A bound on that loop (at most 200 000 users here) so a server that ignores `first` cannot hold the tick forever. */
const MAX_USER_PAGES = 400;
const REQUEST_TIMEOUT_MS = 15_000;

/** Lowercased emails of every currently-enabled user in one realm, or a THROW when that cannot be known.
 *
 * The only caller deprovisions (deactivates) everyone it does not find on this list, so a list that is wrong is worse
 * than none: it used to return what it had, and a failed request, a bad answer or a realm that served no one all came
 * back as an empty set, which read as "nobody is enabled any more" and deactivated every SSO admin of the workspace.
 * It also stopped at one page of 1000, so in a larger realm everyone after them was deactivated as well. Now:
 *  - every page is read (offset by `first`, on until an empty page);
 *  - any failed request, any answer that is not a list, a page that adds no new user (the server ignoring `first`), a
 *    realm too large to read within the bound, or no enabled user with an e-mail at all, is an error, never a set.
 * A realm that really has no enabled users therefore leaves the workspace's SSO admins as they are, with an error on
 * the reconcile report for an operator, rather than switching them all off on one empty answer. */
export async function listEnabledKeycloakEmails(adminToken: string, realm: string): Promise<Set<string>> {
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(realm)}/users`;
  const emails = new Set<string>();
  const seen = new Set<string>();
  let first = 0;
  for (let page = 0; ; page++) {
    if (page >= MAX_USER_PAGES) throw new Error(`Keycloak realm ${realm}: more than ${MAX_USER_PAGES} pages of users — not guessing at the rest`);
    const r = await fetch(`${base}?enabled=true&first=${first}&max=${USER_PAGE}`, {
      headers: { Authorization: "Bearer " + adminToken }, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`Keycloak realm ${realm}: listing users failed (HTTP ${r.status})`);
    const list: unknown = await r.json();
    if (!Array.isArray(list)) throw new Error(`Keycloak realm ${realm}: the user list was not a list`);
    if (list.length === 0) break;

    let fresh = 0;
    for (const u of list) {
      const key = String(u?.id ?? u?.username ?? u?.email ?? "");
      if (!key || !seen.has(key)) { fresh++; if (key) seen.add(key); }
      if (u?.email) emails.add(String(u.email).toLowerCase());
    }
    if (fresh === 0) throw new Error(`Keycloak realm ${realm}: paging did not advance (offset ${first} served users already read)`);
    first += list.length;
  }
  if (emails.size === 0) {
    throw new Error(`Keycloak realm ${realm}: no enabled user with an e-mail came back — not treating that as "everyone was removed"`);
  }
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
