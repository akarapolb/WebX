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
import { AsyncLocalStorage } from "node:async_hooks";
import { strapiAdapter } from "./strapi";
import { wordpressAdapter, ensureWtenantTerm, wordpressFieldNames } from "./wordpress";
import { CmsError } from "./types";
import type { AdminUser, CmsAdapter, ContentTypeInfo, EntryQuery, EntryList, CurrentUser, NewUserInput, RemoveUserResult, MediaAsset, MediaAssetList, FilterOp } from "./types";
import { digestContentType, wordpressAttributes, type ContentTypeSchema } from "@/lib/agent/schemaDigest";
import { parseCheckpoint } from "@/lib/agent/engine/checkpoint";
import { evaluateJobOwner } from "@/lib/agent/jobs/owner";
import {
  bulkCreateGoal, bulkCreatePlan, isTemplateKey, parseTemplateParams, requiredLevelFor, templateTitle, TemplateError, TEMPLATES,
  type DirectItem, type TemplateKey,
} from "@/lib/agent/jobs/templates";
import { advanceSchedule, controlJob, disableSchedule, dueSchedules, type JobControlAction } from "@/lib/agent/jobs/store.server";
import { authorizationUntil, runScheduleTick, type Prepared, type TickReport } from "@/lib/agent/jobs/schedules";
import { nextOccurrence, parseRecurrence, RecurrenceError, type Recurrence } from "@/lib/agent/recurrence";
import type { AgentJobRow, JobOwner, JobPolicy, OwnerRefusal } from "@/lib/agent/jobs/types";
import { strapiLogin, strapiRefresh, withServiceToken, sessionEngine, actingSession, withActingSession } from "../strapi";
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
  "api::landing.landing", "api::page.page",
  "api::blog.blog", "api::catalog.catalog", "api::weblink.weblink", "api::top-graphic.top-graphic",
  "api::event.event", "api::location.location", "api::sitemap-node.sitemap-node",
  "api::menu-item.menu-item", "api::contact-message.contact-message",
  "api::breaking-news.breaking-news",
  // block-type/icon: same shape as everything else here (a real `tenant`
  // relation), but missing from BOTH this set and strapi-cms/src/index.ts's
  // own SCOPED — found in a full-codebase audit (2026-09-12). Strapi's own
  // side is the one that actually enforced the gap in practice (interactive
  // editor sessions hit Strapi with their own JWT, so its hook resolves the
  // real caller identity regardless of this file); added here too so these
  // two get the same redundant explicit stamp (tenantStamp below) every
  // other SCOPED type already gets, instead of depending solely on the
  // other layer the way review/release deliberately do for a documented
  // reason (see tenantStamp's own comment) that doesn't apply here.
  "api::block-type.block-type", "api::icon.icon",
]);

// Phase 5 — WordPress-hosted content types that carry tenant scoping (via the
// `wtenant` taxonomy; see lib/cms/wordpress.ts). Unlike SCOPED above,
// WordPress has no pre-existing hook of its own doing any of this, so
// governance.ts enforces both read- and write-side scoping for these types
// (SCOPED's read side is still deliberately left to Strapi's own hook).
const WP_SCOPED = new Set([
  "wp:post", "wp:service", "wp:publication", "wp:faq", "wp:resource", "wp:page",
  "wp:timeline", "wp:mission", "wp:org-unit", "wp:document",
  // Phase 7 — native WordPress polls/complaints/applications/breaking-news,
  // replacing the Strapi-backed shared-service layer for orst/royalsociety
  // (wordpress/mu-plugins/public-forms-*.php). wp:breaking-news specifically
  // REPLACES the old BOOKKEEPING_UIDS routing below for a WordPress-engine
  // session — see BREAKING_NEWS_UID's own comment.
  "wp:poll", "wp:complaint", "wp:contact-message", "wp:job", "wp:application", "wp:breaking-news",
]);

const TENANT_UID = "api::tenant.tenant";
const FIELD_POLICY_UID = "api::field-policy.field-policy";
const AUDIT_UID = "api::audit-log.audit-log";
const RELEASE_UID = "api::release.release";
const MFA_ENROLLMENT_UID = "api::mfa-enrollment.mfa-enrollment";
const SSO_CREDENTIAL_UID = "api::sso-credential.sso-credential";
const CUSTOM_ROLE_UID = "api::custom-role.custom-role";
const MENU_ITEM_UID = "api::menu-item.menu-item";
// Breaking-news banner — used to be routed the same way as MENU_ITEM_UID
// (always Strapi, so a WordPress-session admin could still manage it via
// bookkeeping credentials). Phase 7 reverses that: ORST/RoyalSociety
// breaking-news now lives natively in WordPress (wp:breaking-news, added to
// WP_SCOPED above) — BreakingNewsManager.tsx picks the uid by session
// engine directly instead. This uid is kept only for DGA/PEA's own
// Strapi-engine sessions, which resolve to strapiAdapter via activeAdapter()
// regardless of BOOKKEEPING_UIDS membership — confirmed removing it here has
// zero effect on them (see the Phase 7 plan's verification notes).
const BREAKING_NEWS_UID = "api::breaking-news.breaking-news";
const PAGE_VERSION_UID = "api::page-version.page-version";
const PAGE_TEMPLATE_UID = "api::page-template.page-template";
// Review rows reference their target entry only by opaque documentRef +
// contentType strings (see api::review.review's own schema) and their own
// tenant relation, so — like consent-log — no WordPress-side equivalent is
// needed: a review of a "wp:mission" entry is just as representable here as
// one of an "api::article.article" entry. assertReviewApprovedIfEngaged's
// own publish-gate check (below) already reads this via strapiBookkeeping
// and is correctly engine-agnostic; what wasn't was ReviewBoard.tsx and
// EntryEditor.tsx's "submit for review" action, both of which call this uid
// through the CALLING session's own adapter — silently broken for any
// WordPress-engine session (found live: "Could not load reviews (HTTP
// 400)"), since WordPress's adapter has no way to resolve an "api::" uid.
const REVIEW_UID = "api::review.review";
// WebX Agent conversation + run history (Phase 8) — same shape of concern as
// page-version/page-template: authoring/audit metadata, not site content, so
// it lives in Strapi for every engine and joins BOOKKEEPING_UIDS below. Unlike
// those two, a thread also has a per-OWNER boundary the generic bookkeeping
// write-guard below can't express (it only ever checks tenant, not "did this
// specific user's own thread"), so it's blocked outright there — same as
// custom-role/field-policy/audit-log — and only ever written via
// lib/agent/threads.ts's own owner+tenant-filtered functions.
const AGENT_THREAD_UID = "api::agent-thread.agent-thread";
// Background agent jobs (Phase 9): same kind of per-owner bookkeeping as
// threads, written by workers only through strapi-cms's lease endpoints.
const AGENT_JOB_UID = "api::agent-job.agent-job";
const AGENT_SCHEDULE_UID = "api::agent-schedule.agent-schedule";
// Cookie-consent records are written directly to Strapi by public-site
// regardless of the tenant's own engine (see public-site/components/
// CookieConsent.tsx's own comment — it just posts ?tenant=<key> against
// Strapi's consent-logs API, which already accepts any real tenant key,
// WordPress-engine ones included). There is no WordPress-side equivalent
// and none is needed — this only ever needs bookkeeping-style read access
// so a WordPress-engine admin's Cookie Consent page isn't stuck 400ing on
// an "api::" uid its own session's adapter can never resolve.
const CONSENT_LOG_UID = "api::consent-log.consent-log";
// Every uid the Users/Field Access/Audit Log/Releases pages read or write —
// always Strapi-hosted regardless of which engine THIS session authenticated
// against (Phase 5's module header). Without this, a WordPress-session admin
// hitting governed.list("api::audit-log.audit-log", ...) would route through
// the WordPress adapter (which only knows wp:post) and get a hard error —
// found live while verifying the first WordPress-engine tenant in Phase 6.
// custom-role is included so a WordPress-session admin's own custom-role
// enforcement lookups also work (custom roles are engine-agnostic). menu-item
// is included so the Nav Manager works the same way — site-chrome nav items
// always live in Strapi's tenant table regardless of a tenant's content
// engine, same as brand/contact/footerColumns already do. page-version is
// the Visual Builder's undo-safety-net (History panel) for the same reason —
// a WordPress-hosted page (wp:page) still snapshots into Strapi, matching
// every other engine-agnostic bookkeeping type here; see VisualBuilder.tsx's
// saveVersion/loadHistory for the tenantKey filter this requires (WordPress
// post ids are small integers that can collide across tenants, unlike
// Strapi's own document ids). NOTE: api::ab-event.ab-event is deliberately
// NOT included — A/B testing stays Strapi/landing.landing-only; the
// Builder's A/B panel is gated behind isLanding, which is never true for a
// wp:page, so it has nothing to fix here.
// page-template joins for the identical reason page-version did: the
// Builder's saved whole-page block sets are authoring metadata, not site
// content, and a WordPress-session admin has to be able to save and apply
// them too — WordPress has nowhere to keep one, so they live in Strapi for
// every engine. Its own tenantKey string field (not a relation, same shape
// as page-version's) is what scopes them per workspace; see Toolbox.tsx.
// BREAKING_NEWS_UID deliberately NOT included here anymore (Phase 7) — see
// its own comment above. It stays a plain SCOPED-only Strapi uid now,
// exactly like complaint/application/contact-message always were.
const BOOKKEEPING_UIDS = new Set([TENANT_UID, FIELD_POLICY_UID, AUDIT_UID, RELEASE_UID, CUSTOM_ROLE_UID, MENU_ITEM_UID, PAGE_VERSION_UID, PAGE_TEMPLATE_UID, CONSENT_LOG_UID, REVIEW_UID, AGENT_THREAD_UID, AGENT_JOB_UID, AGENT_SCHEDULE_UID]);
/** The three BOOKKEEPING_UIDS blocked outright from the generic entries
 * route's WRITE side (assertBookkeepingWriteAllowed, below) — each needs a
 * dedicated writer with its own ownership/ordering logic the generic path
 * can't express, or (audit-log) must never be client-writable at all.
 * field-policy is deliberately NOT in this set — see its own branch in
 * assertBookkeepingWriteAllowed, which guards it a different way (an
 * admin-only check, not an outright block) since FieldAccess.tsx's save()
 * genuinely is its real write path, unlike the three here. NOT reused for
 * reads: unlike agent-thread (whose own listAgentThreads/getAgentThread
 * genuinely never call governed.list/get — see that section), audit-log's
 * /audit page (AuditLog.tsx) and field-policy's /field-access page
 * (FieldAccess.tsx, and EntryEditor.tsx's own field-policy lookup) both read
 * their data THROUGH this exact generic route today — blocking those reads
 * too would break those two real, currently-working screens, not just close
 * a gap. Only custom-role has a fully separate read+write path
 * (getCustomRoles/saveCustomRole, its own /api/cms/roles/* route) and could
 * safely take the same read block as agent-thread; left out of
 * GENERIC_ROUTE_READ_BLOCKED_UIDS below anyway to keep this change scoped to
 * the uid Milestone 1/2 actually added, and because CustomRoles.tsx never
 * exercises the generic route in the first place (blocking it would be
 * inert, not protective). */
const GENERIC_ROUTE_WRITE_BLOCKED_UIDS = new Set([CUSTOM_ROLE_UID, AUDIT_UID, AGENT_THREAD_UID, AGENT_JOB_UID, AGENT_SCHEDULE_UID]);
/** BOOKKEEPING_UIDS that carry a real `tenant` RELATION (not a plain
 * tenantKey string) and are ALSO in Strapi's own SCOPED set
 * (strapi-cms/src/index.ts) for the non-bookkeeping case — meaning a
 * bookkeeping-routed read of one of these runs under strapiBookkeeping's
 * scheduler service credential, and Strapi's own tenant-scoping hook derives
 * its filter from that request's identity (the scheduler, unscoped in every
 * tenant's adminEmails), so the hook silently no-ops. The exact same failure
 * mode review.review had — governed.list/get below is the only thing
 * actually enforcing isolation for these reads. REVIEW_UID keeps its own
 * separate branch (its get-side needs an extra list-based lookup a plain
 * relation check can't do — see that branch's own comment) rather than
 * joining this set, but uses the identical filter shape. Unlike WP_SCOPED/
 * REVIEW_UID's fail-closed-even-when-unscoped convention, an unscoped caller
 * here gets NO added filter (sees everything) — matching
 * assertBookkeepingWriteAllowed's own "unscoped super admin — allowed, same
 * exemption as everywhere else in this file" convention for these same
 * uids' writes. */
