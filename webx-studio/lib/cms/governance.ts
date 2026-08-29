// WebX-owned write governance — tenant cross-checks, field-level RBAC, and
// audit logging, implemented server-side against whichever CmsAdapter is
// active (Strapi today). This is the piece that used to live entirely inside
// Strapi's own strapi.documents.use() hook (strapi-cms/src/index.ts); moving
// it here means it isn't tied to a Strapi-5-only extension point.
//
// Scope (Phase 1 — see the plan for the full reasoning):
//  - list/get are a thin pass-through for Strapi: read-side tenant filtering
//    still happens in Strapi's own hook, unchanged, for both this path and
//    the public site's direct reads. Not yet decoupled there — a deliberate,
//    documented boundary, not an oversight. For WordPress (Phase 5), which
//    has no such hook of its own, list/get DO enforce tenant scoping here —
//    see WP_SCOPED below.
//  - create/update/remove/publish/unpublish are fully governed here: tenant
//    stamping + cross-tenant guard, field-RBAC stripping, and the audit-log
//    write. Strapi's own hook keeps doing the same checks independently as a
//    backstop against direct Strapi-admin-panel access; only its audit
//    WRITE is skipped for requests this module makes (see the
//    X-WebX-Governed header in ./strapi.ts and strapi-cms/src/index.ts).
//
// The cross-tenant guard specifically can't use cms.entries.get() to look up
// an existing row's owner: that call goes through the same admin session
// Strapi's own hook scopes by tenant, so a cross-tenant row is invisible to
// it (confirmed by live testing — the guard failed open and only Strapi's
// backstop caught the write). It uses a dedicated, secret-protected internal
// endpoint instead (strapi-cms/src/api/internal) that does the same direct
// DB lookup Strapi's own hook uses for this exact check, unscoped.
import "server-only";
import { strapiAdapter } from "./strapi";
import { wordpressAdapter, ensureWtenantTerm } from "./wordpress";
import { CmsError } from "./types";
import type { CmsAdapter, EntryQuery, EntryList, CurrentUser, NewUserInput, RemoveUserResult } from "./types";
import { strapiLogin, strapiRefresh, withServiceToken, sessionEngine } from "../strapi";
import { wordpressLogin } from "../wordpress";
import { requestPublicSiteRebuild, forceRebuildNow, getPublicSiteBuildStatus } from "../publicSiteBuild";
import { genTempPassword } from "./genPassword";
import { encrypt, decrypt } from "../crypto";
import {
  STRAPI_URL, STRAPI_INTERNAL_SECRET,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
  WORDPRESS_SCHEDULER_USERNAME, WORDPRESS_SCHEDULER_APP_PASSWORD,
} from "../config";
import { planLimit } from "../plans";
import { generateSecret, otpauthUri, verifyTOTP, generateRecoveryCodes, hashRecoveryCode } from "../totp";
import { keycloakAdminToken, listEnabledKeycloakEmails, realmFromIssuerUrl } from "../keycloakAdmin";

// The one swap point (Phase 2, made per-session in Phase 6): every
// `governed.*` content operation goes through whichever adapter THIS
// session's own login resolved to (see lib/strapi.ts's sessionEngine()) —
// engine is a per-tenant field now, not a deployment-wide constant, so this
// can no longer be a module-level value resolved once at import time. The
// tenant/field-policy/audit-log bookkeeping calls below are a separate,
// deliberately-always-Strapi concern (see strapiBookkeeping) — unaffected by
// this session's own engine.
async function activeAdapter(): Promise<CmsAdapter> {
  return (await sessionEngine()) === "wordpress" ? wordpressAdapter : strapiAdapter;
}

/** uid namespace tells you the engine unambiguously (api::* vs wp:*),
 * independent of this session's own resolved engine — used only by the
 * release scheduler below, which may need to publish items from either
 * engine in one pass regardless of which one (if any) authenticated the
 * caller. Every other call site keeps using activeAdapter() above, since
 * normal request handling only ever sees the logged-in session's own
 * engine's uids. */
function adapterFor(uid: string): CmsAdapter {
  return uid.startsWith("wp:") ? wordpressAdapter : strapiAdapter;
}

// Must be kept in sync with the SCOPED set in strapi-cms/src/index.ts —
// there's no shared package between the two apps to enforce this today.
const SCOPED = new Set([
  "api::home-page.home-page",
  "api::article.article", "api::service.service", "api::faq.faq", "api::job.job",
  "api::banner.banner", "api::video.video", "api::award.award",
  "api::complaint.complaint", "api::application.application", "api::registration.registration",
  "api::consent-log.consent-log",
  "api::download.download", "api::ebook.ebook", "api::gallery.gallery", "api::popup.popup", "api::poll.poll",
  "api::landing.landing",
  "api::blog.blog", "api::catalog.catalog", "api::weblink.weblink", "api::top-graphic.top-graphic",
  "api::event.event", "api::location.location", "api::sitemap-node.sitemap-node",
  "api::menu-item.menu-item", "api::contact-message.contact-message",
]);

// Phase 5 — WordPress-hosted content types that carry tenant scoping (via the
// `wtenant` taxonomy; see lib/cms/wordpress.ts). Unlike SCOPED above,
// WordPress has no pre-existing hook of its own doing any of this, so
// governance.ts enforces both read- and write-side scoping for these types
// (SCOPED's read side is still deliberately left to Strapi's own hook).
const WP_SCOPED = new Set([
  "wp:post", "wp:service", "wp:publication", "wp:faq", "wp:resource", "wp:page",
  "wp:timeline", "wp:mission", "wp:org-unit", "wp:document",
]);

const TENANT_UID = "api::tenant.tenant";
const FIELD_POLICY_UID = "api::field-policy.field-policy";
const AUDIT_UID = "api::audit-log.audit-log";
const RELEASE_UID = "api::release.release";
const MFA_ENROLLMENT_UID = "api::mfa-enrollment.mfa-enrollment";
const SSO_CREDENTIAL_UID = "api::sso-credential.sso-credential";
const CUSTOM_ROLE_UID = "api::custom-role.custom-role";
// Every uid the Users/Field Access/Audit Log/Releases pages read or write —
// always Strapi-hosted regardless of which engine THIS session authenticated
// against (Phase 5's module header). Without this, a WordPress-session admin
// hitting governed.list("api::audit-log.audit-log", ...) would route through
// the WordPress adapter (which only knows wp:post) and get a hard error —
// found live while verifying the first WordPress-engine tenant in Phase 6.
// custom-role is included so a WordPress-session admin's own custom-role
// enforcement lookups also work (custom roles are engine-agnostic).
const BOOKKEEPING_UIDS = new Set([TENANT_UID, FIELD_POLICY_UID, AUDIT_UID, RELEASE_UID, CUSTOM_ROLE_UID]);

type TenantSso = { enabled: boolean; issuerUrl?: string; clientId?: string; clientSecretEnc?: string; realm?: string };
type Tenant = { key: string; id: any; documentId?: any; name?: string; brand?: any; engine?: "strapi" | "wordpress"; adminEmails?: string[]; plan?: string; sso?: TenantSso; customRoleAssignments?: Record<string, string> };

// Tenant/field-policy/audit bookkeeping lives in Strapi regardless of which
// engine THIS session is authenticated against (see the module header), and
// regardless of whose session happens to be ambient when the call is made:
// under a Strapi-engine session the ambient token IS the calling admin's own
// valid Strapi session, but that's not true under a WordPress-engine session
// (ambient token is a WordPress Basic-auth string) or inside the release
// scheduler processing a WordPress item (ambient token is that item's
// WordPress service token — see processDueReleases below). Rather than track
// which of those contexts applies, always use the scheduler's Strapi service
// credential for these three functions' own Strapi calls, uniformly —
// bookkeeping was never meant to depend on the calling admin's own Strapi
// permissions anyway, just on Strapi being reachable. Falls back to the
// ambient session only if no service account is configured, preserving
// pre-Phase-5 Strapi-mode behavior.
async function strapiBookkeeping<T>(fn: () => Promise<T>): Promise<T> {
  const token = await schedulerStrapiToken();
  if (!token) return fn();
  return withServiceToken(token, fn);
}

let tenantCache: { at: number; byEmail: Map<string, Tenant>; byKey: Map<string, Tenant> } =
  { at: 0, byEmail: new Map(), byKey: new Map() };
async function refreshTenantCache(): Promise<typeof tenantCache> {
  const now = Date.now();
  if (now - tenantCache.at > 30_000 || tenantCache.byKey.size === 0) {
    let data: any[];
    try { ({ data } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(TENANT_UID, { pageSize: 500 }))); }
    catch { return tenantCache; }
    const byEmail = new Map<string, Tenant>();
    const byKey = new Map<string, Tenant>();
    data.forEach((t: any) => {
      const adminEmails: string[] = t.adminEmails || [];
      const tenant: Tenant = { key: t.key, id: t.id, documentId: t.documentId, name: t.name, brand: t.brand, engine: t.engine || "strapi", adminEmails, plan: t.plan, sso: t.sso, customRoleAssignments: t.customRoleAssignments };
      byKey.set(t.key, tenant);
      adminEmails.forEach((e: string) => byEmail.set(String(e).toLowerCase(), tenant));
    });
    tenantCache = { at: now, byEmail, byKey };
  }
  return tenantCache;
}
async function resolveEffectiveTenant(email?: string): Promise<Tenant | null> {
  if (!email) return null;
  const { byEmail } = await refreshTenantCache();
  return byEmail.get(email.toLowerCase()) || null;
}
/** Resolves a tenant by its own `key` (not by admin email) — used wherever a
 * caller names the WORKSPACE they're acting on directly (e.g. creating a
 * user for it) rather than being scoped to it by their own membership. */
async function resolveTenantByKey(key: string): Promise<Tenant | null> {
  const { byKey } = await refreshTenantCache();
  return byKey.get(key) || null;
}
function invalidateTenantCache(): void {
  tenantCache.at = 0;
}

/** The logged-in admin's own tenant (name/brand included) — used by
 * app/(app)/layout.tsx to show a WordPress-session admin's real org instead
 * of a generic placeholder (Phase 6; WordPress sessions have no Strapi
 * console/context endpoint of their own to ask). Null for an unscoped/super
 * admin, same as resolveEffectiveTenant. */
