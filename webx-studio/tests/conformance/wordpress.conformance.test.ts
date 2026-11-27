// Runs the conformance suite against a live WordPress through the real
// wordpressAdapter. Skipped unless CONFORMANCE_WP_URL is set, so `npm test`
// stays offline. Needs WordPress with WebX's mu-plugins (wordpress/), the
// wtenant terms of two tenants, an editor of each with an application
// password, and the Strapi that WordPress asks which tenant an editor belongs
// to (STRAPI_INTERNAL_URL and WEBX_INTERNAL_SECRET on the WordPress side;
// Strapi's seed lists orst-editor@orst.local and
// royalsociety-editor@royalsociety.local as those tenants' admins):
//
//   CONFORMANCE_WP_URL=http://localhost:8081/wp-json
//   CONFORMANCE_WP_MAIN_USER=orst-editor           CONFORMANCE_WP_MAIN_APP_PASSWORD=...
//   CONFORMANCE_WP_OTHER_USER=royalsociety-editor  CONFORMANCE_WP_OTHER_APP_PASSWORD=...
//   CONFORMANCE_WP_MAIN_TENANT=orst  CONFORMANCE_WP_OTHER_TENANT=royalsociety   (the defaults)
//
// CI runs it in the conformance-wordpress job. It writes timeline events and
// an image prefixed "conf<time>" and removes them afterwards.
//
// WordPress has no tenant of its own: governance.ts stamps one on every write
// and filters every list by it (WP_SCOPED), and passes the tenant key to the
// media calls. Each side below does the same, so the suite sees the adapter as
// Studio uses it; what WordPress itself does not enforce shows up as a gap.
import "./wordpress-env";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { conformanceSuite, PNG_1X1 } from "./suite";
import type { Side } from "./suite";
import type { CmsAdapter } from "../../lib/cms/types";
import { wordpressAdapter } from "../../lib/cms/wordpress";
import { wordpressLogin } from "../../lib/wordpress";
import { withServiceToken } from "../../lib/strapi";

const url = (process.env.CONFORMANCE_WP_URL || "").replace(/\/$/, "");
const env = (k: string) => process.env[k] || "";
const MAIN = env("CONFORMANCE_WP_MAIN_TENANT") || "orst";
const OTHER = env("CONFORMANCE_WP_OTHER_TENANT") || "royalsociety";
const configured = Boolean(url && env("CONFORMANCE_WP_MAIN_USER") && env("CONFORMANCE_WP_MAIN_APP_PASSWORD"));
const UID = "wp:timeline";
const REST_BASE = "timeline-event";

const tokens: { main?: string; other?: string } = {};
async function login(user: string, appPassword: string): Promise<string> {
  const r = await wordpressLogin(user, appPassword);
  if (!r.ok) throw new Error(`conformance login failed for ${user}: ${"status" in r ? r.status : "WordPress unreachable"}`);
  return r.token;
}

/** The adapter as governance.ts drives it for one tenant's editor. */
function scoped(tenant: string): CmsAdapter {
  const a = wordpressAdapter;
  return {
    ...a,
    entries: {
      ...a.entries,
      create: (uid, data, opts) => a.entries.create(uid, { tenant, ...data }, opts),
      list: (uid, q) => a.entries.list(uid, { ...q, filter: [...(q?.filter ?? []), { field: "tenant.key", op: "eq", value: tenant }] }),
    },
    media: {
      ...a.media,
      upload: (file) => a.media.upload(file, tenant),
      list: (q) => a.media.list({ ...q, tenantKey: tenant }),
    },
  };
}

const side = (which: "main" | "other", tenant: string): Side => ({
  adapter: scoped(tenant),
  as: (fn) => {
    const token = tokens[which];
    if (!token) throw new Error(`no ${which} session: setup did not log in`);
    return withServiceToken(token, fn);
  },
});

let mainTerm: number | undefined;
/** The main tenant's wtenant term id, as the public site looks it up. */
async function termOf(tenant: string): Promise<number> {
  const r = await fetch(`${url}/wp/v2/wtenant?slug=${encodeURIComponent(tenant)}`, { cache: "no-store" });
  const [t] = r.ok ? await r.json() : [];
  if (!t?.id) throw new Error(`no wtenant term for ${tenant} (status ${r.status})`);
  return t.id;
}