const RELATION_SCOPED_BOOKKEEPING_UIDS = new Set([RELEASE_UID, CONSENT_LOG_UID, MENU_ITEM_UID]);

/** Appends a fail-closed tenant condition to a query's own filter array —
 * but ONLY after stripping any client-supplied condition on that exact same
 * field first. Found live testing this exact fix: naively spreading the
 * caller's filter and appending ours after it (the pattern every branch
 * below used to use) is NOT reliably safe — a caller who supplies their own
 * condition on the identical field path (e.g. `key eq "orst"` when the
 * enforced field is also `key`) ends up with TWO conditions on one field in
 * the resulting query string (lib/cms/strapi.ts's buildQuery emits one
 * `filters[...][$eq]=` param per array entry, so two conditions on the same
 * path become duplicate query-string keys) — and depending on the exact
 * field shape, Strapi's own qs-based parsing sometimes coerces that into an
 * effective OR/IN rather than the intended AND, silently widening instead
 * of narrowing what gets returned. Confirmed live: `api::tenant.tenant`
 * with a client-supplied top-level `key eq "orst"` alongside an appended
 * `key eq "<caller's own key>"` returned BOTH tenants, not just the
 * caller's own — a real cross-tenant leak this helper closes by construction
 * (there is only ever one condition per field, ours, never two to conflict). */
function withTenantFilter(existing: EntryQuery["filter"] | undefined, field: string, op: FilterOp, value: any): EntryQuery["filter"] {
  return [...(existing || []).filter((f) => f.field !== field), { field, op, value }];
}
/** Reads blocked outright through the generic entries route — see the
 * comment above for why this is narrower than the write-block set. Found
 * live: without this, any authenticated admin of ANY tenant could open
 * Content > "Agent Thread" (schema listing itself isn't filtered — every
 * bookkeeping type shows up there, a separate pre-existing characteristic)
 * and see every tenant's, every user's, agent conversation threads
 * completely unfiltered — governed.list/get's own tenant filter only
 * applies to WP_SCOPED uids, and agent-thread (owner-scoped, not just
 * tenant-scoped) isn't in that set at all. audit-log/field-policy have
 * their own dedicated scoping branches further down (see AUDIT_UID's own
 * branch in governed.list/get); custom-role's generic-route read was the
 * one still genuinely open (found in a full-codebase audit, 2026-09-12) —
 * any authenticated admin of ANY tenant could read every other workspace's
 * custom-role names and permission matrices via
 * /api/cms/entries/api::custom-role.custom-role. Its own dedicated,
 * properly-tenant-scoped reader (listCustomRoles(), backing
 * /api/cms/roles — the real Roles page's own data source) already existed,
 * so blocking the generic route here has no legitimate caller to break,
 * same reasoning as audit-log below. */
const GENERIC_ROUTE_READ_BLOCKED_UIDS = new Set([AGENT_THREAD_UID, AGENT_JOB_UID, AGENT_SCHEDULE_UID, CUSTOM_ROLE_UID]);

type TenantSso = { enabled: boolean; issuerUrl?: string; clientId?: string; clientSecretEnc?: string; realm?: string };
// `features` is the pre-existing free-form per-tenant JSON bag ("unset = all
// on" for most flags — see its own schema.json comment); the WebX Agent's
// own policy lives at features.agent (see resolveAgentPolicy below) without
// needing its own migration. `publicTemplate` is VisualBuilder.tsx's own
// Dialect field ("gov-portal"/"orst"/"royalsociety") — added here so the
// agent runtime can resolve a caller's block-catalog dialect the same way
// the Builder itself does (open()'s own tenants.list lookup), instead of a
// second, divergent fetch.
type Tenant = { key: string; id: any; documentId?: any; name?: string; brand?: any; engine?: "strapi" | "wordpress"; adminEmails?: string[]; plan?: string; sso?: TenantSso; customRoleAssignments?: Record<string, string>; features?: Record<string, any>; publicTemplate?: string };

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
      const tenant: Tenant = { key: t.key, id: t.id, documentId: t.documentId, name: t.name, brand: t.brand, engine: t.engine || "strapi", adminEmails, plan: t.plan, sso: t.sso, customRoleAssignments: t.customRoleAssignments, features: t.features, publicTemplate: t.publicTemplate };
      byKey.set(t.key, tenant);
      adminEmails.forEach((e: string) => byEmail.set(String(e).toLowerCase(), tenant));
    });
    tenantCache = { at: now, byEmail, byKey };
  }
  return tenantCache;
}
async function resolveEffectiveTenant(email?: string): Promise<Tenant | null> {
  const acting = actingSession();
  if (acting) {
    // A background job: its owner's own tenant, never unscoped (fail closed).
    if (!email || email.toLowerCase() !== acting.email.toLowerCase()) throw new CmsError("Background jobs act only as their owner.", 403);
    const tenant = await resolveTenantByKey(acting.tenantKey);
    if (!tenant) throw new CmsError("This job's workspace no longer exists.", 403);
    return tenant;
  }
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
  const user = await currentUser();
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
  assertNotActing("change single sign-on");
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

// ---------- MFA enforcement (per-tenant "require MFA") ----------
// Real per-user MFA (isMfaEnabled et al., above) is opt-in and always
// available regardless of tenant. This layer lets a workspace ADMINISTRATOR
// require it — off by default, so an un-configured tenant behaves exactly as
// before. Turning it on starts a grace period for anyone not already
// enrolled: a visible reminder, then the app is blocked (but login and
// enrollment itself always work — see startMfaEnrollment's own comment on
// why a hard lock with no way back in would be wrong here). Skipped entirely
// for an SSO-enabled tenant (the IdP is already the trust boundary — see
// isMfaEnabled's own comment) and for a WordPress-engine session (no TOTP
// enrollment path exists there — the login route only ever checks personal
// MFA for a Strapi login).
const MFA_GRACE_DAYS = 14;
type SecurityFeatures = { mfaRequired?: boolean; mfaRequiredAt?: string };
const securityOf = (t: Pick<Tenant, "features">): SecurityFeatures => (t.features || {}).security || {};

/** Settings-page read, for the caller's own workspace. `isAdmin` tells the UI
 * whether to offer the toggle at all — a non-admin can still see the status. */
export async function getSecuritySettings(): Promise<{ mfaRequired: boolean; mfaRequiredAt: string | null; graceDays: number; isAdmin: boolean; ssoEnabled: boolean }> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  if (!eff) return { mfaRequired: false, mfaRequiredAt: null, graceDays: MFA_GRACE_DAYS, isAdmin: false, ssoEnabled: false };
  const sec = securityOf(eff);
  const isAdmin = !(eff.customRoleAssignments || {})[(caller.email || "").toLowerCase()];
  return { mfaRequired: Boolean(sec.mfaRequired), mfaRequiredAt: sec.mfaRequiredAt || null, graceDays: MFA_GRACE_DAYS, isAdmin, ssoEnabled: Boolean(eff.sso?.enabled) };
}

/** Settings-page write — a genuine workspace administrator only, same rule
 * saveAgentPolicy/saveTenantSsoConfig use (not someone acting under a custom
 * role within this same workspace). Turning it on starts a fresh
 * MFA_GRACE_DAYS window; it isn't restarted by saving it again while already on. */
export async function saveMfaRequirement(mfaRequired: boolean): Promise<void> {
  assertNotActing("change security settings");
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  if (!eff) throw new CmsError("This setting applies inside a workspace.", 403);
  if ((eff.customRoleAssignments || {})[(caller.email || "").toLowerCase()]) {
    throw new CmsError("Only a workspace administrator can change this.", 403);
  }
  const target = await resolveTenantByKey(eff.key);
  if (!target) throw new CmsError("Unknown workspace", 404);
  const existing = securityOf(target);
  const security: SecurityFeatures = {
    mfaRequired,
    mfaRequiredAt: mfaRequired ? (existing.mfaRequired ? existing.mfaRequiredAt : new Date().toISOString()) : undefined,
  };
  await strapiBookkeeping(() => strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { features: { ...(target.features || {}), security } }));
  invalidateTenantCache();
  await writeAudit(mfaRequired ? "security_mfa_require_enable" : "security_mfa_require_disable", TENANT_UID, target.documentId ?? target.id, caller, eff.key);
}

/** What the app layout / Security.tsx need: is MFA required for this
 * session's workspace, is the CALLER already enrolled, the grace deadline,
 * and whether it has passed. Strapi-engine only — callers must not invoke
 * this for a WordPress session (see the module comment above). */
export async function mfaEnforcementStatus(): Promise<{ required: boolean; enrolled: boolean; deadline: string | null; overdue: boolean }> {
  const caller = await requireUser();
  const enrolled = await isMfaEnabled(caller.email || "").catch(() => false);
  const eff = await resolveEffectiveTenant(caller.email);
  const sec = eff && !eff.sso?.enabled ? securityOf(eff) : {};
  if (!sec.mfaRequired || enrolled) return { required: Boolean(sec.mfaRequired), enrolled, deadline: null, overdue: false };
  const since = sec.mfaRequiredAt ? Date.parse(sec.mfaRequiredAt) : Date.now();
  const deadline = new Date(since + MFA_GRACE_DAYS * 86_400_000).toISOString();
  return { required: true, enrolled, deadline, overdue: Date.now() > since + MFA_GRACE_DAYS * 86_400_000 };
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
  // Deny-by-default like every other flag here — a scoped role must be
  // explicitly granted this to save a page/home-page containing a
  // block.embed (raw HTML/CSS/JS, runs on the live site for every visitor).
  // See PAGE_LIKE_UIDS/hasEmbedBlock below for where this is enforced.
  embedCode?: boolean;
  hidden?: string[]; readonly?: string[];
};

// The SCOPED uids whose `blocks` field can contain block.embed — the Custom
// Code block's server-side permission gate (embedCode above) only needs to
// inspect writes to these. NOTE: api::home-page.home-page has no `blocks`
// field at all (fixed hero/stats/featuredPromo components) and is unused by
// the current Visual Builder — the actual page-builder content types are
// page.page (general pages, and DGA's own homepage via its "home-blocks"
// slug — see HomePage.tsx), landing.landing (the splash/enter-site page, a
// smaller block set), and wp:page (WordPress-backed ORST/RoyalSociety
// pages — see wordpress.ts's ACF_JSON_FIELDS and blockDialect.ts).
const PAGE_LIKE_UIDS = new Set(["api::page.page", "api::landing.landing", "wp:page"]);
function hasEmbedBlock(data: Record<string, any>): boolean {
  let blocks = data?.blocks;
  // This runs on the raw request body BEFORE it reaches wordpress.ts's own
  // JSON encode/decode boundary, so a Builder-originated write always has
  // `blocks` as a real array here regardless of uid — the string case below
  // only exists to defend a direct API caller who posts the wp:page wire
  // format straight through. Unparseable fails CLOSED, deliberately unlike
  // every other check in this file: the cost of a false negative here is
  // raw JS running in every visitor's browser.
  if (typeof blocks === "string") {
    try { blocks = JSON.parse(blocks); } catch { return true; }
  }
  // `__component` is the Strapi dynamic-zone discriminator (page.page /
  // landing.landing); `type` is the wire shape ORST/RoyalSociety pages use
  // instead (see blockDialect.ts) — check both so this gate covers every
  // PAGE_LIKE_UIDS entry with one function.
  return Array.isArray(blocks) && blocks.some((b) => b?.__component === "block.embed" || b?.type === "embed");
}
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

const contentTypeCache: Partial<Record<"strapi" | "wordpress", { at: number; list: ContentTypeInfo[] }>> = {};
async function contentTypesForEngine(engine: "strapi" | "wordpress"): Promise<ContentTypeInfo[]> {
  const hit = contentTypeCache[engine];
  if (hit && Date.now() - hit.at < 60_000) return hit.list;
  const list = await withEngineAdapter(engine, (a) => a.schema.listContentTypes());
  contentTypeCache[engine] = { at: Date.now(), list };
  return list;
}

/** One content type's fields as the WebX Agent sees them (lib/agent/schemaDigest.ts):
 * only types this workspace governs, fields the caller's role can't see
 * dropped, fields it can't change marked read-only (Strapi field policies and
 * the tenant's custom role, same union stripPolicyFields/stripCustomRoleFields
 * apply on write). Null for any other uid. */
