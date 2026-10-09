// Google fonts are picked by an admin and end up in a URL and a stylesheet, so
// most of these tests are about what must NOT get through.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  googleFamilyOf as mjsFamilyOf, FAMILY_RE as MJS_RE, parseGoogleCss, fetchFamilyBlocks, prepareFonts,
  themeGoogleFamilies as mjsThemeFamilies, fileNameFor, renderFontFace,
} from "../scripts/google-fonts.mjs";
import { googleFamilyOf, FAMILY_RE, sanitizeTheme, themeToCss, themeGoogleFamilies } from "./theme";

const GS = "https://fonts.gstatic.com/s/prompt/v12/";
const face = (subset: string, weight: number, file: string, range = "U+0E01-0E5B, U+200C-200D") => `/* ${subset} */
@font-face {
  font-family: 'Prompt';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(${GS}${file}.woff2) format('woff2');
  unicode-range: ${range};
}
`;
const SAMPLE = face("thai", 400, "a") + face("vietnamese", 400, "b") + face("latin", 400, "c", "U+0000-00FF") + face("latin-ext", 400, "d", "U+0100-02BA");

describe("family names", () => {
  test("the two copies of the rule agree (lib/theme.ts and scripts/google-fonts.mjs)", () => {
    assert.equal(FAMILY_RE.source, MJS_RE.source);
    for (const k of ["google:Prompt", "google:IBM Plex Sans Thai", 'google:Bad"; }', "plex-sans", "google:", "google:../x"]) {
      assert.equal(googleFamilyOf(k), mjsFamilyOf(k), k);
    }
  });

  test("accepts real family names, with spaces and digits", () => {
    assert.equal(googleFamilyOf("google:Prompt"), "Prompt");
    assert.equal(googleFamilyOf("google:IBM Plex Sans Thai"), "IBM Plex Sans Thai");
    assert.equal(googleFamilyOf("google:42dot Sans"), "42dot Sans");
  });

  test("rejects anything that could end a CSS string, a URL or a path", () => {
    for (const bad of [
      'google:Prompt"; } body{display:none', "google:Prompt') format('x'); } *{x:y", "google:Prompt;color:red",
      "google:../../etc/passwd", "google:a/b", "google:a\\b", "google:<script>", "google:url(//evil)", "google:",
      "google: Prompt", "google:" + "a".repeat(80), "google:Prompt\nbody{}", "Prompt", "google:Prompt{}", "google:Prompt:wght@900",
    ]) assert.equal(googleFamilyOf(bad), null, bad);
    assert.equal(googleFamilyOf(42), null);
    assert.equal(googleFamilyOf(undefined), null);
  });
});

describe("theme — Google fonts", () => {
  test("sanitizeTheme keeps a valid Google font and drops an injected one", () => {
    assert.equal(sanitizeTheme({ fonts: { display: "google:Prompt" } }).fonts?.display, "google:Prompt");
    assert.equal(sanitizeTheme({ fonts: { display: 'google:X"; }' } }).fonts, undefined);
  });

  test("the CSS keeps a Thai-capable bundled family as the fallback", () => {
    const css = themeToCss("orst", { fonts: { display: "google:Playfair Display", body: "google:Prompt" } });
    assert.ok(css.includes('--orst-font-display:"Playfair Display","Noto Serif Thai"'));
    assert.ok(css.includes('--orst-font-body:"Prompt","IBM Plex Sans Thai"'));
    for (const line of css.split("\n")) {
      assert.equal(line.split("{").length - 1, 1);
      assert.equal(line.split("}").length - 1, 1);
    }
  });

  test("themeGoogleFamilies lists the distinct, valid families only", () => {
    assert.deepEqual(themeGoogleFamilies({ fonts: { display: "google:Prompt", body: "google:Prompt" } }), ["Prompt"]);
    assert.deepEqual(themeGoogleFamilies({ fonts: { display: "noto-serif", body: "plex-sans" } }), []);
    assert.deepEqual(themeGoogleFamilies({ fonts: { display: 'google:Bad"x' } }), []);
    assert.deepEqual(themeGoogleFamilies(null), []);
    assert.deepEqual(mjsThemeFamilies({ fonts: { display: "google:Prompt", body: "google:Anuphan" } }), ["Prompt", "Anuphan"]);
  });
});

