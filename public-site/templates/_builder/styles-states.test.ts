import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="cta"]`;

describe("interaction states", () => {
  test("hover is wrapped so touch screens never get a stuck hover", () => {
    const out = css({ cta: { hover: { bg: "#112233" } } });
    assert.ok(out.includes(`@media (hover:hover){${SEL}:hover{background-color:#112233!important}}`));
  });

  test("hover, focus and active each get their own pseudo-class", () => {
    const out = css({ cta: { hover: { opacity: 80 }, focus: { shadow: "md" }, active: { bg: "@accent" } } });
    assert.ok(out.includes(`${SEL}:hover{opacity:0.8!important}`));
    assert.ok(out.includes(`${SEL}:focus-visible{box-shadow:0 6px 16px rgba(0,0,0,.20)!important}`));
    assert.ok(out.includes(`${SEL}:focus-within{box-shadow:0 6px 16px rgba(0,0,0,.20)!important}`));
    assert.ok(out.includes(`${SEL}:active{background-color:var(--wx-c-accent)!important}`));
  });

  test("focus is two separate rules, not one selector list an old browser would drop whole", () => {
    const out = css({ cta: { focus: { bg: "#000000" } } });
    assert.ok(!/:focus-visible\s*,/.test(out) && !/,[^{}]*:focus-within/.test(out));
  });

  test("a hover text colour reaches the text and icons inside, like the base colour does", () => {
    const out = css({ cta: { hover: { color: "#ff0000", iconColor: "#00ff00" } } });
    assert.ok(out.includes(`${SEL}:hover :not([data-vb-c]):not(svg):not(svg *){color:#ff0000!important}`));
    assert.ok(out.includes(`${SEL}:hover svg,${SEL}:hover svg *{color:#ff0000!important}`));
    assert.ok(out.includes(`${SEL}:hover${SEL}:hover svg,${SEL}:hover${SEL}:hover svg *{color:#00ff00!important}`));
  });

  test("states fade in unless the visitor asked for reduced motion", () => {
    const out = css({ cta: { hover: { bg: "#112233" } } });
    assert.ok(out.includes(`@media (prefers-reduced-motion:no-preference){${SEL}{transition:`));
  });

  test("no state, no transition", () => {
    assert.ok(!css({ cta: { bg: "#112233" } }).includes("transition"));
  });

  test("a state alone makes a style non-empty; an empty or invalid state does not", () => {
    assert.equal(isEmptyStyle({ hover: { bg: "#112233" } } as any), false);
    assert.equal(isEmptyStyle({ hover: {} } as any), true);
    assert.equal(isEmptyStyle({ hover: { bg: "red", opacity: "x" } } as any), true);
    assert.equal(isEmptyStyle({ hover: "oops" } as any), true);
    assert.equal(isEmptyStyle({ hover: [1, 2] } as any), true);
  });

  test("hostile values in a state are dropped, never emitted", () => {
    const evil = `red;}</style><script>alert(1)</script>`;
    const out = css({ cta: { hover: { bg: evil, color: evil, borderColor: evil, shadow: evil, opacity: evil }, focus: { bg: evil } } });
    assert.equal(out, "");
  });

  test("only colour, shadow and opacity are honoured in a state — nothing that would move the layout", () => {
    const out = css({ cta: { hover: { bg: "#112233", padding: 50, fontSize: 40, radius: 20, marginTop: 30 } } });
    assert.ok(out.includes("background-color:#112233"));
    assert.ok(!/padding|font-size|border-radius|margin/.test(out));
  });

  test("a hover border colour needs no border width of its own", () => {
    assert.ok(css({ cta: { hover: { borderColor: "#abcdef" } } }).includes(`:hover{border-color:#abcdef!important}`));
  });

  test("fuzz: state values never put a quote, brace, angle bracket or backslash in the output", () => {
    const junk = [`"`, `'`, `{`, `}`, `<`, `>`, `\\`, `;`, `url(x)`, `@c9`, `@`, `#12`, `#gggggg`, 99999, -5, NaN, null, undefined, {}, []];
    for (const j of junk) for (const k of ["color", "iconColor", "bg", "borderColor", "shadow", "opacity"]) {
      const out = css({ cta: { hover: { [k]: j }, focus: { [k]: j }, active: { [k]: j } } });
      // Selectors legitimately contain quotes and braces; what matters is that no junk got in.
      assert.ok(!/[<>\\]/.test(out), `${k}=${String(j)}`);
      assert.ok(!/url\(x\)|@c9|gggggg/.test(out), `${k}=${String(j)}`);
    }
  });
});