export async function getContentTypeSchema(uid: string): Promise<ContentTypeSchema | null> {
  const user = await requireUser();
  const eff = await resolveEffectiveTenant(user.email);
  const engine = eff?.engine === "wordpress" ? "wordpress" : "strapi";
  if (!(engine === "wordpress" ? WP_SCOPED : SCOPED).has(uid)) return null;
  const info = (await contentTypesForEngine(engine)).find((ct) => ct.uid === uid);
  if (!info) return null;

  let attributes = info.attributes;
  if (engine === "wordpress") {
    const names = wordpressFieldNames(uid);
    attributes = wordpressAttributes(names?.acf ?? [], names?.json ?? []);
  }

  const hidden: string[] = [];
  const readonly: string[] = [];
  if (!user.isSuperAdmin) {
    for (const p of await getFieldPolicies()) {
      if (p.contentType !== uid || !user.roles.includes(p.role)) continue;
      if (Array.isArray(p.hidden)) hidden.push(...p.hidden);
      if (Array.isArray(p.readonly)) readonly.push(...p.readonly);
    }
  }
  const crp = await resolveCustomRolePermissions(user, eff, uid);
  if (crp) {
    hidden.push(...crp.hidden);
    readonly.push(...crp.readonly);
  }
  return digestContentType({ uid, name: info.name, attributes }, { hidden, readonly });
}