describe("parseGoogleCss", () => {
  test("keeps only the thai, latin and latin-ext subsets", () => {
    const blocks = parseGoogleCss(SAMPLE);
    assert.deepEqual(blocks.map((b: { subset: string }) => b.subset).sort(), ["latin", "latin-ext", "thai"]);
    assert.equal(blocks.find((b: { subset: string }) => b.subset === "thai")?.url, GS + "a.woff2");
  });

  test("ignores a font file that is not on fonts.gstatic.com", () => {
    const evil = SAMPLE.replace(GS + "a.woff2", "https://evil.example/a.woff2").replace(GS + "c.woff2", "http://fonts.gstatic.com/c.woff2");
    assert.deepEqual(parseGoogleCss(evil).map((b: { subset: string }) => b.subset), ["latin-ext"]);
  });

  test("drops a unicode-range that is not a plain range list", () => {
    const css = face("thai", 400, "a", "U+0E01-0E5B } body{x:y");
    assert.equal(parseGoogleCss(css)[0]?.unicodeRange ?? "", "");
  });

  test("skips italic faces", () => {
    assert.equal(parseGoogleCss(SAMPLE.replace(/font-style: normal/g, "font-style: italic")).length, 0);
  });
});

type Reply = { ok: boolean; status: number; text?: string; body?: Uint8Array };
const fakeFetch = (handler: (url: string) => Reply) => (async (url: string) => {
  const r = handler(String(url));
  return { ok: r.ok, status: r.status, text: async () => r.text ?? "", arrayBuffer: async () => (r.body ?? new Uint8Array([1, 2, 3])).buffer } as unknown as Response;
}) as unknown as typeof fetch;

describe("fetchFamilyBlocks", () => {
  test("falls back to one request per weight when Google answers 400 for the set", async () => {
    const asked: string[] = [];
    const f = fakeFetch((url) => {
      asked.push(decodeURIComponent(url.split("wght@")[1].split("&")[0]));
      if (url.includes("wght@300;400;500;600;700")) return { ok: false, status: 400 };
      if (url.includes("wght@400&")) return { ok: true, status: 200, text: face("thai", 400, "w4") };
      if (url.includes("wght@700&")) return { ok: true, status: 200, text: face("thai", 700, "w7") };
      return { ok: false, status: 400 };
    });
    const blocks = await fetchFamilyBlocks("Pacifico", { fetchImpl: f });
    assert.deepEqual(blocks.map((b: { weight: number }) => b.weight).sort(), [400, 700]);
    assert.equal(asked[0], "300;400;500;600;700");
  });

  test("throws for a family Google does not know, and for a Google outage", async () => {
    await assert.rejects(fetchFamilyBlocks("NoSuchFont", { fetchImpl: fakeFetch(() => ({ ok: false, status: 400 })) }), /no family named/);
    await assert.rejects(fetchFamilyBlocks("Prompt", { fetchImpl: fakeFetch(() => ({ ok: false, status: 503 })) }), /503/);
  });

  test("never sends an invalid family to Google", async () => {
    let called = 0;
    await assert.rejects(fetchFamilyBlocks('x"; y', { fetchImpl: fakeFetch(() => { called++; return { ok: true, status: 200, text: SAMPLE }; }) }), /invalid family/);
    assert.equal(called, 0);
  });
});

describe("prepareFonts", () => {
  test("downloads the files, writes a same-origin fonts.css, and one bad family does not sink the rest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "gfonts-"));
    try {
      const f = fakeFetch((url) => {
        if (url.startsWith("https://fonts.googleapis.com/")) {
          return url.includes("Prompt") ? { ok: true, status: 200, text: SAMPLE } : { ok: false, status: 400 };
        }
        return { ok: true, status: 200, body: new Uint8Array([7, 7, 7, 7]) };
      });
      const res = await prepareFonts(["Prompt", "Nope"], dir, { fetchImpl: f });
      assert.deepEqual(res.ok, ["Prompt"]);
      assert.equal(res.failed.length, 1);
      assert.equal(res.failed[0].family, "Nope");
      const css = await readFile(path.join(dir, "fonts.css"), "utf8");
      assert.ok(css.includes("font-family: 'Prompt'"));
      assert.ok(css.includes("url('/fonts/google/prompt-400-thai-"));
      assert.doesNotMatch(css, /fonts\.gstatic\.com|https?:\/\//);   // no third-party URL reaches a visitor
      const files = (await readdir(dir)).filter((n) => n.endsWith(".woff2"));
      assert.equal(files.length, 3);                                    // thai, latin, latin-ext
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test("renderFontFace and fileNameFor produce safe, content-addressed names", () => {
    const b = { subset: "thai", weight: 400, url: GS + "a.woff2", unicodeRange: "U+0E01-0E5B" };
    assert.match(fileNameFor("IBM Plex Sans Thai", b), /^ibm-plex-sans-thai-400-thai-[0-9a-f]{8}\.woff2$/);
    assert.ok(renderFontFace("Prompt", b, "x.woff2").includes("unicode-range: U+0E01-0E5B;"));
  });
});
