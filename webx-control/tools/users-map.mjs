// Maps Strapi's admin users and tenants to what webx-control keeps (track C4, steps 3 and 4, decision D22): users with their
// workspaces, base role and custom role, each workspace's sign-in settings, and the report an operator reads before writing.
// Pure, so it can be tested without a Strapi or a control plane.
//
// A user's workspaces are the tenants whose adminEmails list them, which is how Studio scopes an editor today
// (resolveEffectiveTenant). Their base role there (webx-control/src/roles.rs) comes from their Strapi role: Super Admin -> admin,
// Editor -> editor, Author -> author, any other role -> viewer (reported, as it may be too little). A Strapi super admin listed
// on no tenant is unscoped in Studio, so becomes a super admin here. A custom-role assignment (tenant.customRoleAssignments,
// e-mail -> roleKey) becomes the membership's customRole. An inactive or blocked Strapi account is disabled.
//
// Who manages a workspace changes (D22). Today every member may add and remove people, create, delete and assign custom roles and
// change the SSO settings: Studio checks only that the workspace is theirs, custom role or not. Members without a custom role may
// also change the security settings and the agent's policy. In webx-control only an `admin` without a custom role may do any of it.
// The report lists, per workspace, who keeps that and who loses it; a workspace with members and no such admin is refused unless the
// operator names one (`promote`, "tenant:email").
//
// What webx-control would refuse is refused here first (`valid`), so a copy whose dry run passes does not stop half-way.

export const BASE_ROLES = ["admin", "editor", "author", "viewer"];
const FROM_STRAPI = { "strapi-super-admin": "admin", "strapi-editor": "editor", "strapi-author": "author" };
const RANK = { admin: 3, editor: 2, author: 1, viewer: 0 };
const lower = (s) => String(s ?? "").trim().toLowerCase();
const bytes = (s) => Buffer.byteLength(String(s), "utf8");

/** What webx-control accepts, as it checks it (identity.rs valid_email and valid_tenant, roles.rs valid_custom_role_key,
 *  sessions.rs valid_issuer and the client id rule). Lengths are in bytes where control counts bytes. */