export async function saveCustomRole(tenantKey: string, input: CustomRoleInput): Promise<any> {
  assertNotActing("change roles");
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
  assertNotActing("change roles");
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
  assertNotActing("change roles");
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
  view: boolean; create: boolean; update: boolean; delete: boolean; publish: boolean; embedCode: boolean; hidden: string[]; readonly: string[];
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
    delete: Boolean(perm.delete), publish: Boolean(perm.publish), embedCode: Boolean(perm.embedCode),
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
  // A background job runs on the scheduler's unscoped credential, so it fails
  // closed: an owner that can't be confirmed as the job's tenant is a
  // refusal, where an interactive session falls back to Strapi's own hook.
  const acting = Boolean(actingSession());
  if (!eff) {
    if (acting) throw new CmsError("Cross-tenant operation not permitted", 403);
    return;
  }
  if (uid.startsWith("wp:")) {
    // No internal-endpoint workaround needed here (contrast trueOwnerOf
    // above): WordPress has no competing scoping hook of its own hiding
    // cross-tenant rows from an authenticated read, so the plain adapter
    // call already sees the entry's real tenant.
    if (!WP_SCOPED.has(uid)) return;
    const row: any = await adapter.entries.get(uid, id);
    const otherTenant = acting ? row?.tenantKey !== eff.key : Boolean(row?.tenantKey && row.tenantKey !== eff.key);
    if (otherTenant) throw new CmsError("Cross-tenant operation not permitted", 403);
    return;
  }
  if (!SCOPED.has(uid)) return;
  const owner = await trueOwnerOf(uid, id);
  if (acting ? owner !== eff.key : owner && owner !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
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
 * custom-role already has its own properly-scoped functions
 * (saveCustomRole/deleteCustomRole/assignCustomRole) — nothing in the UI
 * writes it through the generic path, so it's blocked outright rather than
 * half-guarded. audit-log must never be client-writable at all: writeAudit()
 * below writes it directly via strapiBookkeeping, bypassing this function
 * entirely, so blocking the generic path here has no legitimate caller to
 * break. field-policy is NOT blocked outright (see its own branch below,
 * FieldAccess.tsx's save() genuinely is the generic path — a prior version
 * of this comment claimed a dedicated save path existed; it never did,
 * which silently 403'd every Field Access save until this was found).
 *
 * tenant and release DO have legitimate generic-path callers (NewWorkspace.tsx
 * creating a new workspace; EntryEditor.tsx appending an item to a release) —
 * for those, allow an unscoped caller freely (matches every other unscoped
 * exemption in this file), and otherwise require the target row's own tenant
 * to match the caller's. */
async function assertBookkeepingWriteAllowed(uid: string, id: string | null, eff: Tenant | null, user: CurrentUser): Promise<void> {
  if (!BOOKKEEPING_UIDS.has(uid)) return;
  if (GENERIC_ROUTE_WRITE_BLOCKED_UIDS.has(uid)) {
    throw new CmsError("This content type must be managed through its own screen, not written directly.", 403);
  }
  if (uid === FIELD_POLICY_UID) {
    // No tenant dimension on this type (its schema has no tenant field at
    // all — every workspace intentionally sees the same global role-based
    // policy set), so the risk here isn't cross-tenant leakage, it's
    // privilege escalation: field-policy governs what OTHER roles can see
    // and edit, globally, so only a genuine workspace admin (or an unscoped
    // super admin) may write it — never someone acting under a custom role
    // themselves, who could otherwise unhide their own role's restricted
    // fields. Same convention saveAgentPolicy already established for the
    // agent's own autonomy level.
    if (eff && (eff.customRoleAssignments || {})[(user.email || "").toLowerCase()]) {
      throw new CmsError("Only a workspace administrator can change field access policy.", 403);
    }
    return;
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
  if (uid === MENU_ITEM_UID && id) {
    const owner = await trueOwnerOf(uid, id);
    if (owner && owner !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
  }
  if (uid === BREAKING_NEWS_UID && id) {
    const owner = await trueOwnerOf(uid, id);
    if (owner && owner !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
  }
  if (uid === PAGE_TEMPLATE_UID && id) {
    // trueOwnerOf can't answer for this uid — its internal endpoint reads a
    // tenant RELATION and page-template scopes by a plain tenantKey string,
    // so it would return null and wave the write through. Read the row with
    // the same bookkeeping credential the write itself would use instead.
    // A globally-shared template (empty tenantKey) is deliberately NOT
    // editable here: `eff` is non-null, so this caller is workspace-scoped
    // and must own the row outright — sharing one globally is a one-way
    // door only an unscoped super admin can re-open.
    const row: any = await strapiBookkeeping(() => strapiAdapter.entries.get(PAGE_TEMPLATE_UID, id)).catch(() => null);
    if ((row?.tenantKey || "") !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
  }
}

/** Engine-appropriate tenant stamp for a create/update body — Strapi wants a
 * relation id, WordPress wants its tenant KEY (wordpress.ts resolves that to
 * a wtenant term id itself, since it owns that cache). */
function tenantStamp(uid: string, eff: Tenant | null): Record<string, any> {
  if (!eff) return {};
  // page-template scopes by a plain tenantKey STRING, not a relation (see
  // its schema.json for why), so it can't ride SCOPED's relation stamp
  // below — but it still has to be stamped rather than trusted from the
  // client, or a scoped caller could POST a template carrying another
  // workspace's key. An unscoped super admin (eff === null, returned above)
  // keeps whatever the client sent, which is what lets them save a
  // key-less template shared with every workspace.
  if (uid === PAGE_TEMPLATE_UID) return { tenantKey: eff.key };
  if (uid.startsWith("wp:")) return WP_SCOPED.has(uid) ? { tenant: eff.key } : {};
  // review.review and release.release both carry a real `tenant` relation
  // (manyToOne -> api::tenant.tenant) in their own schema.json, same shape
  // SCOPED types use — added here rather than to SCOPED itself since SCOPED
  // also controls Strapi's own tenant-scoping hook (strapi-cms/src/index.ts)
  // and both are BOOKKEEPING_UIDS whose writes always route through the
  // scheduler's own credential regardless of SCOPED membership, unlike
  // everything else in SCOPED. Found live: neither was ever stamped at all
  // before — every review/release row was created with tenant:null, which
  // combined with the governed.list/get identity-resolution bug fixed just
  // below meant both were completely unscoped by tenant, readable (and, for
  // release, writable/deletable — see assertBookkeepingWriteAllowed's own
  // trueOwnerOf-based guard above, which silently no-ops on a null owner)
  // across every workspace.
  return (SCOPED.has(uid) || uid === REVIEW_UID || uid === RELEASE_UID) ? { tenant: eff.id } : {};
}

// Phase 8 — lets every EXISTING writeAudit() call site (every governed.*
// write, unchanged) attribute an action to the WebX Agent without knowing
// anything about it: lib/agent/runtime.ts wraps one run's whole tool-
// execution loop in withAgentActor(runId, fn), and any writeAudit() called
// anywhere underneath that — via governed.update, governed.create, etc. —
// picks up the ambient runId automatically. adminEmail always stays the
// human who ran the agent (the CurrentUser governed.* already resolves from
// THEIR OWN session); only actor/targetRef/the action-name prefix change.
// Same AsyncLocalStorage pattern lib/strapi.ts's tokenOverride already uses
// for the release scheduler's own credential override.
const agentActorStore = new AsyncLocalStorage<{ runId: string }>();
export function withAgentActor<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  return agentActorStore.run({ runId }, fn);
}

async function writeAudit(action: string, uid: string, entryId: any, user: CurrentUser, tenantKey: string | null): Promise<void> {
  const agent = agentActorStore.getStore();
  try {
    await strapiBookkeeping(() => strapiAdapter.entries.create(AUDIT_UID, {
      action: agent ? "agent_" + action : action, contentType: uid, entryId: entryId ?? null,
      adminEmail: user.email, tenantKey, at: new Date().toISOString(),
      ...(agent ? { actor: "agent", targetRef: agent.runId } : {}),
    }));
  } catch { /* don't let audit failure break the underlying write */ }
}

/** The signed-in user, or a background job's owner (lib/strapi.ts's acting session). */
async function currentUser(): Promise<CurrentUser | null> {
  const acting = actingSession();
  if (acting) return acting.user;
  return (await activeAdapter()).auth.me();
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new CmsError("Unauthenticated", 401);
  return user;
}

/** In a background job, governed.* reaches only tenant content, plus the review
 * and page-version rows the agent's tools file. Returns the acting session. */
function assertActingUid(uid: string) {
  const acting = actingSession();
  if (acting && !SCOPED.has(uid) && !WP_SCOPED.has(uid) && uid !== REVIEW_UID && uid !== PAGE_VERSION_UID) {
    throw new CmsError("This content type is not available to background jobs.", 403);
  }
  return acting;
}

/** For what a background job must never do, whatever its owner may. */
export function assertNotActing(what: string): void {
  if (actingSession()) throw new CmsError(`Background jobs cannot ${what}.`, 403);
}

// ---------- WebX Agent policy (Phase 8) ----------
// Admin-granted autonomy, resolved the same way every other WebX-owned
// permission layer in this file is: a tenant-wide default (stored in the
// pre-existing free-form tenant.features JSON — no schema migration, same
// place SSO/analytics/liveChat settings already live) with an optional
// per-custom-role override that can only ever RESTRICT it further, never
// widen it — most-restrictive-wins, same convention stripPolicyFields/
// stripCustomRoleFields already compose with.
export type AgentLevel = "off" | "read" | "suggest" | "draft" | "draft_submit";
const AGENT_LEVELS: AgentLevel[] = ["off", "read", "suggest", "draft", "draft_submit"];
const AGENT_LEVEL_RANK: Record<AgentLevel, number> = { off: 0, read: 1, suggest: 2, draft: 3, draft_submit: 4 };
function isAgentLevel(v: any): v is AgentLevel { return AGENT_LEVELS.includes(v); }
/** Most-restrictive-wins merge of a tenant-wide default with a per-role
 * override (resolveAgentPolicy's own use below) — exported (this file's
 * internals are otherwise all module-private, see this file's header note on
 * why every cross-cutting feature lives directly in here) purely so
 * tests/agent-tools.test.ts can exercise the real merge rule directly rather
 * than a re-implemented copy. */
export function clampAgentLevel(a: AgentLevel, b: AgentLevel): AgentLevel { return AGENT_LEVEL_RANK[a] <= AGENT_LEVEL_RANK[b] ? a : b; }

/** tools/contentTypes: null = no allowlist beyond the level itself (unset =
 * all on, matching features' own established convention) — a non-null array
 * is an intersection filter, never additive. `reason` is set only when
 * level is "off", for the empty-state UI to explain why (Free plan vs. a
 * workspace admin never having turned it on vs. AGENT_ENABLED=0). */
export type AgentPolicy = {
  level: AgentLevel; tools: string[] | null; contentTypes: string[] | null; tenantKey: string | null; model: string;
  reason?: "disabled" | "unscoped" | "plan" | "not_granted";
  /** The tenant's own publicTemplate/engine — lib/agent/tools.ts's
   * page-building tools (get_page_blocks/insert_blocks/replace_block/
   * remove_block/list_block_types) need this to translate a page's stored
   * blocks through blockDialect.ts's toBuilder/toWire (a no-op for
   * "gov-portal", the only dialect every pre-Phase-8 Strapi tenant has) and
   * to pick the right page uid ("wp:page" vs "api::page.page"/
   * "api::landing.landing"). Defaults match VisualBuilder.tsx's own
   * fallbacks for an unresolved/pre-existing tenant. */
  dialect: string; engine: "strapi" | "wordpress";
};

/** Resolved fresh on every call — cheap (rides the existing 30s tenant cache
 * and 15s custom-role cache, no extra network round trip beyond those) — so
 * callers can safely re-check it before every tool call, not just once per
 * run, and a workspace admin flipping the level to "off" mid-run takes
 * effect on the very next tool call. */
export async function resolveAgentPolicy(user: CurrentUser): Promise<AgentPolicy> {
  const empty: AgentPolicy = { level: "off", tools: null, contentTypes: null, tenantKey: null, model: "", dialect: "gov-portal", engine: "strapi" };
  if (process.env.AGENT_ENABLED === "0") return { ...empty, reason: "disabled" };
  const eff = await resolveEffectiveTenant(user.email);
  // Unscoped/super-admin sessions (the scheduler, ops/support staff) have no
  // single workspace whose admin could have granted a policy — deliberately
  // conservative rather than defaulting an unscoped, cross-tenant-reach
  // session to some ambient autonomy level.
  if (!eff) return { ...empty, reason: "unscoped" };
  const dialect = eff.publicTemplate || "gov-portal";
  const engine = eff.engine || "strapi";
  if (eff.plan === "free" || !eff.plan) return { ...empty, tenantKey: eff.key, dialect, engine, reason: "plan" };

  const tenantAgent = (eff.features || {}).agent || {};
  let level: AgentLevel = isAgentLevel(tenantAgent.level) ? tenantAgent.level : "off";
  let tools: string[] | null = Array.isArray(tenantAgent.tools) ? tenantAgent.tools : null;
  let contentTypes: string[] | null = Array.isArray(tenantAgent.contentTypes) ? tenantAgent.contentTypes : null;
  const reason = level === "off" ? "not_granted" : undefined;

  // Per-role override, reserved key "__agent" — role.permissions is keyed by
  // real content-type uid everywhere else (CustomRolePermission), and every
  // real uid is either "api::x.x" or "wp:x"; "__agent" can never collide.
  if (!user.isSuperAdmin) {
    const roleKey = (eff.customRoleAssignments || {})[(user.email || "").toLowerCase()];
    if (roleKey) {
      const role = (await getCustomRoles()).find((r) => r.tenantKey === eff.key && r.roleKey === roleKey);
      const roleAgent = role?.permissions?.__agent;
      if (roleAgent && isAgentLevel(roleAgent.level)) {
        level = clampAgentLevel(level, roleAgent.level);
        if (Array.isArray(roleAgent.tools)) tools = tools ? tools.filter((t) => roleAgent.tools.includes(t)) : roleAgent.tools;
        if (Array.isArray(roleAgent.contentTypes)) contentTypes = contentTypes ? contentTypes.filter((c) => roleAgent.contentTypes.includes(c)) : roleAgent.contentTypes;
      }
    }
  }
  const model = tenantAgent.model || (tenantAgent.local ? "webx-local" : "");
  return { level, tools, contentTypes, tenantKey: eff.key, model, dialect, engine, reason: level === "off" ? reason : undefined };
}

/** Workspace-default settings form (AgentSettings.tsx) reads/writes only
 * this — the tenant-wide default; a per-role override is edited alongside
 * that role's other permissions in CustomRoles.tsx, under the same
 * reserved "__agent" key resolveAgentPolicy reads above. */
export type AgentTenantSettings = {
  level: AgentLevel; tools?: string[]; contentTypes?: string[]; model?: string; local?: boolean;
  /** Background jobs and schedules (Phase 9): off until a workspace admin turns them on. */
  background?: boolean; schedules?: boolean;
};

export async function getAgentPolicy(tenantKey: string): Promise<AgentTenantSettings> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  const a = (target.features || {}).agent || {};
  return {
    level: isAgentLevel(a.level) ? a.level : "off",
    tools: Array.isArray(a.tools) ? a.tools : undefined,
    contentTypes: Array.isArray(a.contentTypes) ? a.contentTypes : undefined,
    model: a.model || undefined, local: Boolean(a.local),
    background: Boolean(a.background), schedules: Boolean(a.schedules),
  };
}

export async function saveAgentPolicy(tenantKey: string, input: AgentTenantSettings): Promise<void> {
  assertNotActing("change the agent's settings");
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
  // Only a genuine workspace admin (not someone acting under a custom role
  // within this same workspace) may change the agent's own autonomy — an
  // editor shouldn't be able to grant themselves more reach than their role
  // permits everywhere else in this file. Scoped-down sibling of
  // requireUnscoped's "who may" reasoning for API tokens: workspace-local
  // here rather than instance-wide, since this setting genuinely is.
  if (eff && (eff.customRoleAssignments || {})[(caller.email || "").toLowerCase()]) {
    throw new CmsError("Only a workspace administrator can change the agent's autonomy level.", 403);
  }
  const target = await resolveTenantByKey(tenantKey);
  if (!target) throw new CmsError("Unknown workspace", 404);
  if (!isAgentLevel(input.level)) throw new CmsError("Invalid autonomy level", 400);
  const features = {
    ...(target.features || {}),
    agent: {
      level: input.level, tools: input.tools, contentTypes: input.contentTypes, model: input.model, local: Boolean(input.local),
      background: Boolean(input.background), schedules: Boolean(input.schedules),
    },
  };
  await strapiBookkeeping(() => strapiAdapter.entries.update(TENANT_UID, target.documentId ?? target.id, { features }));
  invalidateTenantCache();
  await writeAudit("agent_policy_update", TENANT_UID, target.documentId ?? target.id, caller, tenantKey);
}

/** Monthly agent-run budget (PLAN_LIMITS.agentRuns) — counted from the
 * agent_run audit row runtime.ts writes once at the start of every run
 * (same "enforcement counts the same way it's displayed" discipline as
 * enforceItemLimit/tenantItemCount above). Fails open on a lookup error —
 * a broken counter should never be the reason a run can't start. */
async function enforceAgentRunLimit(eff: Tenant | null): Promise<void> {
  if (!eff) return;
  const limit = planLimit(eff.plan).agentRuns;
  if (!Number.isFinite(limit)) return;
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  try {
    const { total } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(AUDIT_UID, {
      pageSize: 1,
      filter: [
        { field: "tenantKey", op: "eq", value: eff.key },
        { field: "action", op: "eq", value: "agent_run" },
        { field: "at", op: "gte", value: monthStart.toISOString() },
      ],
    }));
    if (total >= limit) throw new CmsError(`This workspace has reached its ${limit}-run monthly agent limit — upgrade to raise it.`, 403);
  } catch (e) {
    if (e instanceof CmsError) throw e;
    // the count lookup itself failed — fail open, same as every other
    // limit/gate check in this file
  }
}

/** The one exported entry point runtime.ts calls, once, at the start of a
 * run — keeps Tenant itself fully private to this module. */
export async function checkAgentRunBudget(user: CurrentUser): Promise<void> {
  const eff = await resolveEffectiveTenant(user.email);
  return enforceAgentRunLimit(eff);
}

/** The metering row enforceAgentRunLimit/checkAgentRunBudget counts —
 * written explicitly (not via writeAudit's own ambient-actor prefixing,
 * since this call IS the thing announcing an agent run started, not a
 * governed.* side effect happening to occur during one) once per run, right
 * after checkAgentRunBudget passes. Never throws — a metering write failing
 * should not be the reason a run can't proceed. */
export async function recordAgentRunStart(user: CurrentUser, runId: string): Promise<void> {
  const eff = await resolveEffectiveTenant(user.email);
  try {
    await strapiBookkeeping(() => strapiAdapter.entries.create(AUDIT_UID, {
      action: "agent_run", contentType: "agent", entryId: runId,
      adminEmail: user.email, tenantKey: eff?.key ?? null, at: new Date().toISOString(),
      actor: "agent", targetRef: runId,
    }));
  } catch { /* metering only — never block a run over this */ }
}

// ---------- Agent background jobs (Phase 9) ----------
// Jobs are Strapi bookkeeping (AGENT_JOB_UID, blocked from the generic entries
// route like agent threads). Workers change them only through strapi-cms's
// lease endpoints (lib/agent/jobs/store.server.ts). People create and read
// them here, and cancel/pause/resume/answer through the same compare-and-set
// endpoint. A job's owner and the workspace's administrators (members without
// a custom role, the same rule saveAgentPolicy uses) can see and control it,
// so an admin can stop a departed colleague's job; anyone else gets a 404.

function jobPolicyOf(p: AgentPolicy): JobPolicy {
  return { level: p.level, tools: p.tools, contentTypes: p.contentTypes, model: p.model, dialect: p.dialect, engine: p.engine, tenantKey: p.tenantKey };
}

/** A job as the browser sees it: no checkpoint, lease or saved policy. */
function agentJobView(row: any): any {
  if (!row || typeof row !== "object") return row;
  const { checkpoint, events, leaseToken, leaseOwner, policySnapshot, crashSeq, ...rest } = row;
  return rest;
}

const isWorkspaceAdmin = (eff: Tenant, email?: string) => !(eff.customRoleAssignments || {})[(email || "").toLowerCase()];

async function loadJobForCaller(id: string, user: CurrentUser): Promise<any> {
  const eff = await resolveEffectiveTenant(user.email);
  const row: any = await strapiBookkeeping(() => strapiAdapter.entries.get(AGENT_JOB_UID, id)).catch(() => null);
  const isOwner = (row?.ownerEmail || "").toLowerCase() === (user.email || "").toLowerCase();
  if (!row || !eff || row.tenantKey !== eff.key || !(isOwner || isWorkspaceAdmin(eff, user.email))) throw new CmsError("Unknown job", 404);
  return row;
}

async function countJobs(tenantKey: string, runState: string): Promise<number> {
  const { total } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(AGENT_JOB_UID, {
    pageSize: 1, filter: [{ field: "tenantKey", op: "eq", value: tenantKey }, { field: "runState", op: "eq", value: runState }],
  }));
  return total;
}

export type AgentJobInput = {
  title?: string; goal?: string; template?: string; params?: Record<string, any>;
  threadId?: string; lang?: "en" | "th"; budget?: { maxTokens?: number; maxMinutes?: number };
};

type JobPlanLimits = ReturnType<typeof planLimit>;

/** Every job needs a workspace, an agent that isn't off, a plan that includes jobs, and background jobs turned on. */
async function jobPreconditions(user: CurrentUser): Promise<{ eff: Tenant; policy: AgentPolicy; limits: JobPlanLimits }> {
  const eff = await resolveEffectiveTenant(user.email);
  if (!eff) throw new CmsError("Background jobs run inside a workspace.", 403);
  const policy = await resolveAgentPolicy(user);
  if (policy.level === "off") throw new CmsError("The agent is not available in this workspace.", 403);
  const limits = planLimit(eff.plan);
  if (!limits.agentConcurrentJobs) throw new CmsError("Background jobs need a paid plan.", 403);
  if (!eff.features?.agent?.background) {
    throw new CmsError("Background jobs are turned off for this workspace. A workspace administrator can turn them on in Agent settings.", 403);
  }
  return { eff, policy, limits };
}

/** The panel's status check: the caller's agent policy, and whether this workspace runs background jobs. */
export async function resolveAgentStatus(user: CurrentUser): Promise<AgentPolicy & { background: boolean; schedules: boolean }> {
  const policy = await resolveAgentPolicy(user);
  const eff = policy.level === "off" ? null : await resolveEffectiveTenant(user.email);
  const limits = eff ? planLimit(eff.plan) : null;
  const agent = eff?.features?.agent;
  return {
    ...policy,
    background: Boolean(agent?.background && limits?.agentConcurrentJobs),
    schedules: Boolean(agent?.background && agent?.schedules && limits?.agentSchedules),
  };
}

// Job templates (lib/agent/jobs/templates.ts). Parameters are checked and the
// work is listed here, as the person starting the job, so the preview shows
// exactly what the job will do and a job never covers more than its owner can
// see.

const TEMPLATE_TOOL: Partial<Record<TemplateKey, string>> = { bulk_create: "create_draft_entry", bulk_translate: "translate_fields", audit_all: "audit_entry" };
/** Rough AI tokens per item, for the preview's estimate only. */
const TOKENS_PER_ITEM: Partial<Record<TemplateKey, number>> = { bulk_create: 6000, bulk_translate: 1500, audit_all: 0 };
const PREVIEW_ITEMS = 20;
const ENTRY_TITLE_FIELDS = ["title", "name", "subject", "question", "heading", "label"];

type ExpandedJob = {
  template: TemplateKey; title: string; goal: string; params: Record<string, any>; requiredLevel: AgentLevel;
  count: number; items: { title: string; detail?: string }[]; estimatedTokens: number | null;
};

const entryTitle = (e: any): string =>
  String(ENTRY_TITLE_FIELDS.map((k) => e?.[k]).find((v) => typeof v === "string" && v.trim()) || e?.documentId || e?.id || "").slice(0, 100);

async function entriesForJob(uid: string, o: { q?: string; updatedSince?: string; ids?: string[]; max: number }): Promise<DirectItem[]> {
  const out: DirectItem[] = [];
  if (o.ids?.length) {
    for (const id of o.ids.slice(0, o.max)) {
      const e: any = await governed.get(uid, id).catch(() => null);
      if (e) out.push({ uid, id: String(e.documentId ?? id), title: entryTitle(e) });
    }
    return out;
  }
  const filter: NonNullable<EntryQuery["filter"]> = o.updatedSince ? [{ field: "updatedAt", op: "gte", value: o.updatedSince }] : [];
  for (let page = 1; out.length < o.max && page <= 20; page++) {
    const r = await governed.list(uid, { page, pageSize: 100, sort: "updatedAt:DESC", ...(o.q ? { q: o.q } : {}), ...(filter.length ? { filter } : {}) });
    for (const e of r.data as any[]) {
      const id = String(e?.documentId ?? e?.id ?? "");
      if (id) out.push({ uid, id, title: entryTitle(e) });
      if (out.length >= o.max) break;
    }
    if (page >= (r.pageCount || 1)) break;
  }
  return out;
}

async function expandJob(eff: Tenant, policy: AgentPolicy, rawKey: unknown, rawParams: unknown, lang: "en" | "th"): Promise<ExpandedJob> {
  if (!isTemplateKey(rawKey)) throw new CmsError("Unknown job template.", 400);
  const key = rawKey;
  let p: any;
  try {
    p = parseTemplateParams(key, rawParams);
  } catch (e) {
    if (e instanceof TemplateError) throw new CmsError(e.message, 400);
    throw e;
  }
  const requiredLevel = requiredLevelFor(key, p, policy.level);
  if (AGENT_LEVEL_RANK[policy.level] < AGENT_LEVEL_RANK[requiredLevel]) {
    throw new CmsError(`This job needs the agent's "${requiredLevel}" autonomy level, and this workspace grants "${policy.level}".`, 403);
  }
  const tool = TEMPLATE_TOOL[key];
  if (tool && policy.tools && !policy.tools.includes(tool)) {
    throw new CmsError(`This job uses the ${tool} tool, which isn't enabled for the agent in this workspace.`, 403);
  }

  const uids: string[] = key === "bulk_translate" ? [p.contentType] : key === "custom" ? [] : p.contentTypes;
  const names: Record<string, string> = {};
  if (uids.length) {
    const governable = await listGovernableContentTypes(eff.key);
    for (const u of uids) {
      const ct = governable.find((c) => c.uid === u);
      if (!ct) throw new CmsError(`${u} isn't a content type in this workspace.`, 400);
      if (policy.contentTypes && !policy.contentTypes.includes(u)) throw new CmsError(`The agent isn't allowed to work with ${ct.label} in this workspace.`, 403);
      names[u] = ct.label;
    }
  }
  const title = templateTitle(key, p, names, lang);

  if (key === "custom") {
    return { template: key, title, goal: p.goal, params: p.tools ? { tools: p.tools } : {}, requiredLevel, count: 0, items: [], estimatedTokens: null };
  }
  if (key === "bulk_create") {
    const schemas: ContentTypeSchema[] = [];
    for (const u of uids) {
      const s = await getContentTypeSchema(u);
      if (s) schemas.push(s);
    }
    const plan = bulkCreatePlan(p, names);
    return {
      template: key, title, goal: bulkCreateGoal(p, schemas), params: { ...p, plan }, requiredLevel, count: plan.length,
      items: plan.slice(0, PREVIEW_ITEMS).map((i) => ({ title: i.title })), estimatedTokens: plan.length * (TOKENS_PER_ITEM.bulk_create ?? 0),
    };
  }
  let items: DirectItem[] = [];
  if (key === "bulk_translate") {
    items = await entriesForJob(p.contentType, p);
  } else {
    for (const u of uids) {
      if (items.length >= p.max) break;
      items.push(...(await entriesForJob(u, { updatedSince: p.updatedSince, max: p.max - items.length })));
    }
  }
  const goal = key === "bulk_translate"
    ? `Translate ${items.length} ${names[p.contentType]} entries into ${p.targetLocale} and file each translation for review.`
    : `Audit ${items.length} entries of ${uids.map((u) => names[u]).join(", ")}.`;
  return {
    template: key, title, goal, params: { ...p, items }, requiredLevel, count: items.length,
    items: items.slice(0, PREVIEW_ITEMS).map((i) => ({ title: i.title || i.id, detail: names[i.uid] || i.uid })),
    estimatedTokens: items.length * (TOKENS_PER_ITEM[key] ?? 0),
  };
}

type NewJob = {
  template: TemplateKey; title: string; goal: string; params: Record<string, any>; requiredLevel: AgentLevel;
  lang: "en" | "th"; threadId: string | null; budget?: AgentJobInput["budget"]; checkpoint?: unknown;
};

async function insertAgentJob(user: CurrentUser, eff: Tenant, policy: AgentPolicy, limits: JobPlanLimits, j: NewJob): Promise<any> {
  const unfinished = (await countJobs(eff.key, "queued")) + (await countJobs(eff.key, "running")) + (await countJobs(eff.key, "paused"));
  if (unfinished >= limits.agentQueuedJobs) {
    throw new CmsError(`This workspace already has ${unfinished} unfinished background jobs, the most its plan allows. Wait for some to finish or cancel them.`, 429);
  }
  await checkAgentRunBudget(user);

  const within = (asked: number | undefined, max: number) => (asked && asked > 0 ? Math.min(asked, max) : max);
  const created: any = await strapiBookkeeping(() => strapiAdapter.entries.create(AGENT_JOB_UID, {
    tenantKey: eff.key, ownerEmail: user.email, ownerUserId: String(user.id), engine: eff.engine || "strapi",
    threadId: j.threadId, template: j.template, title: j.title.trim().slice(0, 120), goal: j.goal, params: j.params,
    lang: j.lang, requiredLevel: j.requiredLevel, policySnapshot: jobPolicyOf(policy), onQuestion: "wait",
    runState: "queued", attempts: 0, checkpointSeq: 0, eventSeq: 0, tokensUsed: 0, checkpoint: j.checkpoint ?? null,
    budget: { maxTokens: within(j.budget?.maxTokens, limits.agentJobTokenBudget), maxMinutes: within(j.budget?.maxMinutes, limits.agentJobMaxMinutes) },
  }));
  await recordAgentRunStart(user, `job:${created?.documentId}`);
  await writeAudit("agent_job_create", AGENT_JOB_UID, created?.documentId ?? null, user, eff.key);
  return agentJobView(created);
}

export async function createAgentJob(input: AgentJobInput): Promise<any> {
  assertNotActing("create background jobs");
  const user = await requireUser();
  const { eff, policy, limits } = await jobPreconditions(user);
  const lang = input.lang === "th" ? "th" : "en";
  const key = input.template || "custom";
  const params = key === "custom" ? { ...(input.params || {}), goal: input.params?.goal ?? input.goal } : input.params;
  const job = await expandJob(eff, policy, key, params, lang);
  if ((job.template === "bulk_translate" || job.template === "audit_all") && !job.count) {
    throw new CmsError("No entries match, so this job would have nothing to do.", 400);
  }
  return insertAgentJob(user, eff, policy, limits, {
    template: job.template, title: String(input.title || job.title), goal: job.goal, params: job.params,
    requiredLevel: job.requiredLevel, lang, threadId: input.threadId || null, budget: input.budget,
  });
}

/** The same checks and listing as starting a job, without starting it. */
export async function previewAgentJob(input: { template?: string; params?: any; lang?: string }): Promise<any> {
  const user = await requireUser();
  const { eff, policy, limits } = await jobPreconditions(user);
  const job = await expandJob(eff, policy, input.template, input.params, input.lang === "th" ? "th" : "en");
  return {
    template: job.template, title: job.title, requiredLevel: job.requiredLevel, count: job.count, items: job.items,
    estimatedTokens: job.estimatedTokens, tokenBudget: limits.agentJobTokenBudget,
  };
}

/**
 * "Continue in background": a conversation that stopped where it can resume
 * becomes a custom job that picks up from its checkpoint. The conversation
 * gives the checkpoint up, so the chat and the job can't both carry on.
 */
export async function createAgentJobFromThread(threadId: string, lang?: string): Promise<any> {
  assertNotActing("create background jobs");
  const user = await requireUser();
  const thread = await loadOwnedThread(threadId, user);
  const cp = parseCheckpoint(thread.checkpoint);
  if (!cp) throw new CmsError("This conversation has nothing to continue.", 409);
  if (thread.runState === "running") throw new CmsError("This conversation is still running.", 409);
  const { eff, policy, limits } = await jobPreconditions(user);
  if (thread.tenantKey && thread.tenantKey !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
  const firstAsk = cp.history.find((h) => h.kind === "user") as { text?: string } | undefined;
  const goal = String(firstAsk?.text || thread.title || "Continue the conversation").trim().slice(0, 8000);
  const job = await insertAgentJob(user, eff, policy, limits, {
    template: "custom", title: String(thread.title || goal), goal, params: {}, requiredLevel: policy.level,
    lang: lang === "th" || lang === "en" ? lang : cp.lang, threadId,
    // A job has no open editor to hand proposals to, so its draft tools write (within the owner's level).
    checkpoint: { ...cp, mode: "job", ref: { kind: "none" } },
  });
  await strapiBookkeeping(() => strapiAdapter.entries.update(AGENT_THREAD_UID, threadId, { checkpoint: null, runState: "done" }));
  return job;
}

export async function listAgentJobs(): Promise<any[]> {
  const user = await requireUser();
  const eff = await resolveEffectiveTenant(user.email);
  if (!eff) return [];
  const filter: NonNullable<EntryQuery["filter"]> = [{ field: "tenantKey", op: "eq", value: eff.key }];
  if (!isWorkspaceAdmin(eff, user.email)) filter.push({ field: "ownerEmail", op: "eq", value: user.email || "" });
  const { data } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(AGENT_JOB_UID, { filter, sort: "createdAt:DESC", pageSize: 100 }));
  return data.map(agentJobView);
}

export async function getAgentJob(id: string): Promise<any> {
  const user = await requireUser();
  return agentJobView(await loadJobForCaller(id, user));
}

/** Events after `after` (their seq), for polling, with the job's current state. */
export async function getAgentJobEvents(id: string, after: number): Promise<{ events: any[]; job: any }> {
  const user = await requireUser();
  const row = await loadJobForCaller(id, user);
  const events = (Array.isArray(row.events) ? row.events : []).filter((e: any) => Number(e?.seq) > after);
  return { events, job: agentJobView(row) };
}

const JOB_ACTIONS: JobControlAction[] = ["cancel", "pause", "resume", "answer"];
const JOB_ACTION_DONE: Record<JobControlAction, string> = { cancel: "cancelled", pause: "paused", resume: "resumed", answer: "answered" };
const JOB_STATE_TEXT: Record<string, string> = {
  queued: "is waiting to run", running: "is running", paused: "is paused", done: "has finished", failed: "has failed", cancelled: "was cancelled",
};

export async function controlAgentJob(id: string, action: string, answer?: string): Promise<any> {
  assertNotActing("change background jobs");
  if (!JOB_ACTIONS.includes(action as JobControlAction)) throw new CmsError("Unknown action", 404);
  const user = await requireUser();
  const row = await loadJobForCaller(id, user);
  const r = await controlJob(row.documentId, action as JobControlAction, answer);
  if (!r.ok) {
    const state = JOB_STATE_TEXT[r.job?.runState ?? row.runState] ?? `is ${row.runState}`;
    throw new CmsError(`This job ${state}, so it can't be ${JOB_ACTION_DONE[action as JobControlAction]}.`, 409);
  }
  await writeAudit(`agent_job_${action}`, AGENT_JOB_UID, row.documentId, user, row.tenantKey);
  return r.job;
}

/** For the jobs indicator: active, waiting for an answer, and failed in the last week. */
export async function agentJobsSummary(): Promise<{ active: number; waiting: number; failed: number }> {
  const jobs = await listAgentJobs();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    active: jobs.filter((j) => j.runState === "queued" || j.runState === "running").length,
    waiting: jobs.filter((j) => j.runState === "paused" && j.stateReason === "needs_input").length,
    failed: jobs.filter((j) => j.runState === "failed" && Date.parse(j.finishedAt || j.updatedAt || "") > weekAgo).length,
  };
}

/** Each workspace's concurrent-job limit for the worker's claim: 0 unless background jobs are on and the plan allows them. */
export async function agentJobCaps(): Promise<{ caps: Record<string, number>; defaultCap: number }> {
  const { byKey } = await refreshTenantCache();
  const caps: Record<string, number> = {};
  for (const [key, t] of byKey) caps[key] = t.features?.agent?.background ? planLimit(t.plan).agentConcurrentJobs : 0;
  return { caps, defaultCap: 0 };
}

/**
 * Runs `fn` as a background job's owner, or says why the job may no longer
 * act as them (lib/agent/jobs/owner.ts). Checked before every slice: the
 * tenant is re-read, the owner looked up again by email (same account id,
 * still active), and their live policy combined with the one saved when the
 * job was created. Inside `fn` there is no session: the scheduler's
 * credential authenticates, the acting session supplies the identity, and
 * governed.* fails closed on anything outside the owner's tenant.
 */
export async function runAsJobOwner<T>(
  job: AgentJobRow, fn: (owner: JobOwner) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: OwnerRefusal }> {
  const { engine, user, verdict } = await checkOwner(job);
  if (!verdict.ok) return verdict;
  if (!user?.email) return { ok: false, reason: "owner_revoked" };
  const policy = { ...verdict.policy, model: verdict.policy.model || process.env.LITELLM_MODEL || "webx-default" };
  const owner: JobOwner = { user, policy, lang: job.lang === "th" ? "th" : "en" };
  const value = await actAsOwner(engine, job.tenantKey, user, job.documentId, `job:${job.documentId}`, () => fn(owner));
  return { ok: true, value };
}

type OwnedRow = Pick<AgentJobRow, "tenantKey" | "ownerEmail" | "ownerUserId" | "engine" | "requiredLevel" | "policySnapshot">;

/** Whether a job or schedule may still act as its owner, with the facts that decided it (lib/agent/jobs/owner.ts). */
async function checkOwner(row: OwnedRow) {
  invalidateTenantCache();
  const tenant = await resolveTenantByKey(row.tenantKey);
  const engine: "strapi" | "wordpress" = tenant?.engine === "wordpress" ? "wordpress" : "strapi";
  const account: AdminUser | null = tenant ? await withEngineAdapter(engine, (a) => a.auth.findUserByEmail(row.ownerEmail)) : null;
  const user: CurrentUser | null = account ? { id: account.id, email: account.email, roles: account.roles, isSuperAdmin: false } : null;
  const live = user ? await resolveAgentPolicy(user) : null;
  const verdict = evaluateJobOwner(row, {
    tenant: tenant ? { key: tenant.key, engine, plan: tenant.plan, adminEmails: tenant.adminEmails, features: tenant.features } : null,
    account: account ? { id: account.id, email: account.email, active: account.isActive !== false } : null,
    livePolicy: live && live.level !== "off" ? jobPolicyOf(live) : null,
  });
  return { tenant, engine, user, verdict };
}

/** Runs `fn` in an acting session: the scheduler's credential authenticates, the owner's identity and tenant apply. */
async function actAsOwner<T>(engine: "strapi" | "wordpress", tenantKey: string, user: CurrentUser, jobId: string, actorRef: string, fn: () => Promise<T>): Promise<T> {
  const token = engine === "wordpress" ? await schedulerWpToken() : await schedulerStrapiToken();
  if (!token) throw new CmsError("No service credential is configured for background jobs", 500);
  return withServiceToken(token, () =>
    withActingSession({ engine, tenantKey, email: user.email!, user, jobId }, () => withAgentActor(actorRef, fn)));
}

// ---------- Agent schedules (Phase 9, M6) ----------
// A schedule starts a template job on a recurrence (lib/agent/recurrence.ts),
// with its owner's authority for AUTHORIZATION_DAYS after they last saved or
// turned it on. People manage schedules here; the scheduler's tick advances
// them through strapi-cms's compare-and-set endpoints
// (processAgentScheduleTick). The owner and the workspace's administrators can
// see a schedule. Only the owner can change it or turn it on, since that
// authorizes it again as them; an administrator can turn it off or delete it.

export type AgentScheduleInput = {
  name?: string; template?: string; params?: Record<string, any>; recurrence?: unknown; lang?: "en" | "th"; enabled?: boolean;
};

/** A schedule as the browser sees it: no saved policy or tick bookkeeping. */
function agentScheduleView(row: any): any {
  if (!row || typeof row !== "object") return row;
  const { policySnapshot, runSeq, countedJobId, ...rest } = row;
  return rest;
}

async function loadScheduleForCaller(id: string, user: CurrentUser): Promise<{ row: any; eff: Tenant; isOwner: boolean }> {
  const eff = await resolveEffectiveTenant(user.email);
  const row: any = await strapiBookkeeping(() => strapiAdapter.entries.get(AGENT_SCHEDULE_UID, id)).catch(() => null);
  const isOwner = (row?.ownerEmail || "").toLowerCase() === (user.email || "").toLowerCase();
  if (!row || !eff || row.tenantKey !== eff.key || !(isOwner || isWorkspaceAdmin(eff, user.email))) throw new CmsError("Unknown schedule", 404);
  return { row, eff, isOwner };
}

/** Everything a job needs, plus schedules turned on and a plan that includes them. */
async function schedulePreconditions(user: CurrentUser) {
  const pre = await jobPreconditions(user);
  if (!pre.limits.agentSchedules) throw new CmsError("Schedules need a paid plan.", 403);
  if (!pre.eff.features?.agent?.schedules) {
    throw new CmsError("Schedules are turned off for this workspace. A workspace administrator can turn them on in Agent settings.", 403);
  }
  return pre;
}

/** The same checks as starting the job now; the parameters are stored without listed entries, which each run lists again. */
async function checkSchedule(eff: Tenant, policy: AgentPolicy, input: AgentScheduleInput, lang: "en" | "th") {
  if (!isTemplateKey(input.template) || !TEMPLATES[input.template].schedulable) throw new CmsError("This kind of job can't be scheduled.", 400);
  let recurrence: Recurrence;
  try {
    recurrence = parseRecurrence(input.recurrence);
  } catch (e) {
    if (e instanceof RecurrenceError) throw new CmsError(e.message, 400);
    throw e;
  }
  const job = await expandJob(eff, policy, input.template, input.params, lang);
  const params: Record<string, any> = { ...parseTemplateParams(input.template, input.params) };
  if (input.template !== "custom" && input.params?.sinceLastRun) params.sinceLastRun = true;
  return { recurrence, job, params };
}

async function countActiveSchedules(tenantKey: string): Promise<number> {
  const { total } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(AGENT_SCHEDULE_UID, {
    pageSize: 1, filter: [{ field: "tenantKey", op: "eq", value: tenantKey }, { field: "enabled", op: "eq", value: true }],
  }));
  return total;
}

export async function listAgentSchedules(): Promise<any[]> {
  const user = await requireUser();
  const eff = await resolveEffectiveTenant(user.email);
  if (!eff) return [];
  const filter: NonNullable<EntryQuery["filter"]> = [{ field: "tenantKey", op: "eq", value: eff.key }];
  if (!isWorkspaceAdmin(eff, user.email)) filter.push({ field: "ownerEmail", op: "eq", value: user.email || "" });
  const { data } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(AGENT_SCHEDULE_UID, { filter, sort: "createdAt:DESC", pageSize: 100 }));
  return data.map(agentScheduleView);
}

