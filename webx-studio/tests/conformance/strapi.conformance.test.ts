// Runs the conformance suite against a live Strapi through the real
// strapiAdapter. Skipped unless CONFORMANCE_STRAPI_URL is set, so `npm test`
// stays offline. Needs a Strapi with the seeded demo tenants:
//
//   CONFORMANCE_STRAPI_URL=http://localhost:1340
//   CONFORMANCE_MAIN_EMAIL=dga-editor@dga.local   CONFORMANCE_MAIN_PASSWORD=...
//   CONFORMANCE_OTHER_EMAIL=pea-editor@pea.local  CONFORMANCE_OTHER_PASSWORD=...
//   CONFORMANCE_MAIN_TENANT=dga   (the main editor's tenant; the default)
//
// It writes FAQ entries prefixed "conf<time>" and removes them afterwards.
import "./strapi-env";
import { conformanceSuite } from "./suite";
import type { Side } from "./suite";
import { strapiAdapter } from "../../lib/cms/strapi";
import { strapiLogin, withServiceToken } from "../../lib/strapi";

const url = process.env.CONFORMANCE_STRAPI_URL || "";
const env = (k: string) => process.env[k] || "";
const tenant = env("CONFORMANCE_MAIN_TENANT") || "dga";
const configured = Boolean(url && env("CONFORMANCE_MAIN_EMAIL") && env("CONFORMANCE_MAIN_PASSWORD"));

const tokens: { main?: string; other?: string } = {};
async function login(email: string, password: string): Promise<string> {
  const r = await strapiLogin(email, password);
  if (!r.ok) throw new Error(`conformance login failed for ${email}: ${"status" in r ? r.status : "Strapi unreachable"}`);
  return r.token;
}
const side = (which: "main" | "other"): Side => ({
  adapter: strapiAdapter,
  as: (fn) => {
    const token = tokens[which];
    if (!token) throw new Error(`no ${which} session: setup did not log in`);
    return withServiceToken(token, fn);
  },
});

conformanceSuite(
  {
    name: `Strapi at ${url || "(not configured)"}`,
    uid: "api::faq.faq",
    textField: "question",
    numberField: "order",
    locales: ["th", "en"],
    main: side("main"),
    other: env("CONFORMANCE_OTHER_EMAIL") ? side("other") : undefined,
    async setup() {
      tokens.main = await login(env("CONFORMANCE_MAIN_EMAIL"), env("CONFORMANCE_MAIN_PASSWORD"));
      if (env("CONFORMANCE_OTHER_EMAIL")) tokens.other = await login(env("CONFORMANCE_OTHER_EMAIL"), env("CONFORMANCE_OTHER_PASSWORD"));
    },
    async readPublished(_uid, locale, prefix) {
      // The public read API, as the build calls it (contract section 6).
      const q = `tenant=${tenant}&locale=${locale}&pagination[pageSize]=100&filters[question][$startsWith]=${encodeURIComponent(prefix)}`;
      const r = await fetch(`${url}/api/faqs?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`read API returned ${r.status}`);
      return (await r.json()).data ?? [];
    },
  },
  { skip: configured ? undefined : "set CONFORMANCE_STRAPI_URL, CONFORMANCE_MAIN_EMAIL and CONFORMANCE_MAIN_PASSWORD to run against a live Strapi" },
);
