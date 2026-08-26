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
import type { CmsAdapter, EntryQuery, EntryList, CurrentUser, NewUserInput } from "./types";
import { strapiLogin, strapiRefresh, withServiceToken, sessionEngine } from "../strapi";
import { wordpressLogin } from "../wordpress";
import { requestPublicSiteRebuild, forceRebuildNow, getPublicSiteBuildStatus } from "../publicSiteBuild";
import {
  STRAPI_URL, STRAPI_INTERNAL_SECRET,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
  WORDPRESS_SCHEDULER_USERNAME, WORDPRESS_SCHEDULER_APP_PASSWORD,
} from "../config";

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
// Every uid the Users/Field Access/Audit Log/Releases pages read or write —
// always Strapi-hosted regardless of which engine THIS session authenticated
// against (Phase 5's module header). Without this, a WordPress-session admin
// hitting governed.list("api::audit-log.audit-log", ...) would route through
// the WordPress adapter (which only knows wp:post) and get a hard error —
// found live while verifying the first WordPress-engine tenant in Phase 6.
const BOOKKEEPING_UIDS = new Set([TENANT_UID, FIELD_POLICY_UID, AUDIT_UID, RELEASE_UID]);

type Tenant = { key: string; id: any; documentId?: any; name?: string; brand?: any; engine?: "strapi" | "wordpress"; adminEmails?: string[] };

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
      const tenant: Tenant = { key: t.key, id: t.id, documentId: t.documentId, name: t.name, brand: t.brand, engine: t.engine || "strapi", adminEmails };
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

let policyCache: { at: number; list: any[] } = { at: 0, list: [] };
async function getFieldPolicies(): Promise<any[]> {
  const now = Date.now();
  if (now - policyCache.at > 15_000) {
    try {
      const { data } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(FIELD_POLICY_UID, { pageSize: 500 }));
      policyCache = { at: now, list: data };
    } catch { policyCache = { at: now, list: [] }; }
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
      const result = await withEngineAdapter(target.engine || "strapi", (a) => a.auth.create(input));
      const current = new Set((target.adminEmails || []).map((e) => e.toLowerCase()));
      if (!current.has(input.email.toLowerCase())) {
        const updated = [...(target.adminEmails || []), input.email];
        await strapiBookkeeping(() =>
          strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { adminEmails: updated })
        );
        invalidateTenantCache();
      }
      // Never the password — it exists only in this call's return value.
      await writeAudit("create_user", "admin::user", result.user.id, caller, tenantKey);
      return result;
    },
  },
  media: { upload: async (file: File) => (await activeAdapter()).media.upload(file) },

  async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
    return withContentAdapter(uid, async (cms) => {
      if (WP_SCOPED.has(uid)) {
        const user = await cms.auth.me();
        const eff = user ? await resolveEffectiveTenant(user.email) : null;
        if (eff) {
          const filter = [...(query?.filter || []), { field: "tenant.key", op: "eq" as const, value: eff.key }];
          return cms.entries.list<T>(uid, { ...query, filter });
        }
      }
      return cms.entries.list<T>(uid, query);
    });
  },
  async get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null> {
    return withContentAdapter(uid, async (cms) => {
      const result: any = await cms.entries.get<T>(uid, id, opts);
      if (WP_SCOPED.has(uid) && result) {
        const user = await cms.auth.me();
        const eff = user ? await resolveEffectiveTenant(user.email) : null;
        if (eff && result.tenantKey && result.tenantKey !== eff.key) {
          throw new CmsError("Cross-tenant operation not permitted", 403);
        }
      }
      return result;
    });
  },
  async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    let d = await stripPolicyFields(user, uid, data);
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
    let d = await stripPolicyFields(user, uid, data);
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
async function schedulerStrapiToken(): Promise<string | null> {
  if (Date.now() - schedulerStrapiTok.at > 25 * 60_000 || !schedulerStrapiTok.token) {
    // Prefer refreshing the existing session over a fresh /admin/login — the
    // refresh endpoint isn't behind the same brute-force rate limiter, and
    // at this call frequency (every BOOKKEEPING_UIDS operation, not just a
    // scheduler tick) a full re-login every cache expiry tripped it during
    // Phase 6 verification.
    if (schedulerStrapiTok.refresh) {
      const rr = await strapiRefresh(schedulerStrapiTok.refresh);
      if (rr) {
        schedulerStrapiTok = { at: Date.now(), token: rr.token, refresh: rr.refresh ?? schedulerStrapiTok.refresh };
        return schedulerStrapiTok.token;
      }
    }
    if (!STRAPI_SCHEDULER_EMAIL || !STRAPI_SCHEDULER_PASSWORD) return null;
    const r = await strapiLogin(STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD);
    // Only cache on success — a transient failure (Strapi briefly down, its
    // login rate-limiter tripped) shouldn't lock bookkeeping out for the
    // full cache window; retry on the very next call instead.
    if (r.ok) schedulerStrapiTok = { at: Date.now(), token: r.token, refresh: r.refresh ?? null };
  }
  return schedulerStrapiTok.token;
}
let schedulerWpTok: string | null | undefined;
async function schedulerWpToken(): Promise<string | null> {
  if (schedulerWpTok === undefined) {
    if (!WORDPRESS_SCHEDULER_USERNAME || !WORDPRESS_SCHEDULER_APP_PASSWORD) { schedulerWpTok = null; return null; }
    const r = await wordpressLogin(WORDPRESS_SCHEDULER_USERNAME, WORDPRESS_SCHEDULER_APP_PASSWORD);
    schedulerWpTok = r.ok ? r.token : null; // Application Passwords don't expire — safe to cache for the process lifetime
  }
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
export async function processDueReleases(): Promise<{ processed: number }> {
  const strapiToken = await schedulerStrapiToken();
  if (!strapiToken) return { processed: 0 };
  return withServiceToken(strapiToken, async () => {
    const now = Date.now();
    const { data: due } = await strapiAdapter.entries.list<any>(RELEASE_UID, {
      filter: [{ field: "state", op: "eq", value: "scheduled" }],
      pageSize: 50,
    });
    let processed = 0;
    for (const rel of due || []) {
      if (!rel.scheduledAt || new Date(rel.scheduledAt).getTime() > now) continue;
      const items = Array.isArray(rel.items) ? rel.items : [];
      for (const it of items) {
        if (!it?.contentType || !it?.documentRef) continue;
        const adapter = adapterFor(it.contentType);
        try {
          if (adapter === wordpressAdapter) {
            const wpToken = await schedulerWpToken();
            if (wpToken) await withServiceToken(wpToken, () => doPublish(it.contentType, it.documentRef, SCHEDULER_ACTOR, undefined, adapter));
          } else {
            await doPublish(it.contentType, it.documentRef, SCHEDULER_ACTOR, undefined, adapter);
          }
        } catch { /* skip items that fail to publish */ }
      }
      try {
        await strapiAdapter.entries.update(RELEASE_UID, rel.documentId ?? rel.id, { state: "done", publishedAt: new Date().toISOString() });
        processed++;
      } catch { /* noop */ }
    }
    return { processed };
  });
}