export async function createAgentSchedule(input: AgentScheduleInput): Promise<any> {
  assertNotActing("create schedules");
  const user = await requireUser();
  const { eff, policy, limits } = await schedulePreconditions(user);
  const lang = input.lang === "th" ? "th" : "en";
  const { recurrence, job, params } = await checkSchedule(eff, policy, input, lang);
  const active = await countActiveSchedules(eff.key);
  if (active >= limits.agentSchedules) throw new CmsError(`This workspace already has ${active} active schedules, the most its plan allows.`, 429);
  const now = Date.now();
  const created: any = await strapiBookkeeping(() => strapiAdapter.entries.create(AGENT_SCHEDULE_UID, {
    tenantKey: eff.key, ownerEmail: user.email, ownerUserId: String(user.id), engine: eff.engine || "strapi",
    name: String(input.name || job.title).trim().slice(0, 120), template: job.template, params, lang, recurrence,
    enabled: true, nextRunAt: new Date(nextOccurrence(recurrence, now)).toISOString(), runSeq: 0, consecutiveFailures: 0,
    authorizedAt: new Date(now).toISOString(), authorizedUntil: authorizationUntil(now),
    requiredLevel: job.requiredLevel, policySnapshot: jobPolicyOf(policy),
  }));
  await writeAudit("agent_schedule_create", AGENT_SCHEDULE_UID, created?.documentId ?? null, user, eff.key);
  return agentScheduleView(created);
}

