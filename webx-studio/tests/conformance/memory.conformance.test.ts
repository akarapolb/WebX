// Runs the conformance suite against the in-memory reference engine. This is
// the test of the suite itself: if a case here fails, the case (or the
// reference engine) is wrong, not a real CMS.
import { conformanceSuite } from "./suite";
import { createMemoryEngine } from "./memory-adapter";

const uid = "api::faq.faq";
const engine = createMemoryEngine({ uid, pluralName: "faqs", required: ["question"], locales: ["th", "en"] });
const side = (tenant: string) => ({ adapter: engine.adapterFor(tenant), as: <T>(fn: () => Promise<T>) => fn() });

conformanceSuite({
  name: "in-memory reference engine",
  uid,
  textField: "question",
  numberField: "order",
  locales: ["th", "en"],
  main: side("dga"),
  other: side("pea"),
  readPublished: async (u, locale, prefix) => engine.readPublished("dga", u, locale ?? "th", "question", prefix),
  // the reference has no registry: a key nobody has simply has no rows (decision D9)
  readPublishedAs: async (key, u, locale, prefix) => engine.readPublished(key, u, locale ?? "th", "question", prefix),
  mainKey: "dga",
  media: { fetchFile: async (url) => engine.serve(url) },
});