export async function resolveMyTenant(): Promise<Tenant | null> {
  const user = await (await activeAdapter()).auth.me();
  if (!user?.email) return null;
  return resolveEffectiveTenant(user.email);
}

/** The Status page's "Rebuild now" button — any authenticated admin can
 * force one, engine-agnostic and not tenant-scoped (a rebuild regenerates
 * the whole public site, same as an automatic publish-triggered one would).
 * Audited like every other governed write; skipped when the build didn't
 * actually start (already running — see forceRebuildNow's own reasoning),
 * so a queued-not-started click doesn't leave a misleading audit row. */
export async function rebuildPublicSiteNow(): Promise<{ started: boolean; reason?: string }> {
  const user = await requireUser();
  const result = forceRebuildNow();
  if (result.started) await writeAudit("rebuild_public_site", "public-site", null, user, null);
  return result;
}

export async function publicSiteStatus(): Promise<{ building: boolean; lastBuiltAt: string | null; lastError: string | null }> {
  await requireUser();
  return getPublicSiteBuildStatus();
}

/** Every workspace the caller can act on — unscoped/super admin sees all of
 * them, a workspace-scoped admin sees just their own. Deliberately includes
 * WordPress-engine tenants regardless of the caller's own session engine
 * (unlike the sidebar switcher's /api/console/context, which excludes them
 * because a Strapi session genuinely can't edit WordPress CONTENT through
 * activeAdapter() — see that endpoint's own comment). Users & Roles has no
 * such restriction: governed.auth.* already resolves the right engine and
 * service credential per tenant regardless of the caller's session, so this
 * is what lets the Users & Roles page reach a WordPress workspace that the
 * sidebar itself won't switch to. */
export async function listManageableTenants(): Promise<{ key: string; name?: string; engine: "strapi" | "wordpress" }[]> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  const { byKey } = await refreshTenantCache();
  const all = [...byKey.values()];
  const list = eff ? all.filter((t) => t.key === eff.key) : all;
  return list
    .map((t) => ({ key: t.key, name: t.name, engine: (t.engine || "strapi") as "strapi" | "wordpress" }))
    .sort((a, b) => (a.name || a.key).localeCompare(b.name || b.key));
}

function slugifyOrgKey(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Self-serve, fully public signup — no existing account or admin
 * intervention required (see webx-studio/app/signup). Always creates a
 * Strapi-engine, free-plan tenant: a WordPress-engine one needs a real
 * WordPress admin account provisioned by hand (see NewWorkspace.tsx's own
 * note), never something an anonymous request should trigger itself.
 *
 * The new user gets Strapi's "Editor" role, never "Super Admin" — tenant
 * scoping comes entirely from adminEmails/resolveEffectiveTenant, not from
 * the Strapi role itself, so granting Super Admin here would hand every
 * self-serve signup unscoped access to every OTHER tenant too.
 *
 * No email verification: consistent with the rest of this app (see
 * genPassword.ts / the "show once" temp-password flow) — nothing here ever
 * configures SMTP, so this doesn't invent a one-off exception to that. */
export async function selfServeSignup(input: {
  orgName: string; key?: string; firstname: string; lastname: string; email: string; password: string;
}): Promise<{ token: string; refresh: string | null }> {
  const orgName = input.orgName?.trim();
  const key = slugifyOrgKey(input.key || input.orgName || "");
  const email = input.email?.trim().toLowerCase();
  if (!orgName || !key) throw new CmsError("A workspace name is required", 400);
  if (!input.firstname?.trim()) throw new CmsError("Your name is required", 400);
  if (!email || !email.includes("@")) throw new CmsError("A valid email is required", 400);
  if (!input.password || input.password.length < 8) throw new CmsError("Password must be at least 8 characters", 400);

  if (await resolveTenantByKey(key)) throw new CmsError("That workspace name is already taken", 409);

  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("Signup is temporarily unavailable", 500);

  return withServiceToken(token, async () => {
    const roles = await strapiAdapter.auth.listRoles();
    const editorRole = roles.find((r) => r.name.toLowerCase() === "editor") ?? roles[0];
    if (!editorRole) throw new CmsError("Signup is temporarily unavailable", 500);

    let tenant: any;
    try {
      tenant = await strapiAdapter.entries.create(TENANT_UID, {
        key, name: orgName, active: true, plan: "free", seats: 3, subscriptionStatus: "active",
        adminEmails: [email], engine: "strapi",
        brand: { orgName: { th: orgName, en: orgName } },
      });
    } catch {
      throw new CmsError("That workspace name is already taken", 409);
    }

    try {
      await strapiAdapter.auth.create({
        email, firstname: input.firstname.trim(), lastname: (input.lastname || "").trim(),
        roleId: editorRole.id, password: input.password,
      });
    } catch (e) {
      // A workspace with no real admin account behind it is worse than no
      // workspace at all — don't leave the orphan around.
      await strapiAdapter.entries.remove(TENANT_UID, tenant.documentId ?? tenant.id).catch(() => {});
      throw e;
    }

    invalidateTenantCache();
    const actor: CurrentUser = { id: "signup", email, roles: [], isSuperAdmin: false };
    await writeAudit("signup", TENANT_UID, tenant.documentId ?? tenant.id, actor, key);

    const login = await strapiLogin(email, input.password);
    if (!login.ok) throw new CmsError("Account created, but automatic sign-in failed — please log in.", 500);
    return { token: login.token, refresh: login.refresh ?? null };
  });
}

// ---------- MFA (real, per-user) ----------
// Unlike strapi-cms's utils/mfa.ts + middlewares/admin-mfa.ts (a single
// shared demo secret gating only direct browser navigation to Strapi's
// native /admin UI — see lib/totp.ts's own header comment), this is wired
// into webx-studio's actual login path with a real secret per admin.

/** Throws (never returns null-for-failure) when the lookup itself couldn't
 * be performed — scheduler credential unavailable, or the Strapi call
 * erroring — so a caller can tell "genuinely not enrolled" (null result)
 * apart from "couldn't check." That distinction used to be collapsed: a
 * transient failure here (Strapi briefly down, or the same admin-login
 * rate limiter this session hit repeatedly) silently read as "not
 * enrolled," which meant isMfaEnabled() below returned false and
 * /api/auth/login let a fully MFA-enrolled admin straight in on password
 * alone, with nothing logged. */
async function findMfaRow(email: string): Promise<any | null> {
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("MFA lookup temporarily unavailable", 503);
  return withServiceToken(token, async () => {
    const { data } = await strapiAdapter.entries.list<any>(MFA_ENROLLMENT_UID, {
      filter: [{ field: "adminEmail", op: "eq", value: email.toLowerCase() }], pageSize: 1,
    });
    return data[0] ?? null;
  });
}

/** Called by the login route BEFORE issuing a session — true only for a
 * user who has completed enrollment (confirmMfaEnrollment below), so MFA is
 * opt-in per admin, not a mandatory global gate. Throws (doesn't swallow)
 * when the enrollment lookup itself fails — see findMfaRow's own comment;
 * the login route must treat that as "refuse to sign in," not "no MFA." */
export async function isMfaEnabled(email: string): Promise<boolean> {
  const row = await findMfaRow(email);
  return Boolean(row?.enabled);
}

export async function mfaEnrollmentStatus(): Promise<{ enabled: boolean }> {
  const user = await requireUser();
  if (!user.email) return { enabled: false };
  return { enabled: await isMfaEnabled(user.email) };
}

/** Compliance dashboard's "Security" dimension — real MFA adoption across a
 * workspace's admin roster (adminEmails), not a hardcoded pass. Same
 * scoping rule as every other per-tenant governed call: a workspace admin
 * can only see their own workspace's number, an unscoped admin can see any. */
export async function complianceSecuritySignal(tenantKey: string): Promise<{ totalAdmins: number; mfaEnabledCount: number; mfaAdoptionPct: number }> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  const emails = target.adminEmails || [];
  const flags = await Promise.all(emails.map((e) => isMfaEnabled(e).catch(() => false)));
  const mfaEnabledCount = flags.filter(Boolean).length;
  return { totalAdmins: emails.length, mfaEnabledCount, mfaAdoptionPct: emails.length ? Math.round((mfaEnabledCount / emails.length) * 100) : 100 };
}

// ---------- SSO (Keycloak/OIDC) ----------
// Strapi CE has no native admin SSO (see webx-studio/README.md) — a
// Keycloak-authenticated identity still needs a real Strapi admin session
// underneath. Bridged via JIT shadow-credential provisioning: the first SSO
// login for an email creates a real Strapi admin account (same auth.create()
// call as selfServeSignup) with a machine-generated password that's
// encrypted and stored here, so later SSO logins can silently re-authenticate
// to Strapi without a human ever seeing that password. SSO logins never call
// isMfaEnabled — the IdP is the trust boundary once SSO is configured.

async function findSsoCredentialRow(email: string): Promise<any | null> {
  const token = await schedulerStrapiToken();
  if (!token) return null;
  return withServiceToken(token, async () => {
    const { data } = await strapiAdapter.entries.list<any>(SSO_CREDENTIAL_UID, {
      filter: [{ field: "adminEmail", op: "eq", value: email.toLowerCase() }], pageSize: 1,
    });
    return data[0] ?? null;
  });
}

/** Settings-page read — never returns the client secret itself, only
 * whether one is on file. */
export async function getTenantSsoConfig(tenantKey: string): Promise<{ enabled: boolean; issuerUrl?: string; clientId?: string; realm?: string; hasSecret: boolean }> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  const sso = target.sso || ({} as TenantSso);
  return { enabled: Boolean(sso.enabled), issuerUrl: sso.issuerUrl, clientId: sso.clientId, realm: sso.realm, hasSecret: Boolean(sso.clientSecretEnc) };
}

/** Settings-page write. A blank clientSecret means "keep the existing
 * one" — it's never round-tripped back to the browser to be edited. */