/**
 * `{ enabled: false }` alone turns a schedule off (its owner or a workspace
 * administrator). Anything else is the owner saving it, which also turns it
 * on and authorizes it for another AUTHORIZATION_DAYS.
 */
export async function updateAgentSchedule(id: string, input: AgentScheduleInput): Promise<any> {
  assertNotActing("change schedules");
  const user = await requireUser();
  const { row, eff, isOwner } = await loadScheduleForCaller(id, user);
  const seq = (Number(row.runSeq) || 0) + 1;

  if (input.enabled === false && Object.keys(input).every((k) => k === "enabled")) {
    const patch = { enabled: false, disabledReason: "user", disabledAt: new Date().toISOString(), runSeq: seq };
    await strapiBookkeeping(() => strapiAdapter.entries.update(AGENT_SCHEDULE_UID, row.documentId, patch));
    await writeAudit("agent_schedule_disable", AGENT_SCHEDULE_UID, row.documentId, user, eff.key);
    return agentScheduleView({ ...row, ...patch });
  }

  if (!isOwner) throw new CmsError("Only the person who created this schedule can change it or turn it on.", 403);
  const { policy, limits } = await schedulePreconditions(user);
  const merged: AgentScheduleInput = {
    name: input.name ?? row.name, template: input.template ?? row.template, params: input.params ?? row.params ?? {},
    recurrence: input.recurrence ?? row.recurrence, lang: input.lang ?? row.lang,
  };
  const lang = merged.lang === "th" ? "th" : "en";
  const { recurrence, job, params } = await checkSchedule(eff, policy, merged, lang);
  if (!row.enabled) {
    const active = await countActiveSchedules(eff.key);
    if (active >= limits.agentSchedules) throw new CmsError(`This workspace already has ${active} active schedules, the most its plan allows.`, 429);
  }
  const now = Date.now();
  const patch = {
    name: String(merged.name || job.title).trim().slice(0, 120), template: job.template, params, lang, recurrence,
    enabled: true, nextRunAt: new Date(nextOccurrence(recurrence, now)).toISOString(), runSeq: seq,
    consecutiveFailures: row.enabled ? Number(row.consecutiveFailures) || 0 : 0, disabledReason: null, disabledAt: null,
    authorizedAt: new Date(now).toISOString(), authorizedUntil: authorizationUntil(now),
    requiredLevel: job.requiredLevel, policySnapshot: jobPolicyOf(policy),
  };
  await strapiBookkeeping(() => strapiAdapter.entries.update(AGENT_SCHEDULE_UID, row.documentId, patch));
  await writeAudit("agent_schedule_update", AGENT_SCHEDULE_UID, row.documentId, user, eff.key);
  return agentScheduleView({ ...row, ...patch });
}