conformanceSuite(
  {
    name: `WordPress at ${url || "(not configured)"}`,
    uid: UID,
    textField: "title",
    numberField: "order",
    // no locales: WordPress keeps English in sibling fields, not per-locale rows (contract section 3)
    main: side("main", MAIN),
    other: env("CONFORMANCE_WP_OTHER_USER") ? side("other", OTHER) : undefined,
    async setup() {
      tokens.main = await login(env("CONFORMANCE_WP_MAIN_USER"), env("CONFORMANCE_WP_MAIN_APP_PASSWORD"));
      if (env("CONFORMANCE_WP_OTHER_USER")) tokens.other = await login(env("CONFORMANCE_WP_OTHER_USER"), env("CONFORMANCE_WP_OTHER_APP_PASSWORD"));
      mainTerm = await termOf(MAIN);
    },
    async readPublished(_uid, _locale, prefix) {
      // what a visitor's request gets: published posts only, no credential
      const q = `wtenant=${mainTerm}&per_page=100&search=${encodeURIComponent(prefix)}`;
      const r = await fetch(`${url}/wp/v2/${REST_BASE}?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`read API returned ${r.status}`);
      return ((await r.json()) as any[]).map((p) => ({ ...p, title: p.title?.rendered ?? "" }));
    },
    media: {
      tenantKey: MAIN,
      otherTenantKey: OTHER,
      fetchFile: (u) => fetch(u.startsWith("http") ? u : url.replace(/\/wp-json$/, "") + u, { cache: "no-store" }),
    },
    // What WordPress does not do yet, as its first run in CI showed (2026-11-27). Each still runs, as a TODO.
    gaps: {
      "update-draft": "WordPress keeps one copy of a post: an edit through the REST API changes a published post at once, where the contract keeps the edit as a draft until the next publish (section 8)",
      list: "the adapter passes WordPress only the tenant, a search term, a status, a sort by title or date, and the page (contract section 8): field filters such as eq, ne and contains are dropped, so a list holds every entry of the tenant",
      validation: "WordPress publishes an entry with no title: only Studio's own form asks for one",
      // media-isolation was a gap until 2026-11-27, when custom-role-enforcement.php began scoping media writes by tenant
    },
  },
  { skip: configured ? undefined : "set CONFORMANCE_WP_URL, CONFORMANCE_WP_MAIN_USER and CONFORMANCE_WP_MAIN_APP_PASSWORD to run against a live WordPress" },
);

// WordPress only (the shared suite has no way to ask): an image's tenant is its uploader's. WordPress stamps it as the
// upload is made, and refuses a tag naming another tenant, so an editor cannot put an image into someone else's library.
describe("WordPress media: an image stays in its uploader's tenant", {
  skip: configured && env("CONFORMANCE_WP_OTHER_USER") ? undefined : "needs a live WordPress and both editors",
}, () => {
  before(async () => {
    tokens.main ??= await login(env("CONFORMANCE_WP_MAIN_USER"), env("CONFORMANCE_WP_MAIN_APP_PASSWORD"));
    tokens.other ??= await login(env("CONFORMANCE_WP_OTHER_USER"), env("CONFORMANCE_WP_OTHER_APP_PASSWORD"));
  });

  it("an upload asked to be tagged for another tenant still belongs to the uploader's", async () => {
    const run = `confwp${Date.now().toString(36)}`;
    const as = <T>(who: "main" | "other", fn: () => Promise<T>) => withServiceToken(tokens[who]!, fn);
    // the adapter uploads, then tags the image with the tenant it is given: here the other one
    const a = await as("main", () => wordpressAdapter.media.upload(new File([PNG_1X1], `${run}.png`, { type: "image/png" }), OTHER));
    try {
      const mine = await as("main", () => wordpressAdapter.media.list({ search: run, tenantKey: MAIN }));
      const theirs = await as("other", () => wordpressAdapter.media.list({ search: run, tenantKey: OTHER }));
      assert.equal(mine.total, 1, "the image is in the uploader's library");
      assert.equal(theirs.total, 0, "and not in the tenant the request named");
    } finally {
      await as("main", () => wordpressAdapter.media.remove(String(a.id))).catch(() => {});
    }
  });
});