export async function saveTenantSsoConfig(tenantKey: string, input: {
  enabled: boolean; issuerUrl?: string; clientId?: string; clientSecret?: string; realm?: string;
}): Promise<void> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  if (input.enabled) {
    if (!input.issuerUrl || !input.clientId) throw new CmsError("Issuer URL and Client ID are required to enable SSO", 400);
    try { new URL(input.issuerUrl); } catch { throw new CmsError("Issuer URL must be a valid URL", 400); }
    // JIT provisioning only knows how to bridge into a real Strapi admin
    // session (see ssoLogin) — a WordPress-engine tenant's real content
    // isn't reachable through that session at all, so enabling SSO for one
    // would silently produce a broken login rather than a working one.
    if ((target.engine || "strapi") !== "strapi") {
      throw new CmsError("SSO isn't supported yet for a WordPress-engine workspace — it currently only bridges into a Strapi admin session.", 400);
    }
  }
  const existing = target.sso || ({} as TenantSso);
  const sso: TenantSso = {
    enabled: Boolean(input.enabled),
    issuerUrl: input.issuerUrl ?? existing.issuerUrl,
    clientId: input.clientId ?? existing.clientId,
    realm: input.realm ?? existing.realm,
    clientSecretEnc: input.clientSecret ? encrypt(input.clientSecret) : existing.clientSecretEnc,
  };
  await strapiBookkeeping(() => strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { sso }));
  invalidateTenantCache();
  await writeAudit("sso_config_update", TENANT_UID, target.documentId ?? target.id, caller, tenantKey);
}

/** Server-only variant WITH the decrypted secret — only ever called from
 * the two SSO routes, never browser-reachable. */
export async function resolveSsoRuntimeConfig(tenantKey: string): Promise<{ issuerUrl: string; clientId: string; clientSecret: string } | null> {
  const target = await resolveTenantByKey(tenantKey);
  const sso = target?.sso;
  if (!sso?.enabled || !sso.issuerUrl || !sso.clientId || !sso.clientSecretEnc) return null;
  try { return { issuerUrl: sso.issuerUrl, clientId: sso.clientId, clientSecret: decrypt(sso.clientSecretEnc) }; }
  catch { return null; }
}

/** Public pre-login check the login page uses before showing an SSO button
 * — deliberately leaks nothing beyond "is SSO on" + a display label. */
export async function ssoLoginAvailable(tenantKey: string): Promise<{ enabled: boolean; label?: string }> {
  const target = await resolveTenantByKey(tenantKey);
  if (!target?.sso?.enabled) return { enabled: false };
  return { enabled: true, label: target.name };
}

/** JIT-provisioning + login orchestration — the callback route's single
 * call once the IdP has confirmed the user's email. */
export async function ssoLogin(tenantKey: string, rawEmail: string): Promise<{ token: string; refresh: string | null }> {
  const email = rawEmail.trim().toLowerCase();
  const target = await resolveTenantByKey(tenantKey);
  if (!target?.sso?.enabled) throw new CmsError("SSO is not enabled for this workspace", 403);
  // Defense in depth alongside saveTenantSsoConfig's own check — this is
  // the actual enforcement point, in case sso.enabled ever gets set some
  // other way (e.g. directly in Strapi's admin panel).
  if ((target.engine || "strapi") !== "strapi") throw new CmsError("SSO isn't supported yet for this workspace", 403);

  const schedToken = await schedulerStrapiToken();
  if (!schedToken) throw new CmsError("SSO sign-in is temporarily unavailable", 500);

  return withServiceToken(schedToken, async () => {
    let row = await findSsoCredentialRow(email);

    if (!row) {
      // First SSO login for this email — same auth.create() call, same
      // "Editor" role, same adminEmails roster update as selfServeSignup —
      // except the password is machine-generated and never shown to a
      // human; it's encrypted and stored so future SSO logins can mint a
      // fresh Strapi session without anyone typing it.
      const roles = await strapiAdapter.auth.listRoles();
      const editorRole = roles.find((r) => r.name.toLowerCase() === "editor") ?? roles[0];
      if (!editorRole) throw new CmsError("SSO sign-in is temporarily unavailable", 500);
      const tempPassword = genTempPassword();
      const created = await strapiAdapter.auth.create({
        email, firstname: email.split("@")[0] || email, lastname: "(SSO)", roleId: editorRole.id, password: tempPassword,
      });
      row = await strapiAdapter.entries.create(SSO_CREDENTIAL_UID, {
        adminEmail: email, tenantKey, passwordEnc: encrypt(tempPassword), strapiUserId: String(created.user.id),
      });
      const actor: CurrentUser = { id: "sso", email, roles: [], isSuperAdmin: false };
      await writeAudit("sso_jit_provision", TENANT_UID, target.documentId ?? target.id, actor, tenantKey);
    }

    // Roster membership is per-TARGET-tenant and must be (re-)checked on
    // every login, not just when the shadow credential is first created —
    // the same globally-shared shadow account can log into more than one
    // tenant's SSO (see the "one shadow account per email" note), and each
    // of those tenants needs this email in its OWN adminEmails, independent
    // of which tenant happened to trigger the credential's creation.
    const roster = new Set((target.adminEmails || []).map((e) => e.toLowerCase()));
    if (!roster.has(email)) {
      await strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { adminEmails: [...(target.adminEmails || []), email] });
      invalidateTenantCache();
    }

    let password: string;
    try { password = decrypt(row.passwordEnc); }
    catch { throw new CmsError("SSO credential store is corrupted — contact an administrator", 500); }

    let login = await strapiLogin(email, password);
    if (!login.ok && row.strapiUserId) {
      // Shadow password drifted from Strapi's own record (changed by hand
      // in Strapi's admin panel, or predates a WEBX_ENCRYPTION_KEY
      // rotation). This password is never used interactively by a human —
      // re-mint rather than lock the user out.
      const fresh = genTempPassword();
      const r = await fetch(STRAPI_URL + "/admin/users/" + row.strapiUserId, {
        method: "PUT", headers: { Authorization: "Bearer " + schedToken, "Content-Type": "application/json" },
        body: JSON.stringify({ password: fresh }),
      });
      if (r.ok) {
        await strapiAdapter.entries.update(SSO_CREDENTIAL_UID, row.documentId ?? row.id, { passwordEnc: encrypt(fresh) });
        login = await strapiLogin(email, fresh);
      }
    }
    if (!login.ok) throw new CmsError("SSO sign-in could not complete — contact an administrator", 500);
    return { token: login.token, refresh: login.refresh ?? null };
  });
}

/** Periodic reconciliation, triggered externally the same way
 * processDueReleases() is (see app/api/internal/sso/reconcile/route.ts +
 * the sso-reconcile-scheduler compose service) — not an in-process timer,
 * same multi-replica reasoning as the release scheduler.
 *
 * Removing someone from Keycloak does nothing to their WebX access on its
 * own — this closes that gap by deactivating (not deleting) any
 * SSO-provisioned admin who's no longer enabled in their tenant's realm,
 * and symmetrically reactivates one who reappears. Deactivate rather than
 * remove: reversible, keeps the tenant roster/audit history intact —
 * matters for something running unattended on a timer (already confirmed
 * with you, not re-litigated here).
 *
 * "SSO-provisioned admin of this tenant" is anyone in the tenant's own
 * adminEmails who ALSO has an sso-credential row — checked by the email
 * existing in that table at all, not filtered by the row's own tenantKey,
 * since the same shadow account can be SSO-assigned across more than one
 * tenant and the row only records which tenant first created it (see
 * ssoLogin's own roster-update comment). */
export async function reconcileSsoDeprovisioning(): Promise<{ tenantsChecked: number; deactivated: number; reactivated: number; errors: string[] }> {
  const summary = { tenantsChecked: 0, deactivated: 0, reactivated: 0, errors: [] as string[] };
  const schedToken = await schedulerStrapiToken();
  if (!schedToken) { summary.errors.push("Strapi service credential unavailable"); return summary; }

  return withServiceToken(schedToken, async () => {
    const { data: credRows } = await strapiAdapter.entries.list<any>(SSO_CREDENTIAL_UID, { pageSize: 500 });
    const credByEmail = new Map<string, any>(credRows.map((r: any) => [String(r.adminEmail).toLowerCase(), r]));
    if (!credByEmail.size) return summary; // nobody's ever signed in via SSO — nothing to reconcile

    const { byKey } = await refreshTenantCache();
    const ssoTenants = [...byKey.values()].filter((t) => t.sso?.enabled);

    for (const tenant of ssoTenants) {
      const realm = realmFromIssuerUrl(tenant.sso?.issuerUrl);
      if (!realm) { summary.errors.push(`${tenant.key}: no realm resolvable from issuerUrl`); continue; }
      const ssoAdmins = (tenant.adminEmails || []).filter((e) => credByEmail.has(e.toLowerCase()));
      if (!ssoAdmins.length) { summary.tenantsChecked++; continue; }

      try {
        const adminToken = await keycloakAdminToken();
        if (!adminToken) throw new Error("Keycloak admin credential unavailable/misconfigured");
        const enabledEmails = await listEnabledKeycloakEmails(adminToken, realm);

        for (const email of ssoAdmins) {
          const row = credByEmail.get(email.toLowerCase());
          if (!row?.strapiUserId) continue;
          const stillEnabled = enabledEmails.has(email.toLowerCase());
          const actor: CurrentUser = { id: "sso-reconcile", email, roles: [], isSuperAdmin: false };

          const r = await fetch(STRAPI_URL + "/admin/users/" + row.strapiUserId, { headers: { Authorization: "Bearer " + schedToken } });
          if (!r.ok) continue;
          const current = await r.json();
          const isActive = Boolean(current?.data?.isActive);

          if (!stillEnabled && isActive) {
            const upd = await fetch(STRAPI_URL + "/admin/users/" + row.strapiUserId, {
              method: "PUT", headers: { Authorization: "Bearer " + schedToken, "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: false }),
            });
            if (upd.ok) { summary.deactivated++; await writeAudit("sso_deprovisioned", TENANT_UID, tenant.documentId ?? tenant.id, actor, tenant.key); }
          } else if (stillEnabled && !isActive) {
            const upd = await fetch(STRAPI_URL + "/admin/users/" + row.strapiUserId, {
              method: "PUT", headers: { Authorization: "Bearer " + schedToken, "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: true }),
            });
            if (upd.ok) { summary.reactivated++; await writeAudit("sso_reprovisioned", TENANT_UID, tenant.documentId ?? tenant.id, actor, tenant.key); }
          }
        }
        summary.tenantsChecked++;
      } catch (e: any) {
        summary.errors.push(`${tenant.key}: ${e?.message || "reconciliation failed"}`);
      }
    }
    return summary;
  });
}

// ---------- Custom roles (WebX-owned RBAC layer) ----------
// Strapi's own admin roles are fixed and instance-global, with no tenant
// boundary, and don't exist at all for WordPress-engine tenants — so a
// tenant admin can't define their own "Content Reviewer: can edit but not
// delete or publish" role using Strapi's native role system. This is the
// same shape as field-policy above (WebX-owned, dual-enforced — governed
// here AND backstopped in strapi-cms/src/index.ts's own write hook), just
// broadened from field-only to whole-action + field permissions, and
// genuinely tenant-scoped (field-policy's role-name matching never was).

export type CustomRolePermission = {
  view?: boolean; create?: boolean; update?: boolean; delete?: boolean; publish?: boolean;
  hidden?: string[]; readonly?: string[];
};
export type CustomRoleInput = { roleKey?: string; name: string; permissions: Record<string, CustomRolePermission> };

let customRoleCache: { at: number; list: any[] } = { at: 0, list: [] };
async function getCustomRoles(): Promise<any[]> {
  const now = Date.now();
  if (now - customRoleCache.at > 15_000) {
    try {
      const { data } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(CUSTOM_ROLE_UID, { pageSize: 500 }));
      customRoleCache = { at: now, list: data };
    } catch {
      // Deliberately does NOT advance `.at` or clear `.list` on failure —
      // resolveCustomRolePermissions() treats an EMPTY list the same as
      // "no custom role assigned" (fails open, by design), so caching an
      // empty result used to mean a single transient Strapi blip silently
      // lifted every custom-role restriction in this system for the FULL
      // 15s TTL. Keeping the last-known-good list and leaving `.at` stale
      // makes the very next call retry immediately instead.
    }
  }
  return customRoleCache.list;
}
function invalidateCustomRoleCache(): void { customRoleCache.at = 0; }

export async function listCustomRoles(tenantKey: string): Promise<any[]> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  return (await getCustomRoles()).filter((r) => r.tenantKey === tenantKey);
}