export async function deleteAgentSchedule(id: string): Promise<void> {
  assertNotActing("delete schedules");
  const user = await requireUser();
  const { row, eff } = await loadScheduleForCaller(id, user);
  await strapiBookkeeping(() => strapiAdapter.entries.remove(AGENT_SCHEDULE_UID, row.documentId));
  await writeAudit("agent_schedule_delete", AGENT_SCHEDULE_UID, row.documentId, user, eff.key);
}

/** "Run now": the owner starts the schedule's job at once. The schedule's own timing is unchanged. */
export async function runAgentScheduleNow(id: string): Promise<any> {
  assertNotActing("start jobs");
  const user = await requireUser();
  const { row, isOwner } = await loadScheduleForCaller(id, user);
  if (!isOwner) throw new CmsError("Only the person who created this schedule can run it.", 403);
  return createAgentJob({ template: row.template, params: row.params || {}, lang: row.lang === "th" ? "th" : "en", title: row.name });
}

/** The scheduler's tick: starts due schedules' jobs, and skips or turns off the rest (lib/agent/jobs/schedules.ts). */
export async function processAgentScheduleTick(): Promise<TickReport> {
  const owners = new Map<string, Awaited<ReturnType<typeof checkOwner>>>();
  return runScheduleTick({
    now: () => Date.now(),
    due: () => dueSchedules(),
    async owner(s) {
      const checked = await checkOwner(s);
      owners.set(s.documentId, checked);
      const t = checked.tenant;
      return { verdict: checked.verdict, schedulesOn: Boolean(t?.features?.agent?.schedules && planLimit(t.plan).agentSchedules) };
    },
    async lastJob(jobId) {
      const j: any = await strapiBookkeeping(() => strapiAdapter.entries.get(AGENT_JOB_UID, jobId)).catch(() => null);
      return j ? { runState: j.runState, outcome: j.outcome } : null;
    },
    async prepare(s, policy) {
      const { tenant, engine, user } = owners.get(s.documentId) ?? (await checkOwner(s));
      if (!tenant || !user?.email) return { disable: "owner_revoked" };
      const limits = planLimit(tenant.plan);
      const lang = s.lang === "th" ? "th" : "en";
      const params: Record<string, any> = { ...(s.params || {}) };
      if (params.sinceLastRun && s.lastRunAt) params.updatedSince = s.lastRunAt;
      const ref = `schedule:${s.documentId}`;
      return actAsOwner(engine, s.tenantKey, user, ref, ref, async (): Promise<Prepared> => {
        let job: ExpandedJob;
        try {
          job = await expandJob(tenant, policy, s.template, params, lang);
        } catch (e) {
          // The owner can no longer run this job as saved: its level, tools or content types.
          if (e instanceof CmsError && (e.status === 400 || e.status === 403)) return { disable: "policy_changed" };
          throw e;
        }
        if (job.template !== "custom" && !job.count) return { skip: "nothing_to_do" };
        const unfinished = (await countJobs(tenant.key, "queued")) + (await countJobs(tenant.key, "running")) + (await countJobs(tenant.key, "paused"));
        if (unfinished >= limits.agentQueuedJobs) return { skip: "plan_limit" };
        try {
          await checkAgentRunBudget(user);
        } catch (e) {
          if (e instanceof CmsError) return { skip: "plan_limit" };
          throw e;
        }
        return {
          job: {
            tenantKey: tenant.key, ownerEmail: s.ownerEmail, ownerUserId: s.ownerUserId, engine, template: job.template,
            title: s.name || job.title, goal: job.goal, params: job.params, lang, requiredLevel: job.requiredLevel,
            policySnapshot: policy, onQuestion: "auto", budget: { maxTokens: limits.agentJobTokenBudget, maxMinutes: limits.agentJobMaxMinutes },
          },
        };
      });
    },
    advance: (s, patch) => advanceSchedule(s.documentId, patch),
    disable: (s, reason, patch) => disableSchedule(s.documentId, reason, patch),
    async onStarted(s, jobId) {
      const owner = owners.get(s.documentId)?.user;
      if (!owner) return;
      await recordAgentRunStart(owner, `job:${jobId}`);
      await writeAudit("agent_schedule_run", AGENT_SCHEDULE_UID, s.documentId, owner, s.tenantKey);
    },
    async onDisabled(s, reason) {
      try {
        await strapiBookkeeping(() => strapiAdapter.entries.create(AUDIT_UID, {
          action: "agent_schedule_auto_disable", contentType: AGENT_SCHEDULE_UID, entryId: s.documentId,
          adminEmail: s.ownerEmail, tenantKey: s.tenantKey, at: new Date().toISOString(), actor: "system", targetRef: reason,
        }));
      } catch { /* audit only */ }
    },
  });
}

// ---------- Agent threads (Phase 8) ----------
// AGENT_THREAD_UID is a BOOKKEEPING_UID blocked outright from the generic
// entries route (see assertBookkeepingWriteAllowed above) — same reasoning
// as audit-log: writeAudit() is that uid's own dedicated writer, bypassing
// governed.create/update entirely. These five functions are agent-thread's
// equivalent, with their own OWNER check (not just tenant) on every read and
// write, since a thread can hold a specific editor's own in-progress draft
// conversation — not something every admin in the workspace should browse by
// default. lib/agent/threads.ts is a thin, message-trimming wrapper around
// these; it holds no Strapi access of its own.
export type AgentThreadInput = { tenantKey: string | null; title: string; context: Record<string, any> };
// "runState", not "status" — Strapi 5 reserves "status" as a system field
// (document draft/published state) on every content-manager collection type
// regardless of draftAndPublish, and 400s outright on a custom attribute
// using that name (found live testing this route: ValidationError "Invalid
// status" the moment a create/update payload set it) — see the schema's own
// comment.
export type AgentThreadPatch = { title?: string; messages?: any[]; runState?: string; lastRunId?: string; usage?: Record<string, any>; checkpoint?: unknown };

/** A thread as the browser sees it. The engine checkpoint (up to ~256KB, and
 * the model's working state rather than anything the UI renders) stays
 * server-side; only whether one exists is exposed, as `resumable`. */
export function agentThreadView(row: any): any {
  if (!row || typeof row !== "object") return row;
  const { checkpoint, ...rest } = row;
  return { ...rest, resumable: Boolean(checkpoint) };
}

async function loadOwnedThread(id: string, user: CurrentUser): Promise<any> {
  const row: any = await strapiBookkeeping(() => strapiAdapter.entries.get(AGENT_THREAD_UID, id)).catch(() => null);
  if (!row || (row.ownerEmail || "").toLowerCase() !== (user.email || "").toLowerCase()) {
    throw new CmsError("Unknown thread", 404);
  }
  return row;
}

export async function listAgentThreads(): Promise<any[]> {
  const user = await requireUser();
  const eff = await resolveEffectiveTenant(user.email);
  const filter: any[] = [{ field: "ownerEmail", op: "eq", value: user.email || "" }];
  if (eff) filter.push({ field: "tenantKey", op: "eq", value: eff.key });
  const { data } = await strapiBookkeeping(() => strapiAdapter.entries.list<any>(AGENT_THREAD_UID, { filter, sort: "updatedAt:DESC", pageSize: 100 }));
  return data.map(agentThreadView);
}

export async function getAgentThread(id: string): Promise<any> {
  const user = await requireUser();
  return loadOwnedThread(id, user);
}

export async function createAgentThread(input: AgentThreadInput): Promise<any> {
  const user = await requireUser();
  const eff = await resolveEffectiveTenant(user.email);
  if (eff && input.tenantKey && input.tenantKey !== eff.key) throw new CmsError("Cross-tenant operation not permitted", 403);
  return strapiBookkeeping(() => strapiAdapter.entries.create(AGENT_THREAD_UID, {
    tenantKey: input.tenantKey ?? eff?.key ?? null, ownerEmail: user.email, title: input.title || "New chat",
    context: input.context || {}, messages: [], runState: "idle",
  }));
}

export async function updateAgentThread(id: string, patch: AgentThreadPatch): Promise<void> {
  const user = await requireUser();
  await loadOwnedThread(id, user);
  await strapiBookkeeping(() => strapiAdapter.entries.update(AGENT_THREAD_UID, id, patch));
}

