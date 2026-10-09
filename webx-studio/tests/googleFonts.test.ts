import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { compactCatalog, compactGoogleMetadata, getGoogleFontCatalog, resetCatalogCache, googleFamilyOf, googleKey, FAMILY_RE, fontSuggestion, FONT_ALIASES } from "../lib/googleFonts";
import { compactTheme } from "../lib/theme";

const entry = (family: string, o: Record<string, unknown> = {}) => ({
  id: family.toLowerCase().replace(/ /g, "-"), family, subsets: ["latin"], weights: [400, 700], category: "sans-serif", type: "google", ...o,
});

describe("compactCatalog", () => {
  test("keeps Google families only and drops anything with an unexpected shape", () => {
    const list = compactCatalog([
      entry("Roboto"),
      entry("Material Icons", { type: "icons" }),
      entry("Bad Name", { family: 'Bad"; Name' }),
      entry("No Category", { category: "weird" }),
      { nonsense: true }, null, "x",
    ]);
    assert.deepEqual(list.map((f) => f.f), ["Roboto"]);
  });

  test("flags Thai support and lists Thai-capable fonts first", () => {
    const list = compactCatalog([
      entry("Aaa Latin Only"),
      entry("Prompt", { subsets: ["latin", "thai"], weights: [300, 400, 700] }),
      entry("Zzz Thai", { subsets: ["thai"] }),
    ]);
    assert.deepEqual(list.map((f) => [f.f, f.t]), [["Prompt", 1], ["Zzz Thai", 1], ["Aaa Latin Only", 0]]);
    assert.deepEqual(list[0].w, [300, 400, 700]);
  });

  test("returns an empty list for a non-array", () => {
    assert.deepEqual(compactCatalog({}), []);
    assert.deepEqual(compactCatalog(undefined), []);
  });
});

describe("family keys", () => {
  test("round-trip, and reject injection", () => {
    assert.equal(googleFamilyOf(googleKey("Noto Sans Thai")), "Noto Sans Thai");
    assert.equal(googleFamilyOf('google:X"; }'), null);
    assert.equal(googleFamilyOf("plex-sans"), null);
    assert.ok(FAMILY_RE.test("IBM Plex Sans Thai"));
  });

  test("a Google font survives compactTheme; a default one is dropped", () => {
    assert.equal(compactTheme("orst", { fonts: { display: "google:Prompt" } }).fonts?.display, "google:Prompt");
    assert.equal(compactTheme("orst", { fonts: { display: "noto-serif", body: "plex-sans" } }).fonts, undefined);
  });
});

const meta = (family: string, o: Record<string, unknown> = {}) => ({
  family, category: "Sans Serif", subsets: ["menu", "latin"], fonts: { "400": {}, "400i": {}, "700": {} }, popularity: 100, ...o,
});

describe("compactGoogleMetadata (Google's own catalogue)", () => {
  test("maps categories, keeps upright weights only, and flags Thai", () => {
    const [f] = compactGoogleMetadata({ familyMetadataList: [meta("Prompt", { subsets: ["latin", "thai"], fonts: { "100": {}, "400": {}, "400i": {}, "900": {} }, category: "Sans Serif" })] });
    assert.deepEqual(f, { f: "Prompt", c: "sans-serif", t: 1, w: [100, 400, 900] });
  });

  test("drops unknown categories, unsafe names and malformed entries", () => {
    const list = compactGoogleMetadata({ familyMetadataList: [meta("Good"), meta("Odd", { category: "Weird" }), meta('Bad"; x'), null, "x"] });
    assert.deepEqual(list.map((f) => f.f), ["Good"]);
    assert.deepEqual(compactGoogleMetadata({}), []);
    assert.deepEqual(compactGoogleMetadata(null), []);
  });

  test("lists Thai-capable first, then the most popular (rank 1 = most used)", () => {
    const list = compactGoogleMetadata({ familyMetadataList: [
      meta("Rare", { popularity: 900 }), meta("Popular", { popularity: 2 }), meta("ThaiRare", { subsets: ["thai"], popularity: 800 }),
    ] });
    assert.deepEqual(list.map((f) => f.f), ["ThaiRare", "Popular", "Rare"]);
  });
});

