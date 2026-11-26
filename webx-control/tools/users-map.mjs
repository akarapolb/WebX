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
// Who manages a workspace changes (D22). Today every member without a custom role may add and remove people, change roles, the
// SSO settings, the security settings and the agent's policy. In webx-control only an `admin` without a custom role may. The
// report lists, per workspace, who keeps that and who loses it; a workspace with members and no such admin is refused unless the
// operator names one (`promote`, "tenant:email").

export const BASE_ROLES = ["admin", "editor", "author", "viewer"];
const FROM_STRAPI = { "strapi-super-admin": "admin", "strapi-editor": "editor", "strapi-author": "author" };
const RANK = { admin: 3, editor: 2, author: 1, viewer: 0 };
const lower = (s) => String(s ?? "").trim().toLowerCase();

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
  const roleKeys = new Set((opts.customRoles || []).map((r) => `${r.tenantKey}\u0000${r.roleKey}`));
  const users = [];
  const seen = new Set();
  for (const u of strapiUsers) {
    const email = lower(u.email);
    if (!email) { notes.push("a Strapi user has no e-mail: skipped"); continue; }
    if (seen.has(email)) { notes.push(`${email} is in Strapi twice: the first is used`); continue; }
    seen.add(email);
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
      if (customRole && opts.customRoles && !roleKeys.has(`${t.key}\u0000${customRole}`)) {
        notes.push(`${email} in ${t.key}: custom role "${customRole}" does not exist; it allows no content until it does (as in Studio)`);
      }
      const promoted = promote.get(t.key)?.has(email) ?? false;
      memberships.push({ tenantKey: t.key, role: promoted ? "admin" : role, customRole });
    }
    const name = [u.firstname, u.lastname].filter(Boolean).join(" ") || null;
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
    // today: every member without a custom role manages the workspace (gov:805, 818, 1870)
    const managesToday = (u) => !u.body.disabled && !m(u).customRole;
    const admins = inIt.filter(manages).map((u) => u.email);
    const losing = inIt.filter((u) => managesToday(u) && !manages(u)).map((u) => `${u.email} (${m(u).role})`);
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

/** Whether control will take this provider: https, or http on this machine only (webx-control's valid_issuer). */
export function acceptableIssuer(s) {
  try {
    const u = new URL(s);
    if (u.search || u.hash || u.username) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]" || u.hostname.endsWith(".localhost"));
  } catch { return false; }
}

/**
 * A tenant's sign-in settings as webx-control keeps them (PUT /admin/tenants/<key>/identity), always `legacy`: copying settings
 * switches nothing. The SSO provider and client come from tenant.sso, the client secret decrypted with `decrypt` (Studio's
 * WEBX_ENCRYPTION_KEY) so control can seal it under its own key; the MFA requirement from tenant.features.security.
 * @returns {body: object|null, notes: [string], blocking: [string]} body null: nothing to carry
 */
export function mapWorkspace(tenant, decrypt) {
  const notes = [];
  const blocking = [];
  const body = { mode: "legacy", allowJit: false, requireVerifiedEmail: true };
  let carried = false;
  const sso = tenant.sso || {};
  if (sso.issuerUrl) {
    if (!acceptableIssuer(sso.issuerUrl)) {
      notes.push(`${tenant.key}: SSO provider ${sso.issuerUrl} is not https (control takes http only for a provider on this machine): not copied`);
    } else {
      body.issuer = sso.issuerUrl;
      if (sso.clientId) body.clientId = sso.clientId;
      if (sso.clientSecretEnc) {
        if (!decrypt) blocking.push(`${tenant.key}: WEBX_ENCRYPTION_KEY is needed to carry the SSO client secret`);
        else {
          try { body.clientSecret = decrypt(sso.clientSecretEnc); }
          catch { blocking.push(`${tenant.key}: the SSO client secret does not decrypt (is WEBX_ENCRYPTION_KEY Studio's?)`); }
        }
      }
      carried = true;
      if (!sso.enabled) notes.push(`${tenant.key}: SSO is switched off in Studio; its settings are copied all the same`);
      notes.push(`${tenant.key}: today SSO adds anyone the provider vouches for as Editor; control will not (allowJit off): give people a membership, or allowJit with a jitRole, before the workspace switches`);
    }
  }
  const security = tenant.features?.security || {};
  if (security.mfaRequired) {
    body.mfaRequired = true;
    if (security.mfaRequiredAt && ISO.test(security.mfaRequiredAt)) body.mfaRequiredAt = security.mfaRequiredAt;
    carried = true;
  }
  return { body: carried ? body : null, notes, blocking };
}