/** The content types a custom role can actually govern — SCOPED for a
 * Strapi-engine tenant, WP_SCOPED for a WordPress one. Keeps the role
 * builder's permission matrix from showing checkboxes for content types
 * enforcement can never act on. */
export async function listGovernableContentTypes(tenantKey: string): Promise<{ uid: string; label: string }[]> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  const uids = target.engine === "wordpress" ? WP_SCOPED : SCOPED;
  const all = await withEngineAdapter(target.engine || "strapi", (a) => a.schema.listContentTypes());
  return all.filter((ct) => uids.has(ct.uid)).map((ct) => ({ uid: ct.uid, label: ct.name || ct.uid }));
}

export async function saveCustomRole(tenantKey: string, input: CustomRoleInput): Promise<any> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  if (!input.name?.trim()) throw new CmsError("A role name is required", 400);

  const forTenant = (await getCustomRoles()).filter((r) => r.tenantKey === tenantKey);

  if (input.roleKey) {
    const existing = forTenant.find((r) => r.roleKey === input.roleKey);
    if (!existing) throw new CmsError("Unknown role", 404);
    const result = await strapiBookkeeping(() =>
      strapiAdapter.entries.update(CUSTOM_ROLE_UID, existing.documentId ?? existing.id, { name: input.name.trim(), permissions: input.permissions || {} }));
    invalidateCustomRoleCache();
    await writeAudit("custom_role_update", CUSTOM_ROLE_UID, existing.documentId ?? existing.id, caller, tenantKey);
    return result;
  }

  const roleKey = slugifyOrgKey(input.name);
  if (!roleKey) throw new CmsError("A role name is required", 400);
  if (forTenant.some((r) => r.roleKey === roleKey)) throw new CmsError("A role with that name already exists in this workspace", 409);
  const result = await strapiBookkeeping(() =>
    strapiAdapter.entries.create(CUSTOM_ROLE_UID, { tenantKey, roleKey, name: input.name.trim(), permissions: input.permissions || {} }));
  invalidateCustomRoleCache();
  await writeAudit("custom_role_create", CUSTOM_ROLE_UID, result?.documentId ?? result?.id ?? null, caller, tenantKey);
  return result;
}

export async function deleteCustomRole(tenantKey: string, roleKey: string): Promise<void> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const existing = (await getCustomRoles()).find((r) => r.tenantKey === tenantKey && r.roleKey === roleKey);
  if (!existing) throw new CmsError("Unknown role", 404);
  await strapiBookkeeping(() => strapiAdapter.entries.remove(CUSTOM_ROLE_UID, existing.documentId ?? existing.id));
  invalidateCustomRoleCache();

  // Scrub dangling assignments so a stale roleKey doesn't quietly become a
  // deny-all for whoever still points at it — resolveCustomRolePermissions
  // fails open (falls back to pre-custom-role behavior) when the assigned
  // role no longer exists, but cleaning up here keeps that a rare/transient
  // state rather than the steady state.
  const target = await resolveTenantByKey(tenantKey);
  if (target) {
    const assignments = { ...(target.customRoleAssignments || {}) };
    const touched = Object.entries(assignments).filter(([, rk]) => rk === roleKey);
    if (touched.length) {
      touched.forEach(([email]) => delete assignments[email]);
      await strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { customRoleAssignments: assignments });
      invalidateTenantCache();
    }
  }
  await writeAudit("custom_role_delete", CUSTOM_ROLE_UID, existing.documentId ?? existing.id, caller, tenantKey);
}

/** null = unassign. */
export async function assignCustomRole(tenantKey: string, email: string, roleKey: string | null): Promise<void> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  const map = { ...(target.customRoleAssignments || {}) };
  const key = email.toLowerCase();
  if (roleKey) map[key] = roleKey; else delete map[key];
  await strapiBookkeeping(() => strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { customRoleAssignments: map }));
  invalidateTenantCache();
  await writeAudit(roleKey ? "custom_role_assign" : "custom_role_unassign", TENANT_UID, target.documentId ?? target.id, caller, tenantKey);
}

type ResolvedCustomRolePerms = {
  view: boolean; create: boolean; update: boolean; delete: boolean; publish: boolean; hidden: string[]; readonly: string[];
};

/** null = no custom role in play — caller falls back to today's unchanged
 * Strapi-role + field-policy behavior. Bypassed for a super admin, for
 * anyone with no resolved tenant, and for any uid outside SCOPED/WP_SCOPED —
 * a custom role only ever governs tenant-owned content. */
async function resolveCustomRolePermissions(user: CurrentUser, eff: Tenant | null, uid: string): Promise<ResolvedCustomRolePerms | null> {
  if (!eff || !user.email || user.isSuperAdmin) return null;
  if (!SCOPED.has(uid) && !WP_SCOPED.has(uid)) return null;
  const roleKey = (eff.customRoleAssignments || {})[user.email.toLowerCase()];
  if (!roleKey) return null;
  const role = (await getCustomRoles()).find((r) => r.tenantKey === eff.key && r.roleKey === roleKey);
  if (!role) return null; // assigned role since deleted — fail open, see deleteCustomRole's own cleanup above
  const perm: CustomRolePermission = (role.permissions || {})[uid] || {};
  return {
    view: Boolean(perm.view), create: Boolean(perm.create), update: Boolean(perm.update),
    delete: Boolean(perm.delete), publish: Boolean(perm.publish),
    hidden: Array.isArray(perm.hidden) ? perm.hidden : [],
    readonly: Array.isArray(perm.readonly) ? perm.readonly : [],
  };
}

/** Sibling to stripPolicyFields below, not merged into it — stripPolicyFields
 * has no tenant concept (matches by Strapi role name only, instance-wide)
 * and stays untouched; the two compose at each call site, giving a free
 * most-restrictive-wins union (a field hidden by either stays hidden). */
function stripCustomRoleFields(crp: ResolvedCustomRolePerms | null, data: Record<string, any>): Record<string, any> {
  if (!crp || !data || typeof data !== "object") return data;
  const forbidden = new Set<string>([...crp.hidden, ...crp.readonly]);
  if (!forbidden.size) return data;
  const out: Record<string, any> = {};
  for (const k of Object.keys(data)) if (!forbidden.has(k)) out[k] = data[k];
  return out;
}

/** Step 1 — requires an already-authenticated session (you enroll MFA on
 * your OWN account, not anyone else's). Generates a fresh secret and stores
 * it un-enabled; nothing about how this user logs in changes until
 * confirmMfaEnrollment verifies a real code from it. Re-enrolling
 * overwrites any previous unconfirmed secret. */
export async function startMfaEnrollment(): Promise<{ secret: string; otpauthUri: string }> {
  const user = await requireUser();
  if (!user.email) throw new CmsError("Unauthenticated", 401);
  const secret = generateSecret();
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("MFA enrollment is temporarily unavailable", 500);
  await withServiceToken(token, async () => {
    const existing = await findMfaRow(user.email!);
    const data = { adminEmail: user.email!.toLowerCase(), secret, enabled: false, recoveryCodesHash: null, recoveryCodesUsed: [] };
    if (existing) await strapiAdapter.entries.update(MFA_ENROLLMENT_UID, existing.documentId ?? existing.id, data);
    else await strapiAdapter.entries.create(MFA_ENROLLMENT_UID, data);
  });
  return { secret, otpauthUri: otpauthUri(secret, user.email) };
}

/** Step 2 — verifies a real code from the authenticator app against the
 * pending secret, and only THEN flips enabled:true. Recovery codes are
 * generated at this exact moment (not at startMfaEnrollment) so a
 * half-finished enrollment never has live, unused recovery codes sitting
 * around. Returns the plaintext codes once — same "show once" convention as
 * genPassword.ts's temp passwords; only their hashes are ever stored. */