export const valid = {
  tenant: (k) => typeof k === "string" && /^[a-z0-9-]{2,32}$/.test(k),
  email: (e) => {
    if (typeof e !== "string" || bytes(e) > 254 || /\s/u.test(e)) return false;
    const at = e.indexOf("@");
    if (at < 1) return false;
    const domain = e.slice(at + 1);
    return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
  },
  customRoleKey: (k) => typeof k === "string" && [...k].length >= 1 && [...k].length <= 64 && /^[a-z0-9ก-๙-]+$/u.test(k),
  issuer: (s) => {
    if (typeof s !== "string" || bytes(s) > 2048 || /[\s\p{Cc}?#@]/u.test(s)) return false;
    const i = s.indexOf("://");
    if (i < 0) return false;
    const scheme = s.slice(0, i);
    const host = s.slice(i + 3).split("/")[0];
    if (!host) return false;
    const port = /^(.*):(\d+)$/.exec(host);
    const name = port ? port[1] : host;
    if (scheme === "https") return true;
    return scheme === "http" && (name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name.endsWith(".localhost"));
  },
  clientId: (c) => typeof c === "string" && /^[\x21-\x7e]{1,255}$/.test(c),
};

/** A display name within control's 200 bytes, cut at a character, never in the middle of one. */
function fitName(name) {
  if (name === null || bytes(name) <= 200) return name;
  let out = "";
  for (const ch of name) {
    if (bytes(out + ch) > 200) break;
    out += ch;
  }
  return out;
}

/** The base role a Strapi account gets: the highest its roles map to; an unknown role is a viewer. */
export function baseRole(roles) {
  let best = null;
  for (const r of roles || []) {
    const b = FROM_STRAPI[r?.code] ?? "viewer";
    if (best === null || RANK[b] > RANK[best]) best = b;
  }
  return best ?? "viewer";
}

/**
 * @param strapiUsers Strapi's admin users ({email, firstname, lastname, isActive, blocked, roles: [{code, name}]})
 * @param tenants Strapi's tenants ({key, adminEmails, customRoleAssignments})
 * @param opts.promote ["tenant:email", ...]: members made admin of that workspace
 * @param opts.customRoles Strapi's custom roles ({tenantKey, roleKey}), to report assignments to a role that does not exist
 * @returns {users: [{email, body}], report: [{tenantKey, members, admins, losing, promoted, noAdmin}], notes: [string], blocking: [string]}
 */
export function mapUsers(strapiUsers, tenants, opts = {}) {
  const notes = [];
  const blocking = [];
  const promote = new Map(); // tenant -> Set(email)
  for (const p of opts.promote || []) {
    const [t, e] = String(p).split(":");
    if (!t || !e) { blocking.push(`--promote ${p}: write it as tenant:email`); continue; }
    if (!promote.has(t)) promote.set(t, new Set());
    promote.get(t).add(lower(e));
  }
  for (const t of tenants) {
    if (!valid.tenant(t.key)) blocking.push(`workspace key "${t.key}" is not one webx-control accepts (2 to 32 of a-z, 0-9 and -)`);
  }
  const roleKeys = new Set((opts.customRoles || []).map((r) => `${r.tenantKey}\u0000${r.roleKey}`));
  const users = [];
  const seen = new Set();
  for (const u of strapiUsers) {
    const email = lower(u.email);
    if (!email) { notes.push("a Strapi user has no e-mail: skipped"); continue; }
    if (seen.has(email)) { notes.push(`${email} is in Strapi twice: the first is used`); continue; }
    seen.add(email);
    if (!valid.email(email)) { blocking.push(`${email}: not an e-mail address webx-control accepts`); continue; }
    const codes = (u.roles || []).map((r) => r.code);
    const isSuper = codes.includes("strapi-super-admin");
    const role = baseRole(u.roles);
    for (const r of u.roles || []) {
      if (!FROM_STRAPI[r.code]) notes.push(`${email}: Strapi role "${r.name ?? r.code}" has no base role, read as viewer`);
    }
    const memberships = [];
    for (const t of tenants) {
      const listed = (Array.isArray(t.adminEmails) ? t.adminEmails : []).some((x) => lower(x) === email);
      if (!listed) continue;
      const assigned = Object.entries(t.customRoleAssignments || {}).find(([k]) => lower(k) === email)?.[1] ?? null;
      const customRole = assigned ? String(assigned) : null;
      if (customRole && !valid.customRoleKey(customRole)) blocking.push(`${email} in ${t.key}: custom role key "${customRole}" is not one webx-control accepts`);
      if (customRole && opts.customRoles && !roleKeys.has(`${t.key}\u0000${customRole}`)) {
        notes.push(`${email} in ${t.key}: custom role "${customRole}" does not exist; it allows no content until it does (as in Studio)`);
      }
      const promoted = promote.get(t.key)?.has(email) ?? false;
      memberships.push({ tenantKey: t.key, role: promoted ? "admin" : role, customRole });
    }
    const full = [u.firstname, u.lastname].filter(Boolean).join(" ") || null;
    const name = fitName(full);
    if (name !== full) notes.push(`${email}: the name is longer than webx-control keeps (200 bytes) and was cut`);
    const disabled = u.isActive === false || u.blocked === true;
    users.push({ email, body: { name, disabled, superAdmin: isSuper && memberships.length === 0, memberships } });
  }
  // the people a promotion names have to be members of that workspace
  for (const [t, emails] of promote) {
    for (const e of emails) {
      const member = users.some((u) => u.email === e && u.body.memberships.some((m) => m.tenantKey === t));
      if (!member) blocking.push(`--promote ${t}:${e}: ${e} is not a member of ${t}`);
    }
  }
  const report = [];
  for (const t of tenants) {
    const inIt = users.filter((u) => u.body.memberships.some((m) => m.tenantKey === t.key));
    if (inIt.length === 0) continue;
    const m = (u) => u.body.memberships.find((x) => x.tenantKey === t.key);
    const manages = (u) => !u.body.disabled && m(u).role === "admin" && !m(u).customRole;
    // today every member manages people, custom roles and SSO (gov: saveCustomRole, assignCustomRole, saveTenantSsoConfig,
    // auth.create and auth.remove check only the workspace); without a custom role, also security and the agent (gov:805, 818, 1870)
    const managesToday = (u) => !u.body.disabled;
    const admins = inIt.filter(manages).map((u) => u.email);
    const losing = inIt.filter((u) => managesToday(u) && !manages(u)).map((u) => `${u.email} (${m(u).role}${m(u).customRole ? " + " + m(u).customRole : ""})`);
    const promoted = [...(promote.get(t.key) || [])];
    const noAdmin = admins.length === 0;
    if (noAdmin) {
      const candidates = inIt.filter(managesToday).map((u) => u.email);
      blocking.push(`${t.key} would have no admin (one with no custom role manages people, roles, sign-in, security and the agent): name one with --promote ${t.key}:<email>${candidates.length ? ` (today's: ${candidates.join(", ")})` : ""}`);
    }
    report.push({ tenantKey: t.key, members: inIt.length, admins, losing, promoted, noAdmin });
  }
  return { users, report, notes, blocking };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * A tenant's sign-in settings as webx-control keeps them (PUT /admin/tenants/<key>/identity), always `legacy`: copying settings
 * switches nothing. The SSO provider and client come from tenant.sso, the client secret decrypted with `decrypt` (Studio's
 * WEBX_ENCRYPTION_KEY) so control can seal it under its own key; the MFA requirement from tenant.features.security.
 * @param now milliseconds (a start of the MFA requirement after it is not carried)
 * @returns {body: object|null, notes: [string], blocking: [string]} body null: nothing to carry
 */
export function mapWorkspace(tenant, decrypt, now = Date.now()) {
  const notes = [];
  const blocking = [];
  const body = { mode: "legacy", allowJit: false, requireVerifiedEmail: true };
  let carried = false;
  if (!valid.tenant(tenant.key)) {
    blocking.push(`workspace key "${tenant.key}" is not one webx-control accepts (2 to 32 of a-z, 0-9 and -)`);
    return { body: null, notes, blocking };
  }
  const sso = tenant.sso || {};
  if (sso.issuerUrl) {
    if (!valid.issuer(sso.issuerUrl)) {
      notes.push(`${tenant.key}: SSO provider "${sso.issuerUrl}" is not one webx-control accepts (https without a query, fragment, user or spaces; http only on this machine): not copied`);
    } else {
      body.issuer = sso.issuerUrl;
      if (sso.clientId) {
        if (valid.clientId(sso.clientId)) body.clientId = sso.clientId;
        else notes.push(`${tenant.key}: SSO client id is not one webx-control accepts (1 to 255 visible characters): not copied`);
      }
      if (sso.clientSecretEnc) {
        if (!decrypt) blocking.push(`${tenant.key}: WEBX_ENCRYPTION_KEY is needed to carry the SSO client secret`);
        else {
          try { body.clientSecret = decrypt(sso.clientSecretEnc); }
          catch { blocking.push(`${tenant.key}: the SSO client secret does not decrypt (is WEBX_ENCRYPTION_KEY Studio's?)`); }
        }
      }
      carried = true;
      if (!sso.enabled) notes.push(`${tenant.key}: SSO is switched off in Studio; its settings are copied all the same`);
      notes.push(`${tenant.key}: today SSO adds anyone the provider vouches for as Editor; control will not (allowJit off), and never adopts someone who already has an account elsewhere: give people a membership, or allowJit with a jitRole for new people, before the workspace switches`);
    }
  }
  const security = tenant.features?.security || {};
  if (security.mfaRequired) {
    body.mfaRequired = true;
    if (security.mfaRequiredAt && ISO.test(security.mfaRequiredAt)) {
      if (Date.parse(security.mfaRequiredAt) <= now) body.mfaRequiredAt = security.mfaRequiredAt;
      else notes.push(`${tenant.key}: the MFA requirement starts in the future in Strapi (${security.mfaRequiredAt}); in webx-control it starts when it is copied`);
    }
    carried = true;
  }
  return { body: carried ? body : null, notes, blocking };
}