describe("getGoogleFontCatalog", () => {
  beforeEach(() => resetCatalogCache());
  const GOOGLE_BODY = ")]}'\n" + JSON.stringify({ familyMetadataList: [meta("Prompt", { subsets: ["thai"] }), meta("Roboto")] });
  type R = { ok: boolean; status: number; json?: unknown; text?: string };
  const router = (routes: { google?: R; fontsource?: R }, seen: string[] = []) => (async (url: string) => {
    const isGoogle = String(url).includes("fonts.google.com");
    seen.push(isGoogle ? "google" : "fontsource");
    const r = (isGoogle ? routes.google : routes.fontsource) ?? { ok: false, status: 503 };
    return { ok: r.ok, status: r.status, json: async () => r.json, text: async () => r.text ?? "" } as unknown as Response;
  }) as unknown as typeof fetch;

  test("uses Google's catalogue first (stripping its anti-hijacking prefix)", async () => {
    const seen: string[] = [];
    const fonts = await getGoogleFontCatalog(router({ google: { ok: true, status: 200, text: GOOGLE_BODY } }, seen));
    assert.deepEqual(fonts.map((f) => f.f), ["Prompt", "Roboto"]);
    assert.deepEqual(seen, ["google"]);
  });

  test("falls back to Fontsource when Google's catalogue is unavailable", async () => {
    const seen: string[] = [];
    const fonts = await getGoogleFontCatalog(router({ fontsource: { ok: true, status: 200, json: [entry("Lato")] } }, seen));
    assert.deepEqual(fonts.map((f) => f.f), ["Lato"]);
    assert.deepEqual(seen, ["google", "fontsource"]);
  });

  test("fetches once and then serves from the cache", async () => {
    const seen: string[] = [];
    const f = router({ google: { ok: true, status: 200, text: GOOGLE_BODY } }, seen);
    await getGoogleFontCatalog(f);
    await getGoogleFontCatalog(f);
    assert.equal(seen.length, 1);
  });

  test("throws when every source is down and nothing is cached", async () => {
    await assert.rejects(getGoogleFontCatalog(router({})), /503/);
  });

  test("keeps serving the old list when the sources have a bad moment later", async () => {
    await getGoogleFontCatalog(router({ google: { ok: true, status: 200, text: GOOGLE_BODY } }));
    const failing = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    assert.equal((await getGoogleFontCatalog(failing)).length, 2);
  });
});

describe("fontSuggestion — substitutes for fonts that cannot be hosted", () => {
  test("Calibri → Carlito, Times New Roman → Tinos, Cambria → Caladea (metric-compatible)", () => {
    assert.deepEqual(fontSuggestion("calibri"), { typed: "Calibri", kind: "metric", families: ["Carlito"] });
    assert.deepEqual(fontSuggestion("Times New Roman")?.families, ["Tinos"]);
    assert.deepEqual(fontSuggestion("arial")?.families, ["Arimo"]);
    assert.deepEqual(fontSuggestion("cambria")?.families, ["Caladea"]);
    assert.equal(fontSuggestion("georgia")?.kind, "metric");
  });

  test("TH Sarabun New → Sarabun, and Angsana New offers several Thai serifs (no exact twin)", () => {
    assert.deepEqual(fontSuggestion("TH Sarabun New"), { typed: "TH Sarabun New", kind: "similar", families: ["Sarabun"] });
    const a = fontSuggestion("angsana new");
    assert.equal(a?.kind, "similar");
    assert.ok(a!.families.includes("Trirong") && a!.families.includes("Noto Serif Thai"));
  });

  test("matches while typing, ignores case and extra spaces, but not 1–2 letters", () => {
    assert.equal(fontSuggestion("  CALIB  ")?.families[0], "Carlito");
    assert.equal(fontSuggestion("times new")?.families[0], "Tinos");
    assert.equal(fontSuggestion("ca"), null);
    assert.equal(fontSuggestion(""), null);
  });

  test("says nothing for a real catalogue font or an unknown name", () => {
    assert.equal(fontSuggestion("prompt"), null);
    assert.equal(fontSuggestion("zzzzfont"), null);
  });

  test("only offers substitutes the catalogue actually has", () => {
    assert.equal(fontSuggestion("calibri", new Set(["Roboto"])), null);
    assert.deepEqual(fontSuggestion("angsana", new Set(["Trirong", "Pridi"]))?.families, ["Trirong", "Pridi"]);
  });

  test("every substitute is a family name the site would accept", () => {
    for (const a of FONT_ALIASES) for (const f of a.families) assert.ok(FAMILY_RE.test(f), f);
  });
});