export async function confirmMfaEnrollment(code: string): Promise<{ recoveryCodes: string[] }> {
  const user = await requireUser();
  if (!user.email) throw new CmsError("Unauthenticated", 401);
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("MFA enrollment is temporarily unavailable", 500);
  return withServiceToken(token, async () => {
    const row = await findMfaRow(user.email!);
    if (!row?.secret) throw new CmsError("Start enrollment first", 400);
    if (!verifyTOTP(row.secret, code)) throw new CmsError("Incorrect code — check your authenticator app and try again", 400);
    const recoveryCodes = generateRecoveryCodes();
    await strapiAdapter.entries.update(MFA_ENROLLMENT_UID, row.documentId ?? row.id, {
      enabled: true, recoveryCodesHash: recoveryCodes.map(hashRecoveryCode), recoveryCodesUsed: [],
    });
    await writeAudit("mfa_enable", MFA_ENROLLMENT_UID, row.documentId ?? row.id, user, null);
    return { recoveryCodes };
  });
}

/** Turns MFA back off for the CALLER's own account — requires their current
 * password as re-proof of identity; an already-open session alone isn't
 * enough to disable a security control on itself. */
export async function disableMfa(password: string): Promise<void> {
  const user = await requireUser();
  if (!user.email) throw new CmsError("Unauthenticated", 401);
  const check = await strapiLogin(user.email, password);
  if (!check.ok) throw new CmsError("Incorrect password", 401);
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("MFA is temporarily unavailable", 500);
  await withServiceToken(token, async () => {
    const row = await findMfaRow(user.email!);
    if (row) await strapiAdapter.entries.remove(MFA_ENROLLMENT_UID, row.documentId ?? row.id);
  });
  await writeAudit("mfa_disable", MFA_ENROLLMENT_UID, null, user, null);
}

// A brute-force TOTP code has only 1,000,000 possibilities and nothing else
// protects this path — webx-studio has no rate limiter of its own, and
// Strapi's only guards its native /admin/login, which this never calls
// (the password step already happened, this only checks the second
// factor). A simple in-memory per-email counter on a rolling window, same
// modest scope as strapi-cms's own middlewares/rate-limit.ts.
const mfaAttempts = new Map<string, { count: number; windowStart: number }>();
const MFA_MAX_ATTEMPTS = 8;
const MFA_WINDOW_MS = 10 * 60_000;
function assertMfaRateLimitOk(email: string): void {
  const rec = mfaAttempts.get(email);
  if (rec && Date.now() - rec.windowStart <= MFA_WINDOW_MS && rec.count >= MFA_MAX_ATTEMPTS) {
    throw new CmsError("Too many attempts — try again later", 429);
  }
}
function recordMfaFailure(email: string): void {
  const now = Date.now();
  const rec = mfaAttempts.get(email);
  if (!rec || now - rec.windowStart > MFA_WINDOW_MS) mfaAttempts.set(email, { count: 1, windowStart: now });
  else rec.count++;
}

/** Verifies a login-time MFA code (TOTP or a recovery code) for `email` —
 * called by /api/auth/mfa/verify-login after the password step already
 * succeeded. Recovery codes are single-use: a match gets recorded in
 * recoveryCodesUsed so it can never be replayed. */
export async function verifyLoginMfaCode(email: string, code: string): Promise<boolean> {
  const key = email.toLowerCase();
  assertMfaRateLimitOk(key);
  const row = await findMfaRow(email);
  if (!row?.enabled || !row.secret) { recordMfaFailure(key); return false; }
  if (verifyTOTP(row.secret, code)) { mfaAttempts.delete(key); return true; }

  const hash = hashRecoveryCode(code);
  const hashes: string[] = row.recoveryCodesHash || [];
  const used: string[] = row.recoveryCodesUsed || [];
  if (hashes.includes(hash) && !used.includes(hash)) {
    const token = await schedulerStrapiToken();
    if (token) {
      await withServiceToken(token, () =>
        strapiAdapter.entries.update(MFA_ENROLLMENT_UID, row.documentId ?? row.id, { recoveryCodesUsed: [...used, hash] })
      );
    }
    mfaAttempts.delete(key);
    return true;
  }
  recordMfaFailure(key);
  return false;
}

// ---------- API tokens (external integrators) ----------
// Wraps Strapi's own native admin::api-token — real token generation,
// hashed storage, and per-content-type-action permission scoping already
// exist there (the same mechanism mcp-webx/cli-webx already use — see
// docs/TECHNICAL.md's "least-privilege Strapi API token" note); this isn't
// a new token system, just the UI webx-studio never had for it (the
// "API & Tokens" nav page was a literal Stub placeholder before this).
//
// Deliberately unscoped-admin-only: Strapi's own permission model scopes a
// token by content-type + action, not by TENANT — a token would read every
// tenant's articles, not just one, regardless of who created it. Letting
// every workspace's own admin mint their own globally-reaching tokens would
// be a real cross-tenant gap, so only an unscoped caller can create or
// revoke one; resolveEffectiveTenant's existing null-vs-tenant distinction
// is what's already used for this same judgment call everywhere else.

export type ApiTokenSummary = {
  id: number; name: string; description?: string;
  type: "read-only" | "full-access" | "custom";
  lifespan: number | null; expiresAt: string | null; lastUsedAt: string | null; createdAt: string;
};

async function requireUnscoped(): Promise<CurrentUser> {
  const user = await requireUser();
  const eff = await resolveEffectiveTenant(user.email);
  if (eff) throw new CmsError("Only an unscoped administrator can manage API tokens — they aren't tenant-scoped, so a single workspace admin minting one would reach every OTHER workspace's content too.", 403);
  return user;
}