export async function deleteAgentThread(id: string): Promise<void> {
  const user = await requireUser();
  await loadOwnedThread(id, user);
  await strapiBookkeeping(() => strapiAdapter.entries.remove(AGENT_THREAD_UID, id));
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
 * actually gating their next create. Same scoping rule as every other
 * per-tenant governed call (e.g. complianceSecuritySignal): a workspace
 * admin can only see their own workspace's number, an unscoped admin can
 * see any. Previously this route had no auth check at all and trusted
 * ?tenant= outright — low severity (aggregate counts only, no PII) but
 * unscoped, so closed here rather than left as a standing gap. */
export async function contentUsageFor(tenantKey: string): Promise<{ contentTotal: number }> {
  const caller = await requireUser();
  const eff = await resolveEffectiveTenant(caller.email);
  assertCanActOnTenant(eff, tenantKey);
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
    me: async () => currentUser(),
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
      assertNotActing("manage users");
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
      assertNotActing("manage users");
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
  media: {
    // Media library gap (TOR — search/tag/reuse/crop/caption). `tenantKey`
    // only matters to the WordPress adapter (Strapi resolves its own
    // caller-tenant server-side via the admin bearer token — see
    // strapi-cms/src/api/media-meta) but resolving it once here, uniformly,
    // is simpler than duplicating resolveEffectiveTenant per call site.
    async upload(file: File): Promise<MediaAsset> {
      assertNotActing("upload media");
      const user = await requireUser();
      const eff = await resolveEffectiveTenant(user.email);
      return (await activeAdapter()).media.upload(file, eff?.key);
    },
    async list(opts?: { search?: string; page?: number; pageSize?: number }): Promise<MediaAssetList> {
      const user = await requireUser();
      const eff = await resolveEffectiveTenant(user.email);
      return (await activeAdapter()).media.list({ ...opts, tenantKey: eff?.key });
    },
    async update(id: string, patch: { caption?: string | null; alt?: string | null; tags?: string | null }): Promise<MediaAsset> {
      assertNotActing("change media");
      const user = await requireUser();
      const eff = await resolveEffectiveTenant(user.email);
      return (await activeAdapter()).media.update(id, patch, eff?.key);
    },
    async remove(id: string): Promise<void> {
      assertNotActing("delete media");
      const user = await requireUser();
      const eff = await resolveEffectiveTenant(user.email);
      return (await activeAdapter()).media.remove(id, eff?.key);
    },
  },

  async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
    const acting = assertActingUid(uid);
    if (GENERIC_ROUTE_READ_BLOCKED_UIDS.has(uid)) {
      throw new CmsError("This content type must be managed through its own screen, not read directly.", 403);
    }
    // Resolved via the REAL session adapter, deliberately NOT via `cms`
    // inside withContentAdapter's callback below — found live, this is why
    // review.review reads were completely unscoped by tenant regardless of
    // caller: for a BOOKKEEPING_UID, the `cms` the callback receives is
    // strapiAdapter running under strapiBookkeeping's own scheduler
    // credential (see withContentAdapter/strapiBookkeeping/withServiceToken),
    // so `cms.auth.me()` identified the SCHEDULER, not the real caller —
    // resolveEffectiveTenant(scheduler's email) is always null (the
    // scheduler is in no tenant's adminEmails), silently disabling both the
    // custom-role view check and any eff-based filter for every bookkeeping
    // type's reads. activeAdapter() here always reflects the genuine
    // ambient session, bookkeeping override or not.
    const user = await currentUser();
    const eff = user ? await resolveEffectiveTenant(user.email) : null;
    if (user) {
      const crp = await resolveCustomRolePermissions(user, eff, uid);
      if (crp && !crp.view) throw new CmsError("Your role does not permit viewing this content", 403);
    }
    return withContentAdapter(uid, async (cms) => {
      if (WP_SCOPED.has(uid)) {
        // No "eff -> pass through unfiltered" fallthrough — found live: a
        // WordPress admin whose own tenant hadn't resolved (e.g. no roster
        // match) saw every OTHER tenant's content unfiltered when browsing
        // Content, the opposite of media.list's own deliberate fail-closed
        // behavior for the identical "no tenant resolved" case (see
        // media-meta's controller). An unmatched sentinel key here becomes
        // wordpress.ts's own wtenant=-1 "match nothing" case, same as there.
        // withTenantFilter (see its own comment) strips any client-supplied
        // condition on this same field first — a naive spread-and-append
        // here is not actually safe against a crafted duplicate filter.
        const filter = withTenantFilter(query?.filter, "tenant.key", "eq", eff?.key ?? "__unscoped__");
        return cms.entries.list<T>(uid, { ...query, filter });
      }
      if (uid === REVIEW_UID) {
        // Same fail-closed convention as WP_SCOPED above, against the
        // relation's own numeric id (tenantStamp's own stamp shape) rather
        // than a wtenant string key — -1 matches no real tenant.
        const filter = withTenantFilter(query?.filter, "tenant.id", "eq", eff?.id ?? -1);
        return cms.entries.list<T>(uid, { ...query, filter });
      }
      if (RELATION_SCOPED_BOOKKEEPING_UIDS.has(uid) && eff) {
        // See RELATION_SCOPED_BOOKKEEPING_UIDS's own comment — unlike
        // REVIEW_UID/WP_SCOPED above, no filter is added at all when eff is
        // null (unscoped caller sees every tenant's rows, deliberately).
        const filter = withTenantFilter(query?.filter, "tenant.id", "eq", eff.id);
        return cms.entries.list<T>(uid, { ...query, filter });
      }
      if (uid === AUDIT_UID && eff) {
        // audit-log scopes by a plain tenantKey STRING (its schema has no
        // tenant relation), same shape WP_SCOPED uses — found live via the
        // real /audit screen (AuditLog.tsx): completely unfiltered before
        // this, every tenant's full audit trail (who did what, when, in
        // which workspace) visible to any authenticated admin.
        const filter = withTenantFilter(query?.filter, "tenantKey", "eq", eff.key);
        return cms.entries.list<T>(uid, { ...query, filter });
      }
      if (uid === PAGE_TEMPLATE_UID) {
        // Same "own or shared" semantics VisualBuilder.tsx's own client-side
        // .filter() already applies for display — ported server-side here so
        // a raw network response (not just the rendered UI) never carries
        // another workspace's private templates. A blank tenantKey means
        // "shared with every workspace" (see the schema's own comment) and
        // must always pass through, which a single relation-style eq filter
        // can't express — post-fetch filtering is the simplest correct fix.
        // Unscoped (eff null) sees everything unfiltered, same convention as
        // RELATION_SCOPED_BOOKKEEPING_UIDS above.
        const result = await cms.entries.list<any>(uid, query);
        if (!eff) return result;
        const data = result.data.filter((e: any) => !e.tenantKey || e.tenantKey === eff.key);
        return { ...result, data, total: data.length } as EntryList<T>;
      }
      if (uid === TENANT_UID && eff) {
        // A scoped caller may only ever see their OWN tenant row through the
        // generic route — unscoped (the scheduler, workspace-switcher tools)
        // keeps full cross-tenant reach, since that's its actual job. Found
        // live-auditing this session: nothing stopped a scoped caller from
        // substituting another tenant's key/id into the same request shape
        // several components already use for a legitimate self-lookup
        // (ContentBrowser.tsx, VisualBuilder.tsx, etc.) and getting back
        // that OTHER tenant's adminEmails, sso config, customRoleAssignments
        // — confirmed live: a crafted `key eq "<other tenant>"` filter
        // naively appended alongside this one returned BOTH tenants, not
        // just the caller's own (see withTenantFilter's own comment).
        const filter = withTenantFilter(query?.filter, "key", "eq", eff.key);
        return cms.entries.list<T>(uid, { ...query, filter });
      }
      if (acting && SCOPED.has(uid)) {
        // A background job's token is the scheduler's, which Strapi's hook
        // only narrows via the acting headers; filter here too (fail closed).
        const filter = withTenantFilter(query?.filter, "tenant.key", "eq", eff?.key ?? "__no_tenant__");
        return cms.entries.list<T>(uid, { ...query, filter });
      }
      return cms.entries.list<T>(uid, query);
    });
  },
  async get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null> {
    const acting = assertActingUid(uid);
    if (GENERIC_ROUTE_READ_BLOCKED_UIDS.has(uid)) {
      throw new CmsError("This content type must be managed through its own screen, not read directly.", 403);
    }
    // See governed.list's own comment just above on why this is resolved
    // via activeAdapter() and not the (possibly bookkeeping-overridden) `cms`
    // the withContentAdapter callback receives.
    const user = await currentUser();
    const eff = user ? await resolveEffectiveTenant(user.email) : null;
    if (user) {
      const crp = await resolveCustomRolePermissions(user, eff, uid);
      // Checked before the fetch below — a denied caller shouldn't pay for
      // (or receive the response of) a read they're not allowed to make.
      if (crp && !crp.view) throw new CmsError("Your role does not permit viewing this content", 403);
    }
    return withContentAdapter(uid, async (cms) => {
      const result: any = await cms.entries.get<T>(uid, id, opts);
      if (acting && result && SCOPED.has(uid) && (await trueOwnerOf(uid, id)) !== eff?.key) {
        // Fail closed: an entry a background job can't confirm as its tenant's is not returned.
        throw new CmsError("Cross-tenant operation not permitted", 403);
      }
      if (WP_SCOPED.has(uid) && result && eff && (acting ? result.tenantKey !== eff.key : result.tenantKey && result.tenantKey !== eff.key)) {
        throw new CmsError("Cross-tenant operation not permitted", 403);
      }
      if (uid === REVIEW_UID && result && eff) {
        // The content-manager single-document GET doesn't populate a plain
        // relation field into a comparable shape (it comes back as a bare
        // {count} summary — confirmed live), so the tenant match is checked
        // via a real filtered list call instead of trusting `result.tenant`
        // directly. One extra round trip, only on this uid, only on a
        // single-entry read (list already filters server-side above).
        const own = await cms.entries.list<any>(REVIEW_UID, {
          pageSize: 1, filter: [{ field: "documentId", op: "eq", value: id }, { field: "tenant.id", op: "eq", value: eff.id }],
        });
        if (!own.data.length) throw new CmsError("Cross-tenant operation not permitted", 403);
      }
      if (RELATION_SCOPED_BOOKKEEPING_UIDS.has(uid) && result && eff) {
        // Same relation-populate limitation REVIEW_UID's own branch above
        // documents — content-manager's single-document GET doesn't return
        // a comparable shape for a plain relation, so check via a filtered
        // list call instead of trusting `result.tenant` directly.
        const own = await cms.entries.list<any>(uid, {
          pageSize: 1, filter: [{ field: "documentId", op: "eq", value: id }, { field: "tenant.id", op: "eq", value: eff.id }],
        });
        if (!own.data.length) throw new CmsError("Cross-tenant operation not permitted", 403);
      }
      if (uid === AUDIT_UID && result && eff && result.tenantKey && result.tenantKey !== eff.key) {
        throw new CmsError("Cross-tenant operation not permitted", 403);
      }
      if (uid === PAGE_TEMPLATE_UID && result && eff && result.tenantKey && result.tenantKey !== eff.key) {
        throw new CmsError("Cross-tenant operation not permitted", 403); // blank tenantKey = shared, always readable
      }
      if (uid === TENANT_UID && result && eff && result.key !== eff.key) {
        throw new CmsError("Cross-tenant operation not permitted", 403);
      }
      return result;
    });
  },
  async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
    assertActingUid(uid);
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    await assertBookkeepingWriteAllowed(uid, null, eff, user);
    await enforceItemLimit(eff, uid);
    const crp = await resolveCustomRolePermissions(user, eff, uid);
    if (crp && !crp.create) throw new CmsError("Your role does not permit creating this content", 403);
    if (crp && !crp.embedCode && PAGE_LIKE_UIDS.has(uid) && hasEmbedBlock(data)) {
      throw new CmsError("Your role does not permit adding custom code blocks", 403);
    }
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
    assertActingUid(uid);
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    await assertBookkeepingWriteAllowed(uid, id, eff, user);
    const crp = await resolveCustomRolePermissions(user, eff, uid);
    if (crp && !crp.update) throw new CmsError("Your role does not permit updating this content", 403);
    if (crp && !crp.embedCode && PAGE_LIKE_UIDS.has(uid) && hasEmbedBlock(data)) {
      throw new CmsError("Your role does not permit adding custom code blocks", 403);
    }
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
    assertNotActing("delete content");
    const user = await requireUser();
    const eff = await resolveEffectiveTenant(user.email);
    await assertBookkeepingWriteAllowed(uid, id, eff, user);
    const crp = await resolveCustomRolePermissions(user, eff, uid);
    if (crp && !crp.delete) throw new CmsError("Your role does not permit deleting this content", 403);
    await withContentAdapter(uid, async (cms) => {
      await tenantGuard(uid, id, eff, cms);
      await cms.entries.remove(uid, id, opts);
    });
    await writeAudit("delete", uid, id, user, eff?.key ?? null);
  },
  async publish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
    assertNotActing("publish content");
    const user = await requireUser();
    await doPublish(uid, id, user, opts);
  },
  async unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
    assertNotActing("unpublish content");
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

// ReviewBoard.tsx's "Publish" action only appears once a review reaches
// `approved`, but that was UI-only — doPublish() itself never checked, so
// any publish-permitted user could hit Save/Publish directly and skip an
// in-progress review entirely, ignoring an "in_review"/"changes" state a
// reviewer explicitly hasn't cleared yet (found during the ORST/RoyalSociety
// TOR gap audit). Review rows are opt-in (created by EntryEditor.tsx's
// "submit for review" action, not for every entry — see api::review.review's
// own schema comment), so the fix must only gate content that actually HAS
// an engaged review, not require one for every publish everywhere.
// strapiBookkeeping (not activeAdapter/withContentAdapter) is deliberate:
// Review is Strapi-hosted data regardless of which engine the CALLING
// session is on — same reasoning as page-version/page-template. This check
// was always correctly engine-agnostic; ReviewBoard.tsx/EntryEditor.tsx's
// own reads and writes weren't, until REVIEW_UID joined BOOKKEEPING_UIDS
// above (see that constant's comment) — same fix, same reasoning. Fails
// OPEN on a lookup error (e.g.
// the scheduler token being briefly unavailable) — blocking every publish
// because a status check itself failed would be a far worse regression than
// the bypass this closes.
async function assertReviewApprovedIfEngaged(uid: string, id: string): Promise<void> {
  try {
    const { data } = await strapiBookkeeping(() =>
      strapiAdapter.entries.list<any>("api::review.review", {
        pageSize: 1, sort: "updatedAt:DESC",
        filter: [{ field: "documentRef", op: "eq", value: id }, { field: "contentType", op: "eq", value: uid }],
      })
    );
    const rv = data[0];
    if (rv && rv.stage !== "approved" && rv.stage !== "published") {
      throw new CmsError(`This entry has an in-progress review (${rv.stage}) — resolve it in Reviews before publishing`, 409);
    }
  } catch (e) {
    if (e instanceof CmsError) throw e;
    // Lookup itself failed (network/credential hiccup) — fail open.
  }
}

// Shared by the public publish() above and processDueReleases() below — the
// scheduler has no admin session, so it calls this directly with a synthetic
// system actor instead of going through requireUser(). `adapter` defaults to
// this session's own active adapter (unchanged behavior for the normal
// publish() path); the scheduler passes an explicit per-item adapter since
// one release can mix engines regardless of which one this session (if any)
// is authenticated against — see adapterFor above.
async function doPublish(uid: string, id: string, actor: CurrentUser, opts?: { locale?: string }, adapter?: CmsAdapter): Promise<void> {
  const eff = await resolveEffectiveTenant(actor.email);
  const crp = await resolveCustomRolePermissions(actor, eff, uid);
  if (crp && !crp.publish) throw new CmsError("Your role does not permit publishing this content", 403);
  await assertReviewApprovedIfEngaged(uid, id);
  const run = async (ad: CmsAdapter) => { await tenantGuard(uid, id, eff, ad); await ad.publish.publish(uid, id, opts); };
  // Mirrors withContentAdapter's own routing (see that function's header
  // comment) — without this, a bookkeeping uid (e.g. menu-item) published
  // under a WordPress-engine session's activeAdapter() would route through
  // the WordPress adapter, which doesn't know that uid, and fail. unpublish
  // (below) already does this correctly via withContentAdapter; this brings
  // publish() to parity, including the service-token credential elevation
  // (not just swapping which adapter object is used).
  if (adapter) await run(adapter);
  else if (BOOKKEEPING_UIDS.has(uid)) await strapiBookkeeping(() => run(strapiAdapter));
  else await run(await activeAdapter());
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
