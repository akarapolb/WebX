// Shared constants/helpers across all 3 suites. Kept intentionally small —
// each suite owns its own assertions; this just avoids repeating base URLs
// and the couple of credential/env lookups every suite needs.
export const PUBLIC_SITE = process.env.PUBLIC_SITE_URL || "http://localhost:8095";
export const WEBX_STUDIO = process.env.WEBX_STUDIO_URL || "http://localhost:3000";
export const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
export const WORDPRESS_URL = process.env.WORDPRESS_URL || "http://localhost:8081";

// Pages known to exist per tenant today (Phase 10). If a page gets added or
// renamed, update this list — the public-site suite iterates it, so a
// stale entry here silently stops testing the real site rather than
// failing loudly, which is why it's kept in one obvious place.
export const TENANT_PAGES: Record<string, string[]> = {
  orst: ["", "/about", "/dictionary", "/news", "/publications", "/services", "/knowledge", "/contact"],
  royalsociety: ["", "/about", "/knowledge", "/services", "/publications", "/activities", "/contact"],
};

// A leftover bracketed placeholder (e.g. "[ปีงบประมาณ]") is the one class of
// defect Phase 9/10 explicitly promised not to ship silently — anything
// matching this on a rendered page is worth failing loudly on, with the
// narrow exception of the ITA-document list's tag/date fields, which are
// deliberately left blank (not bracketed) rather than fabricated, so they
// don't trip this check at all.
export const PLACEHOLDER_PATTERN = /\[[^\]]{3,}\]/;

export const WP_ADMIN_USER = process.env.WP_ADMIN_USER || "wpadmin";
export const WP_ADMIN_APP_PASSWORD = process.env.WP_ADMIN_APP_PASSWORD || "";

// The seeded scheduler service account (strapi-cms/src/seed/seed.ts's
// seedScheduler) — a real Strapi super-admin, already used server-side by
// webx-studio's own governance.ts for exactly this "unscoped admin" role.
// Reused here rather than provisioning a dedicated e2e account: it's the
// one Strapi login this repo already guarantees exists in any dev setup.
export const STRAPI_SCHEDULER_EMAIL = process.env.STRAPI_SCHEDULER_EMAIL || "scheduler@webx.local";
export const STRAPI_SCHEDULER_PASSWORD = process.env.STRAPI_SCHEDULER_PASSWORD || "";

// The seeded dga tenant editor (strapi-cms/src/seed/seed.ts, dga's own
// adminEmails) — agent.spec.ts needs a real TENANT-SCOPED session, not the
// scheduler above: governance.ts's resolveAgentPolicy always resolves an
// unscoped/super-admin session to level "off" (reason "unscoped") by
// design, since there's no single workspace whose admin could have granted
// it a policy — the scheduler account can never exercise a real agent run.
export const DGA_EDITOR_EMAIL = process.env.DGA_EDITOR_EMAIL || "dga-editor@dga.local";
export const DGA_EDITOR_PASSWORD = process.env.DGA_EDITOR_PASSWORD || "";

// The mock LLM server's port (webx-studio/tests/harness/mockLlmServer.ts) —
// agent.spec.ts starts that process itself, but the ALREADY-RUNNING webx-studio dev server must have been
// started with LITELLM_URL pointing at this same port (env vars in
// lib/llm.ts are read once at module load, not per-request — see
// e2e/README.md's Suite 5 section for the exact startup command).
export const MOCK_LITELLM_PORT = Number(process.env.MOCK_LITELLM_PORT || 4010);