export async function listApiTokens(): Promise<ApiTokenSummary[]> {
  await requireUnscoped();
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("Temporarily unavailable", 500);
  return withServiceToken(token, async () => {
    const r = await fetch(STRAPI_URL + "/admin/api-tokens", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    if (!r.ok) throw new CmsError("Could not list tokens", r.status);
    const j = await r.json();
    return (j?.data || []).map((t: any) => ({
      id: t.id, name: t.name, description: t.description, type: t.type,
      lifespan: t.lifespan, expiresAt: t.expiresAt, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt,
    }));
  });
}

/** The full catalog of content-type actions a "custom" token can be scoped
 * to — straight passthrough of Strapi's own content-api permissions list,
 * the same data its native admin panel's own custom-token picker uses. */
export async function listApiTokenPermissionCatalog(): Promise<Record<string, { controllers: Record<string, string[]> }>> {
  await requireUnscoped();
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("Temporarily unavailable", 500);
  return withServiceToken(token, async () => {
    const r = await fetch(STRAPI_URL + "/admin/content-api/permissions", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    if (!r.ok) throw new CmsError("Could not load the permission catalog", r.status);
    const j = await r.json();
    return j?.data || {};
  });
}

export async function createApiToken(input: {
  name: string; description?: string; type: "read-only" | "full-access" | "custom";
  lifespan?: number | null; permissions?: string[];
}): Promise<{ token: ApiTokenSummary; accessKey: string }> {
  const user = await requireUnscoped();
  if (!input.name?.trim()) throw new CmsError("A name is required", 400);
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("Temporarily unavailable", 500);
  return withServiceToken(token, async () => {
    const r = await fetch(STRAPI_URL + "/admin/api-tokens", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name.trim(), description: input.description || "", type: input.type,
        lifespan: input.lifespan ?? null,
        permissions: input.type === "custom" ? (input.permissions || []) : null,
      }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      throw new CmsError(body?.error?.message || "Could not create the token", r.status);
    }
    const j = await r.json();
    const t = j.data;
    await writeAudit("create_api_token", "admin::api-token", t.id, user, null);
    return {
      token: { id: t.id, name: t.name, description: t.description, type: t.type, lifespan: t.lifespan, expiresAt: t.expiresAt, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt },
      accessKey: t.accessKey,
    };
  });
}

export async function deleteApiToken(id: number): Promise<void> {
  const user = await requireUnscoped();
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("Temporarily unavailable", 500);
  await withServiceToken(token, async () => {
    const r = await fetch(STRAPI_URL + "/admin/api-tokens/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new CmsError("Could not delete the token", r.status);
  });
  await writeAudit("delete_api_token", "admin::api-token", id, user, null);
}

let policyCache: { at: number; list: any[] } = { at: 0, list: [] };
async function getFieldPolicies(): Promise<any[]> {
  const now = Date.now();
  if (now - policyCache.at > 15_000) {
    try {
      const { data } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(FIELD_POLICY_UID, { pageSize: 500 }));
      policyCache = { at: now, list: data };
    } catch {
      // See getCustomRoles()'s own comment just above — same fix, same
      // reasoning: an empty policy list reads as "nothing hidden/readonly"
      // (stripPolicyFields' own fail-open), so a transient error used to
      // lift every field-visibility restriction for the full TTL instead
      // of just retrying on the next call.
    }
  }
  return policyCache.list;
}

async function stripPolicyFields(user: CurrentUser, uid: string, data: Record<string, any>): Promise<Record<string, any>> {
  if (!data || typeof data !== "object") return data;
  if (user.isSuperAdmin) return data;
  const policies = await getFieldPolicies();
  if (!policies.length) return data;
  const forbidden = new Set<string>();
  for (const p of policies) {
    if (p.contentType === uid && user.roles.includes(p.role)) {
      (Array.isArray(p.hidden) ? p.hidden : []).forEach((f: string) => forbidden.add(f));
      (Array.isArray(p.readonly) ? p.readonly : []).forEach((f: string) => forbidden.add(f));
    }
  }
  if (!forbidden.size) return data;
  const out: Record<string, any> = {};
  for (const k of Object.keys(data)) if (!forbidden.has(k)) out[k] = data[k];
  return out;
}

// Unscoped lookup — see the module header for why this can't use
// cms.entries.get(). Fail-open if the secret isn't configured or the lookup
// errors: matches the original hook's own fail-open-when-unknown behavior,
// and Strapi's hook still backstops the write either way.
async function trueOwnerOf(uid: string, id: string): Promise<string | null> {
  if (!STRAPI_INTERNAL_SECRET) return null;
  try {
    const r = await fetch(
      STRAPI_URL + "/api/internal/tenant-of?uid=" + encodeURIComponent(uid) + "&id=" + encodeURIComponent(id),
      { headers: { "X-Internal-Secret": STRAPI_INTERNAL_SECRET }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.tenant?.key ?? null;
  } catch { return null; }
}

async function tenantGuard(uid: string, id: string, eff: Tenant | null, adapter: CmsAdapter): Promise<void> {
  if (!eff) return;
  if (uid.startsWith("wp:")) {
    // No internal-endpoint workaround needed here (contrast trueOwnerOf
    // above): WordPress has no competing scoping hook of its own hiding
    // cross-tenant rows from an authenticated read, so the plain adapter
    // call already sees the entry's real tenant.
    if (!WP_SCOPED.has(uid)) return;
    const row: any = await adapter.entries.get(uid, id);
    if (row?.tenantKey && row.tenantKey !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
    return;
  }
  if (!SCOPED.has(uid)) return;
  const owner = await trueOwnerOf(uid, id);
  if (owner && owner !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
}

/** BOOKKEEPING_UIDS (governance.ts:110) writes always execute under the
 * scheduler's Super Admin credential (see withContentAdapter below), and
 * none of these five uids are in SCOPED/WP_SCOPED — so resolveCustomRolePermissions,
 * tenantStamp, and tenantGuard above all no-op for them by construction.
 * Found live-auditing this session: that combination meant ANY authenticated
 * caller could PUT/DELETE any OTHER tenant's own record (or any audit-log/
 * custom-role/field-policy row) via the generic /api/cms/entries/[uid]/[id]
 * route, executed with Super Admin rights regardless of the caller's own
 * permissions. This is the dedicated backstop for that gap.
 *
 * custom-role and field-policy already have their own properly-scoped
 * functions (saveCustomRole/deleteCustomRole/assignCustomRole; FieldAccess's
 * own save path) — nothing in the UI writes them through the generic path,
 * so it's blocked outright rather than half-guarded. audit-log must never be
 * client-writable at all: writeAudit() below writes it directly via
 * strapiBookkeeping, bypassing this function entirely, so blocking the
 * generic path here has no legitimate caller to break.
 *
 * tenant and release DO have legitimate generic-path callers (NewWorkspace.tsx
 * creating a new workspace; EntryEditor.tsx appending an item to a release) —
 * for those, allow an unscoped caller freely (matches every other unscoped
 * exemption in this file), and otherwise require the target row's own tenant
 * to match the caller's. */
async function assertBookkeepingWriteAllowed(uid: string, id: string | null, eff: Tenant | null): Promise<void> {
  if (!BOOKKEEPING_UIDS.has(uid)) return;
  if (uid === CUSTOM_ROLE_UID || uid === FIELD_POLICY_UID || uid === AUDIT_UID) {
    throw new CmsError("This content type must be managed through its own screen, not written directly.", 403);
  }
  if (!eff) return; // unscoped super admin — allowed, same exemption as everywhere else in this file
  if (uid === TENANT_UID) {
    if (id && id !== String(eff.documentId ?? eff.id)) throw new CmsError("Cross-tenant operation not permitted", 403);
    return;
  }
  if (uid === RELEASE_UID && id) {
    const owner = await trueOwnerOf(uid, id);
    if (owner && owner !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
  }
}

/** Engine-appropriate tenant stamp for a create/update body — Strapi wants a
 * relation id, WordPress wants its tenant KEY (wordpress.ts resolves that to
 * a wtenant term id itself, since it owns that cache). */
function tenantStamp(uid: string, eff: Tenant | null): Record<string, any> {
  if (!eff) return {};
  if (uid.startsWith("wp:")) return WP_SCOPED.has(uid) ? { tenant: eff.key } : {};
  return SCOPED.has(uid) ? { tenant: eff.id } : {};
}

async function writeAudit(action: string, uid: string, entryId: any, user: CurrentUser, tenantKey: string | null): Promise<void> {
  try {
    await strapiBookkeeping(() => strapiAdapter.entries.create(AUDIT_UID, {
      action, contentType: uid, entryId: entryId ?? null,
      adminEmail: user.email, tenantKey, at: new Date().toISOString(),
    }));
  } catch { /* don't let audit failure break the underlying write */ }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await (await activeAdapter()).auth.me();
  if (!user) throw new CmsError("Unauthenticated", 401);
  return user;
}

/** Strapi half of what Billing.tsx / contentUsageFor() below show as "items
 * used" (Strapi's own /api/analytics/summary contentTotal) — enforcement has
 * to count the same way it's displayed, or a user would see e.g. "42/50" in
 * the UI and get blocked at a different number underneath. Strapi-engine
 * tenants only; see tenantItemCountWordpress() below for the WordPress half
 * (Analytics.tsx's own content-type breakdown is a separate, still Strapi-
 * only, pre-existing gap — left alone here, see its own file for why).
 * Fails open (returns 0, i.e. "not over limit") on any error: a broken
 * limit check should never be the reason a real content save fails. */
async function tenantItemCount(tenantKey: string): Promise<number> {
  try {
    const token = await schedulerStrapiToken();
    if (!token) return 0;
    const r = await fetch(STRAPI_URL + "/api/analytics/summary?tenant=" + encodeURIComponent(tenantKey), {
      headers: { Authorization: "Bearer " + token }, cache: "no-store",
    });
    if (!r.ok) return 0;
    const j = await r.json();
    return Number(j?.contentTotal) || 0;
  } catch { return 0; }
}

/** WordPress counterpart — Strapi has no visibility into WordPress content at
 * all (its own /api/analytics/summary above is a set of local DB queries,
 * nothing more), so this counts the same way ContentBrowser's own list calls
 * already do: WP_SCOPED's REST totals (X-WP-Total), filtered by this
 * tenant's wtenant term, summed across every WP_SCOPED type. "Published
 * only" matches tenantItemCount()'s own semantics above (Strapi's summary
 * counts publishedAt:$notNull, not drafts). Authenticates with the
 * scheduler's own WordPress credential — same as ensureWordpressTenantTerm()/
 * processDueReleases() already do — so the count is authoritative regardless
 * of the calling user's own read scope, not just what pageSize:1 happens to
 * return for them specifically. Fails open to 0, same contract as above. */
async function tenantItemCountWordpress(tenantKey: string): Promise<number> {
  try {
    const wpToken = await schedulerWpToken();
    if (!wpToken) return 0;
    return await withServiceToken(wpToken, async () => {
      const counts = await Promise.all(
        [...WP_SCOPED].map((uid) =>
          wordpressAdapter.entries
            .list(uid, { pageSize: 1, status: "published", filter: [{ field: "tenant.key", op: "eq", value: tenantKey }] })
            .then((r) => r.total)
            .catch(() => 0)
        )
      );
      return counts.reduce((a, b) => a + b, 0);
    });
  } catch { return 0; }
}

/** Backs the /api/cms/content-usage route — the same number Billing.tsx
 * displays as "used", computed the same way enforceItemLimit() below checks
 * it, so a tenant never sees a usage figure that disagrees with what's
 * actually gating their next create. */
export async function contentUsageFor(tenantKey: string): Promise<{ contentTotal: number }> {
  const tenant = await resolveTenantByKey(tenantKey);
  const total = tenant?.engine === "wordpress" ? await tenantItemCountWordpress(tenantKey) : await tenantItemCount(tenantKey);
  return { contentTotal: total };
}

/** governed.create()'s plan-limit gate — only for a scoped tenant (an
 * unscoped/super-admin create has no tenant to check a limit against, same
 * as tenantStamp() below already treats that case) and only for a SCOPED or
 * WP_SCOPED uid; anything else (tenant, audit-log, custom-role, ...) has no
 * per-item plan limit at all. */
async function enforceItemLimit(eff: Tenant | null, uid: string): Promise<void> {
  if (!eff) return;
  const wp = WP_SCOPED.has(uid);
  if (!SCOPED.has(uid) && !wp) return;
  const limit = planLimit(eff.plan).items;
  if (!Number.isFinite(limit)) return;
  const used = wp ? await tenantItemCountWordpress(eff.key) : await tenantItemCount(eff.key);
  if (used >= limit) {
    throw new CmsError(`This workspace has reached its ${limit}-item plan limit — upgrade to add more content.`, 403);
  }
}

/** Which adapter (and, for bookkeeping uids, which credential) a content
 * operation on `uid` should run against. Bookkeeping uids (tenant,
 * field-policy, audit-log, release — see BOOKKEEPING_UIDS) always resolve to
 * Strapi via the service credential, regardless of this session's own
 * engine — the Users/Field Access/Audit Log/Releases pages need to work the
 * same way for a WordPress-session admin as for a Strapi one. Everything
 * else uses this session's own resolved engine. */
async function withContentAdapter<T>(uid: string, fn: (adapter: CmsAdapter) => Promise<T>): Promise<T> {
  if (BOOKKEEPING_UIDS.has(uid)) return strapiBookkeeping(() => fn(strapiAdapter));
  return fn(await activeAdapter());
}

export const governed = {
  schema: { listContentTypes: async () => (await activeAdapter()).schema.listContentTypes() },
  auth: {
    me: async () => (await activeAdapter()).auth.me(),
    // listRoles/listUsers/create all take the target WORKSPACE explicitly —
    // resolving engine from that tenant, not from this session's own login,
    // so switching the workspace selector to e.g. a WordPress tenant while
    // on a Strapi session lists the right backend's users, not the wrong one.
    async listRoles(tenantKey?: string) {
      // No tenantKey: pre-existing unscoped behavior, unchanged — Field
      // Access's role picker wants Strapi's own roles via this session's
      // engine, not any particular workspace's.
      if (!tenantKey) return (await activeAdapter()).auth.listRoles();
      const target = await resolveTenantByKey(tenantKey);
      if (!target) throw new CmsError("Unknown workspace", 404);
      return withEngineAdapter(target.engine || "strapi", (a) => a.auth.listRoles());
    },
    async listUsers(tenantKey: string) {
      const caller = await requireUser();
      const eff = await resolveEffectiveTenant(caller.email);
      assertCanActOnTenant(eff, tenantKey);
      const target = await resolveTenantByKey(tenantKey);
      if (!target) throw new CmsError("Unknown workspace", 404);
      const all = await withEngineAdapter(target.engine || "strapi", (a) => a.auth.listUsers());
      // adminEmails is the same per-tenant roster Strapi content RBAC already
      // uses — reused here as "who belongs to this workspace" regardless of
      // which backend actually hosts their login.
      const roster = new Set((target.adminEmails || []).map((e) => e.toLowerCase()));
      if (!roster.size) return [];
      return all.filter((u) => roster.has((u.email || "").toLowerCase()));
    },
    async create(tenantKey: string, input: NewUserInput) {
      const caller = await requireUser();
      const eff = await resolveEffectiveTenant(caller.email);
      assertCanActOnTenant(eff, tenantKey);
      const target = await resolveTenantByKey(tenantKey);
      if (!target) throw new CmsError("Unknown workspace", 404);
      // Seat limit applies to the TARGET tenant regardless of whether the
      // caller is scoped or an unscoped super admin adding someone on a
      // tenant's behalf — unlike content items, there's no "no tenant to
      // check against" case here, since tenantKey always names one.
      const seatLimit = planLimit(target.plan).seats;
      const currentSeats = (target.adminEmails || []).length;
      if (Number.isFinite(seatLimit) && currentSeats >= seatLimit) {
        throw new CmsError(`This workspace has reached its ${seatLimit}-seat plan limit — upgrade to add more users.`, 403);
      }
      // A custom role isn't a real Strapi/WordPress role — it's a WebX
      // governance overlay. The underlying account still needs some real,
      // login-capable base role, same default selfServeSignup/ssoLogin
      // already use, with the custom role assigned on top afterward.
      let engineInput = input;
      let customRoleKey: string | null = null;
      if (typeof input.roleId === "string" && input.roleId.startsWith("custom:")) {
        customRoleKey = input.roleId.slice("custom:".length);
        const roles = await withEngineAdapter(target.engine || "strapi", (a) => a.auth.listRoles());
        // Case-insensitive: WordPress's own listRoles() returns lowercase
        // native slugs ("editor"), not Strapi's capitalized "Editor" — an
        // exact-case match here used to silently fall through to roles[0],
        // which for WordPress is "administrator". That meant every
        // custom-role WordPress account was provisioned as a full native
        // admin regardless of what the custom role's permissions said,
        // since nothing in WP's own capability system reflects a custom
        // role at all — found live while building the WordPress backstop.
        const base = roles.find((r) => r.name.toLowerCase() === "editor") ?? roles[0];
        if (!base) throw new CmsError("Could not provision the account's base role", 500);
        engineInput = { ...input, roleId: base.id };
      }
      const result = await withEngineAdapter(target.engine || "strapi", (a) => a.auth.create(engineInput));
      const current = new Set((target.adminEmails || []).map((e) => e.toLowerCase()));
      if (!current.has(input.email.toLowerCase())) {
        const updated = [...(target.adminEmails || []), input.email];
        await strapiBookkeeping(() =>
          strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { adminEmails: updated })
        );
        invalidateTenantCache();
      }
      if (customRoleKey) await assignCustomRole(tenantKey, input.email, customRoleKey);
      // Never the password — it exists only in this call's return value.
      await writeAudit("create_user", "admin::user", result.user.id, caller, tenantKey);
      return result;
    },
    async remove(tenantKey: string, input: { id: any; email: string }): Promise<RemoveUserResult> {
      const caller = await requireUser();
      const eff = await resolveEffectiveTenant(caller.email);
      assertCanActOnTenant(eff, tenantKey);
      const target = await resolveTenantByKey(tenantKey);
      if (!target) throw new CmsError("Unknown workspace", 404);

      // Revoking workspace membership is the primary, always-happens effect
      // — this is what actually controls whether they can reach this
      // tenant's data, same as create() granting it via the same list.
      const remaining = (target.adminEmails || []).filter((e) => e.toLowerCase() !== input.email.toLowerCase());
      await strapiBookkeeping(() =>
        strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { adminEmails: remaining })
      );
      invalidateTenantCache();

      // Only delete the underlying account if this was their last workspace
      // — otherwise removing someone from one tenant would silently break
      // their still-valid access to another. Scans every tenant, not the
      // (single-tenant-per-email) byEmail cache, since that map can only
      // hold one tenant per email and would give a false negative here.
      const { byKey } = await refreshTenantCache();
      const stillMember = [...byKey.values()].some((t) =>
        (t.adminEmails || []).some((e) => e.toLowerCase() === input.email.toLowerCase())
      );
      let accountDeleted = false;
      if (!stillMember) {
        try {
          await withEngineAdapter(target.engine || "strapi", (a) => a.auth.remove(input.id));
          accountDeleted = true;
        } catch { /* membership is already revoked — an orphaned account left
                    behind is a cleanup nit, not a reason to fail this call */ }
      }

      await writeAudit("remove_user", "admin::user", input.id ?? null, caller, tenantKey);
      return { removed: true, accountDeleted };
    },
  },
  media: { upload: async (file: File) => (await activeAdapter()).media.upload(file) },

  async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
    return withContentAdapter(uid, async (cms) => {
      // Custom roles' own "view" flag used to be a UI hint only (CustomRoles.tsx
      // still hides the nav item) with no server-side check behind it — a
      // view:false user could still read the content type straight through
      // the API. Resolving user/eff here (previously only done inside the
      // WP_SCOPED branch below) costs an extra auth.me() round-trip for every
      // list call, same tradeoff governed.create/update/remove already accept
      // for their own resolveCustomRolePermissions() call.
      const user = await cms.auth.me();
      const eff = user ? await resolveEffectiveTenant(user.email) : null;
      if (user) {
        const crp = await resolveCustomRolePermissions(user, eff, uid);
        if (crp && !crp.view) throw new CmsError("Your role does not permit viewing this content", 403);
      }
      if (WP_SCOPED.has(uid) && eff) {
        const filter = [...(query?.filter || []), { field: "tenant.key", op: "eq" as const, value: eff.key }];
        return cms.entries.list<T>(uid, { ...query, filter });
      }
      return cms.entries.list<T>(uid, query);
    });
  },
  async get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null> {
    return withContentAdapter(uid, async (cms) => {
      const user = await cms.auth.me();
      const eff = user ? await resolveEffectiveTenant(user.email) : null;
      if (user) {
        const crp = await resolveCustomRolePermissions(user, eff, uid);
        // Checked before the fetch below — a denied caller shouldn't pay for
        // (or receive the response of) a read they're not allowed to make.
        if (crp && !crp.view) throw new CmsError("Your role does not permit viewing this content", 403);
      }
      const result: any = await cms.entries.get<T>(uid, id, opts);
      if (WP_SCOPED.has(uid) && result && eff && result.tenantKey && result.tenantKey !== eff.key) {
        throw new CmsError("Cross-tenant operation not permitted", 403);
      }
      return result;
    });
  },
  async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    await assertBookkeepingWriteAllowed(uid, null, eff);
    await enforceItemLimit(eff, uid);
    const crp = await resolveCustomRolePermissions(user, eff, uid);
    if (crp && !crp.create) throw new CmsError("Your role does not permit creating this content", 403);
    let d = await stripPolicyFields(user, uid, data);
    d = stripCustomRoleFields(crp, d);
    d = { ...d, ...tenantStamp(uid, eff) };
    const result: any = await withContentAdapter(uid, (cms) => cms.entries.create<any>(uid, d));
    await writeAudit("create", uid, result?.documentId ?? result?.id ?? null, user, eff?.key ?? null);
    if (uid === TENANT_UID && d.engine === "wordpress" && result?.key) {
      await ensureWordpressTenantTerm(result.key);
    }
    return result;
  },
  async update<T = any>(uid: string, id: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    await assertBookkeepingWriteAllowed(uid, id, eff);
    const crp = await resolveCustomRolePermissions(user, eff, uid);
    if (crp && !crp.update) throw new CmsError("Your role does not permit updating this content", 403);
    let d = await stripPolicyFields(user, uid, data);
    d = stripCustomRoleFields(crp, d);
    d = { ...d, ...tenantStamp(uid, eff) };
    const result = await withContentAdapter(uid, async (cms) => {
      await tenantGuard(uid, id, eff, cms);
      return cms.entries.update<T>(uid, id, d, opts);
    });
    await writeAudit("update", uid, id, user, eff?.key ?? null);
    return result;
  },
  async remove(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    await assertBookkeepingWriteAllowed(uid, id, eff);
    const crp = await resolveCustomRolePermissions(user, eff, uid);
    if (crp && !crp.delete) throw new CmsError("Your role does not permit deleting this content", 403);
    await withContentAdapter(uid, async (cms) => {
      await tenantGuard(uid, id, eff, cms);
      await cms.entries.remove(uid, id, opts);
    });
    await writeAudit("delete", uid, id, user, eff?.key ?? null);
  },
  async publish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
    const user = await requireUser();
    await doPublish(uid, id, user, opts);
  },
  async unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    const crp = await resolveCustomRolePermissions(user, eff, uid);
    // No separate "unpublish" flag in the permission matrix — publish and
    // unpublish share the one checkbox.
    if (crp && !crp.publish) throw new CmsError("Your role does not permit unpublishing this content", 403);
    await withContentAdapter(uid, async (cms) => {
      await tenantGuard(uid, id, eff, cms);
      await cms.publish.unpublish(uid, id, opts);
    });
    await writeAudit("unpublish", uid, id, user, eff?.key ?? null);
    // Unpublishing changes what the public site should show too (Phase 7) —
    // not awaited, see requestPublicSiteRebuild's own reasoning.
    requestPublicSiteRebuild();
  },
};

