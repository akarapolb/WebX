// Runs the conformance suite against the Rust engine's write API through
// createRustAdapter. Skipped unless CONFORMANCE_RUST_URL and
// CONFORMANCE_RUST_TOKEN are set, so `npm test` stays offline:
//
//   node rust-engine/tools/export-snapshot.mjs        (a Strapi with content)
//   webx-read-engine import --snapshot ... --db engine.db
//   webx-read-engine token --db engine.db --tenant dga      -> CONFORMANCE_RUST_TOKEN
//   webx-read-engine token --db engine.db --tenant pea      -> CONFORMANCE_RUST_OTHER_TOKEN (optional)
//   webx-read-engine --db engine.db --port 1338             -> CONFORMANCE_RUST_URL=http://localhost:1338
//
// CONFORMANCE_RUST_TENANT is the main token's tenant (default dga). It writes
// FAQ entries and an image prefixed "conf<time>" and removes them afterwards.
import { conformanceSuite } from "./suite";
import type { Side } from "./suite";
import { createRustAdapter } from "../../lib/cms/rust";

const url = process.env.CONFORMANCE_RUST_URL || "";
const token = process.env.CONFORMANCE_RUST_TOKEN || "";
const otherToken = process.env.CONFORMANCE_RUST_OTHER_TOKEN || "";
const tenant = process.env.CONFORMANCE_RUST_TENANT || "dga";
const configured = Boolean(url && token);

// the engine takes the token on every call, so there is no ambient session to switch
const side = (t: string): Side => ({ adapter: createRustAdapter({ baseUrl: url, token: () => t }), as: (fn) => fn() });

/** The public read API, as the build calls it (contract section 6), for any tenant key; no prefix reads every row. */
async function readAs(key: string, locale: string | undefined, prefix: string) {
  const q = `tenant=${encodeURIComponent(key)}&locale=${locale}&pagination[pageSize]=100` + (prefix ? `&filters[question][$startsWith]=${encodeURIComponent(prefix)}` : "");
  const r = await fetch(`${url}/api/faqs?${q}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`read API returned ${r.status}`);
  return (await r.json()).data ?? [];
}

conformanceSuite(
  {
    name: `Rust engine at ${url || "(not configured)"}`,
    uid: "api::faq.faq",
    textField: "question",
    numberField: "order",
    locales: ["th", "en"],
    main: side(token),
    other: otherToken ? side(otherToken) : undefined,
    readPublished: (_uid, locale, prefix) => readAs(tenant, locale, prefix),
    readPublishedAs: (key, _uid, locale, prefix) => readAs(key, locale, prefix),
    mainKey: tenant,
    // the media library (R4); files are served under the engine's own /uploads
    media: { fetchFile: (u) => fetch(u.startsWith("http") ? u : url + u, { cache: "no-store" }) },
  },
  { skip: configured ? undefined : "set CONFORMANCE_RUST_URL and CONFORMANCE_RUST_TOKEN to run against the Rust engine" },
);