// Shared by the public publish() above and processDueReleases() below — the
// scheduler has no admin session, so it calls this directly with a synthetic
// system actor instead of going through requireUser(). `adapter` defaults to
// this session's own active adapter (unchanged behavior for the normal
// publish() path); the scheduler passes an explicit per-item adapter since
// one release can mix engines regardless of which one this session (if any)
// is authenticated against — see adapterFor above.
async function doPublish(uid: string, id: string, actor: CurrentUser, opts?: { locale?: string }, adapter?: CmsAdapter): Promise<void> {
  const ad = adapter ?? (await activeAdapter());
  const eff = await resolveEffectiveTenant(actor.email);
  const crp = await resolveCustomRolePermissions(actor, eff, uid);
  if (crp && !crp.publish) throw new CmsError("Your role does not permit publishing this content", 403);
  await tenantGuard(uid, id, eff, ad);
  await ad.publish.publish(uid, id, opts);
  await writeAudit("publish", uid, id, actor, eff?.key ?? null);
  // Covers both the direct publish() path and every item the release
  // scheduler publishes (Phase 7) — one debounced rebuild either way, not
  // awaited here (see requestPublicSiteRebuild's own reasoning).
  requestPublicSiteRebuild();
}

const SCHEDULER_ACTOR: CurrentUser = { id: "scheduler", email: "scheduler@webx", roles: [], isSuperAdmin: true };

// The scheduler has no browser session cookie to read a token from, so it
// logs in as a dedicated service account (strapi-cms/src/seed/seed.ts's
// seedScheduler; a WordPress equivalent needs its own Application Password —
// see webx-studio/.env.example) and holds the token briefly. Release
// bookkeeping is always Strapi (see RELEASE_UID's module-header note), so a
// Strapi token is required for the scheduler to do anything; the WordPress
// token is only needed if a due release actually contains a WordPress item.
// Phase 6 also routes every BOOKKEEPING_UIDS operation through this same
// credential (see strapiBookkeeping/withContentAdapter) — a WordPress-session
// admin hits the Users/Field Access/Audit Log/Releases pages far more often
// than the scheduler ever ticks, so the cache TTL is close to the token's
// own ~30min lifetime (SESSION_TTL) rather than a short interval: logging in
// this often is what tripped Strapi's own admin-login rate limiter during
// Phase 6 verification.
let schedulerStrapiTok: { at: number; token: string | null; refresh: string | null } = { at: 0, token: null, refresh: null };
// Single-flight guard: without this, two calls landing during the same
// cache-miss window (e.g. SSO's login-initiation and callback routes, a few
// hundred ms apart) each independently decide the cache is stale and fire
// their own /admin/login — found live during SSO verification, where the
// second one tripped the rate limiter the first had just cleared. Every
// concurrent caller now awaits the SAME in-flight refresh instead.
let schedulerStrapiRefreshing: Promise<string | null> | null = null;
async function schedulerStrapiToken(): Promise<string | null> {
  if (Date.now() - schedulerStrapiTok.at > 25 * 60_000 || !schedulerStrapiTok.token) {
    if (!schedulerStrapiRefreshing) {
      schedulerStrapiRefreshing = (async () => {
        try {
          // Prefer refreshing the existing session over a fresh /admin/login —
          // the refresh endpoint isn't behind the same brute-force rate
          // limiter, and at this call frequency (every BOOKKEEPING_UIDS
          // operation, not just a scheduler tick) a full re-login every cache
          // expiry tripped it during Phase 6 verification.
          if (schedulerStrapiTok.refresh) {
            const rr = await strapiRefresh(schedulerStrapiTok.refresh);
            if (rr) {
              schedulerStrapiTok = { at: Date.now(), token: rr.token, refresh: rr.refresh ?? schedulerStrapiTok.refresh };
              return schedulerStrapiTok.token;
            }
          }
          if (!STRAPI_SCHEDULER_EMAIL || !STRAPI_SCHEDULER_PASSWORD) return null;
          const r = await strapiLogin(STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD);
          // Only cache on success — a transient failure (Strapi briefly down,
          // its login rate-limiter tripped) shouldn't lock bookkeeping out for
          // the full cache window; retry on the very next call instead.
          if (r.ok) schedulerStrapiTok = { at: Date.now(), token: r.token, refresh: r.refresh ?? null };
          return schedulerStrapiTok.token;
        } finally {
          schedulerStrapiRefreshing = null;
        }
      })();
    }
    return schedulerStrapiRefreshing;
  }
  return schedulerStrapiTok.token;
}
let schedulerWpTok: string | null = null;
async function schedulerWpToken(): Promise<string | null> {
  // Only cache on SUCCESS — same fix as schedulerStrapiToken's own comment
  // above already explains for the Strapi side. This used to cache `null`
  // itself on a single failed login (WordPress briefly down, credentials
  // not yet configured at boot) using `undefined` as the only "unset"
  // sentinel — after that one failure, every WordPress-engine operation
  // (user management, release publishing, plan-limit counting, tenant-term
  // creation) silently failed or returned 0 for the rest of the process's
  // life, since nothing ever retried. Application Passwords genuinely don't
  // expire, so caching a real token for the process lifetime is still
  // correct — it's caching the ABSENCE of one that was the bug.
  if (schedulerWpTok) return schedulerWpTok;
  if (!WORDPRESS_SCHEDULER_USERNAME || !WORDPRESS_SCHEDULER_APP_PASSWORD) return null;
  const r = await wordpressLogin(WORDPRESS_SCHEDULER_USERNAME, WORDPRESS_SCHEDULER_APP_PASSWORD);
  if (r.ok) schedulerWpTok = r.token;
  return schedulerWpTok;
}

/** Creating a new engine:"wordpress" tenant used to only create the Strapi
 * Tenant record — the matching wtenant TERM in the shared WordPress instance
 * (the only thing that actually scopes its content) had to be created by
 * hand afterward. Called from create() below right after a new WordPress
 * tenant is made, under the scheduler's service credentials the same way
 * processDueReleases() authors WordPress content with no ambient session.
 * Best-effort: a WordPress outage or missing scheduler credentials must not
 * fail tenant creation itself — the term can still be added by hand exactly
 * as before this existed, so failures here are swallowed, not surfaced. */
async function ensureWordpressTenantTerm(key: string): Promise<void> {
  try {
    const wpToken = await schedulerWpToken();
    if (!wpToken) return;
    await withServiceToken(wpToken, () => ensureWtenantTerm(key));
  } catch { /* see comment above — non-fatal */ }
}

/** Runs `fn` against the adapter for a specific ENGINE (not this session's
 * own, per activeAdapter()) — needed by the auth.* calls below, which act on
 * a workspace the caller names, not the one they happen to be logged into.
 * Always goes through that engine's scheduler service credential, same as
 * strapiBookkeeping/ensureWordpressTenantTerm above, for two reasons: (1)
 * there's often no ambient session for the OTHER engine at all, and (2) even
 * when there is one, a workspace-scoped admin's own backend account (a
 * Strapi Editor role, a WordPress non-admin role) typically lacks the native
 * admin::users/create_users permission this needs — WebX's own tenant check
 * in governed.auth below is what actually authorizes the call, not the
 * backend's native RBAC. */
async function withEngineAdapter<T>(engine: "strapi" | "wordpress", fn: (adapter: CmsAdapter) => Promise<T>): Promise<T> {
  if (engine === "wordpress") {
    const token = await schedulerWpToken();
    if (!token) throw new CmsError("No WordPress service credential configured", 500);
    return withServiceToken(token, () => fn(wordpressAdapter));
  }
  const token = await schedulerStrapiToken();
  if (!token) throw new CmsError("No Strapi service credential configured", 500);
  return withServiceToken(token, () => fn(strapiAdapter));
}

/** Throws 403 if the caller is scoped to a tenant other than the one they're
 * trying to act on. `eff === null` means unscoped/super-admin — any tenant. */
function assertCanActOnTenant(eff: Tenant | null, tenantKey: string): void {
  if (eff && eff.key !== tenantKey) throw new CmsError("Cross-tenant operation not permitted", 403);
}

/** Publish every release whose scheduledAt has passed — engine-agnostic: each
 * item is published against whichever adapter its own contentType uid
 * belongs to (adapterFor), so a single release can mix Strapi and WordPress
 * items. Releases themselves stay Strapi-hosted bookkeeping, like
 * tenant/field-policy/audit (see the module header) — this ports the logic
 * that used to live in strapi-cms's own processDueReleases()
 * (strapi-cms/src/index.ts), which could only ever publish Strapi content. */
/** Used to unconditionally mark a release "done" even when every one of its
 * items failed to publish — a release that published nothing was
 * indistinguishable in the UI from one that fully succeeded, since the
 * per-item catch below only ever skipped and moved on. Now failures are
 * counted per item and, if any occurred, the release is marked "failed"
 * (with a note listing which items) instead of "done" — and the credential-
 * missing early return below now throws instead of quietly reporting
 * {processed:0} with a 200, which used to mean the release-scheduler's own
 * `curl -sf ... || echo tick failed` never caught it: nothing failed as far
 * as curl was concerned, so a broken scheduler credential silently stopped
 * all scheduled publishing with nothing observable anywhere. */
export async function processDueReleases(): Promise<{ processed: number; failed: number }> {
  const strapiToken = await schedulerStrapiToken();
  if (!strapiToken) throw new CmsError("Strapi service credential unavailable", 503);
  return withServiceToken(strapiToken, async () => {
    const now = Date.now();
    const { data: due } = await strapiAdapter.entries.list<any>(RELEASE_UID, {
      filter: [{ field: "state", op: "eq", value: "scheduled" }],
      pageSize: 50,
    });
    let processed = 0;
    let failed = 0;
    for (const rel of due || []) {
      if (!rel.scheduledAt || new Date(rel.scheduledAt).getTime() > now) continue;
      const items = Array.isArray(rel.items) ? rel.items : [];
      const failedItems: string[] = [];
      for (const it of items) {
        if (!it?.contentType || !it?.documentRef) continue;
        const adapter = adapterFor(it.contentType);
        try {
          if (adapter === wordpressAdapter) {
            const wpToken = await schedulerWpToken();
            if (!wpToken) throw new Error("WordPress service credential unavailable");
            await withServiceToken(wpToken, () => doPublish(it.contentType, it.documentRef, SCHEDULER_ACTOR, undefined, adapter));
          } else {
            await doPublish(it.contentType, it.documentRef, SCHEDULER_ACTOR, undefined, adapter);
          }
        } catch (e: any) {
          failedItems.push(`${it.contentType}/${it.documentRef}: ${e?.message || "publish failed"}`);
        }
      }
      try {
        if (failedItems.length) {
          const note = `[${new Date().toISOString()}] ${failedItems.length}/${items.length} item(s) failed to publish:\n${failedItems.join("\n")}`;
          await strapiAdapter.entries.update(RELEASE_UID, rel.documentId ?? rel.id, {
            state: "failed", note: rel.note ? `${rel.note}\n\n${note}` : note,
          });
          failed++;
        } else {
          await strapiAdapter.entries.update(RELEASE_UID, rel.documentId ?? rel.id, { state: "done", publishedAt: new Date().toISOString() });
          processed++;
        }
      } catch { /* the release row itself failed to update — nothing more this loop can do about it */ }
    }
    return { processed, failed };
  });
}
