import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { customDecls, parseCustomCss, ALLOWED_PROPS, CUSTOM_CSS_MAX_CHARS, CUSTOM_CSS_MAX_DECLARATIONS } from "./customCss";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="card"]`;
const kept = (text: string) => customDecls(text);

describe("custom CSS: what is accepted", () => {
  test("declarations separated by ; or by new lines, any case, with or without a trailing ;", () => {
    assert.deepEqual(kept("letter-spacing: .05em;\nFILTER: blur(2px)\nopacity:0.5;"), [
      "letter-spacing:.05em!important", "filter:blur(2px)!important", "opacity:0.5!important",
    ]);
  });

  test("a trailing !important is accepted and not doubled", () => {
    assert.deepEqual(kept("color: red !important"), ["color:red!important"]);
  });

  test("gradients, transforms, filters, calc and clamp", () => {
    assert.equal(kept("background: linear-gradient(90deg, #112233, rgba(0,0,0,.5))").length, 1);
    assert.equal(kept("transform: translate(10px, 5px) rotate(3deg)").length, 1);
    assert.equal(kept("width: calc(100% - 2rem)").length, 1);
    assert.equal(kept("font-size: clamp(1rem, 2vw, 2rem)").length, 1);
    assert.equal(kept("backdrop-filter: blur(8px) saturate(120%)").length, 1);
    assert.equal(kept("clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%)").length, 1);
    assert.equal(kept("grid-template-columns: repeat(3, minmax(0, 1fr))").length, 1);
  });

  test("the theme's own variables are allowed", () => {
    assert.deepEqual(kept("color: var(--wx-c-primary); background-color: var(--wx-c-c3)"), ["color:var(--wx-c-primary)!important", "background-color:var(--wx-c-c3)!important"]);
  });

  test("it is written as part of the component's rule, last, so it wins over the controls", () => {
    const out = css({ card: { bg: "#112233", customCss: "background-color: #445566; letter-spacing: 1px" } });
    assert.ok(out.includes(`${SEL}{background-color:#112233!important;letter-spacing:1px!important`) === false);
    assert.ok(out.indexOf("background-color:#445566") > out.indexOf("background-color:#112233"));
    assert.ok(out.includes("letter-spacing:1px!important"));
  });

  test("it works inside a phone or dark override too", () => {
    assert.ok(css({ card: { mobile: { customCss: "display: none" } } }).includes(`@media (max-width: 639.98px){${SEL}{display:none!important}}`));
    assert.ok(css({ card: { dark: { customCss: "filter: brightness(0.9)" } } }).includes("filter:brightness(0.9)!important"));
  });

  test("custom CSS alone makes a style non-empty; nothing accepted does not", () => {
    assert.equal(isEmptyStyle({ customCss: "opacity: .5" } as any), false);
    assert.equal(isEmptyStyle({ customCss: "font-family: Comic Sans" } as any), true);
    assert.equal(isEmptyStyle({ customCss: "" } as any), true);
  });
});

describe("custom CSS: what is refused", () => {
  const refused: [string, string][] = [
    ["background: url(https://evil.test/x.png)", "url()"],
    ["background-image: URL('x.png')", "url() in capitals with quotes"],
    ["background: image-set(x 1x)", "image-set"],
    ["width: expression(alert(1))", "expression"],
    ["content: 'x'", "content is not on the list"],
    ["font-family: Comic Sans MS", "fonts come from the theme"],
    ["font: 12px serif", "font shorthand"],
    ["--x: 1", "custom property definition"],
    ["animation: spin 1s", "animation"],
    ["position: absolute", "floating position"],
    ["position: fixed", "floating position"],
    ["position: sticky", "floating position"],
    ["display: table-cell", "display outside the list"],
    ["cursor: url(x.cur), auto", "cursor image"],
    ["z-index: 999999", "z-index out of the integer shape"],
    ["z-index: 1e9", "z-index shape"],
    ["color: var(--orst-primary)", "a variable that is not a theme token"],
    ["color: var(--wx-c-primary, red)", "a fallback inside var()"],
    ["color: var(--wx-c-primary", "unbalanced parenthesis"],
    ["width: calc(((((1px)))))", "too deep"],
    ["width: attr(data-x)", "attr()"],
    ["width: env(safe-area-inset-top)", "env()"],
    ["color: red}body{display:none", "closing the rule"],
    ["color: \\72 ed", "backslash escape"],
    ["color: red @import 'x'", "at-rule"],
    ["background: -moz-binding(x)", "binding"],
    ["behavior: x", "unknown property"],
    ["width: 10px ! important", "bang in the middle"],
    ["no colon here", "malformed"],
    [": red", "no property"],
    ["color:", "no value"],
    ["width: " + "9".repeat(200), "too long"],
  ];
  for (const [text, why] of refused) {
    test(`refuses: ${why}`, () => {
      assert.deepEqual(kept(text), [], text);
    });
  }

  test("a bad line does not take its good neighbours with it", () => {
    assert.deepEqual(kept("opacity: .5; background: url(x); letter-spacing: 1px; position: fixed"), ["opacity:.5!important", "letter-spacing:1px!important"]);
  });

  test("the editor is told which lines were ignored, and why", () => {
    const r = parseCustomCss("opacity: .5\nfont-family: x\nwidth: url(x)\nnonsense");
    assert.deepEqual(r.accepted, [{ prop: "opacity", value: ".5" }]);
    assert.deepEqual(r.ignored.map((i) => i.reason), ["unknown-property", "bad-value", "malformed"]);
  });

  test("closing the style element: the harmless declaration before it stays, everything after it goes", () => {
    assert.deepEqual(kept("color: red; }</style><script>alert(1)</script>"), ["color:red!important"]);
    assert.deepEqual(kept("}</style><script>alert(1)</script>"), []);
  });

  test("comments are removed, not interpreted", () => {
    assert.deepEqual(kept("/* color: red */ opacity: .5; /* unterminated"), ["opacity:.5!important"]);
    // A comment is a line break: it can never join the two halves of a value into a new one.
    assert.ok(!kept("color: re/* x */d").some((d) => d.includes("red")));
  });

  test("text is capped, and so is the number of declarations", () => {
    assert.equal(parseCustomCss("opacity:.5;".repeat(5000)).accepted.length <= CUSTOM_CSS_MAX_DECLARATIONS, true);
    assert.ok(parseCustomCss("a:1;".repeat(1000) + "opacity:.5").accepted.length === 0);
    assert.equal(CUSTOM_CSS_MAX_CHARS, 1500);
  });

  test("non-string input is nothing", () => {
    for (const v of [null, undefined, 5, {}, [], true]) assert.deepEqual(kept(v as any), []);
  });
});

describe("custom CSS: positioned values", () => {
  test("position allows only static and relative", () => {
    assert.deepEqual(kept("position: relative"), ["position:relative!important"]);
    assert.deepEqual(kept("position: STATIC"), ["position:static!important"]);
  });

  test("z-index is a clamped integer", () => {
    assert.deepEqual(kept("z-index: 5"), ["z-index:5!important"]);
    assert.deepEqual(kept("z-index: 500"), ["z-index:100!important"]);
    assert.deepEqual(kept("z-index: -50"), ["z-index:-10!important"]);
  });

  test("display and cursor are fixed keywords", () => {
    assert.deepEqual(kept("display: flex"), ["display:flex!important"]);
    assert.deepEqual(kept("cursor: pointer"), ["cursor:pointer!important"]);
  });
});

describe("custom CSS: the allowlist itself", () => {
  test("nothing dangerous is on it", () => {
    for (const bad of ["content", "font-family", "font", "src", "animation", "animation-name", "behavior", "-moz-binding", "quotes", "counter-reset", "counter-increment", "will-change"]) {
      assert.ok(!ALLOWED_PROPS.includes(bad), bad);
    }
    for (const p of ALLOWED_PROPS) assert.match(p, /^[a-z][a-z-]*$/, p);
  });

  test("fuzz: whatever is typed, only well-formed declarations come out", () => {
    const pieces = ["color", "width", "background", "url(", ")", "(", "{", "}", ";", ":", "\"", "'", "\\", "<", ">", "/*", "*/", "@", "var(--wx-c-c1)", "var(--x)", "expression(", "!important", " ", "\n", "red", "10px", "calc(", "1", "-", "javascript:", "position", "fixed", "z-index", "99999", "--", "="];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 3000; i++) {
      let t = "";
      for (let j = 0, n = 1 + Math.floor(rnd() * 14); j < n; j++) t += pieces[Math.floor(rnd() * pieces.length)];
      for (const decl of customDecls(t)) {
        assert.match(decl, /^[a-z][a-z-]*:[A-Za-z0-9 .,%#()+\-/*_]+!important$/, `${JSON.stringify(t)} -> ${decl}`);
        assert.ok(!/url|expression|javascript|import/i.test(decl), decl);
        assert.ok(!/^position:(absolute|fixed|sticky)/.test(decl), decl);
      }
      const whole = css({ card: { customCss: t } });
      assert.ok(!/[<>\\]/.test(whole), JSON.stringify(t));
      // exactly one rule block for the component at most: the braces in the output are the selector's own
      const open = (whole.match(/\{/g) || []).length, close = (whole.match(/\}/g) || []).length;
      assert.equal(open, close, JSON.stringify(t));
      assert.ok(open <= 1, JSON.stringify(t));
    }
  });
});

describe("custom CSS: numbers stay within what the controls allow", () => {
  const refused = [
    "width: 99999px", "height: 100000vh", "font-size: 99999px", "margin-top: -100vh", "margin: -99999px", "margin-left: -300px",
    "text-indent: -99999px", "transform: translate(99999px, -99999px)", "transform: translateX(500px)", "transform: scale(500)",
    "transform: scale(6)", "width: calc(100vw * 1000)", "width: 1e9px", "width: 9e9px", "grid-template-columns: repeat(100000, 1px)",
    "grid-template-columns: repeat(25, 1px)", "margin-top: calc(-100px - 100px)", "transform: translate(calc(100px + 100px), 0)",
    "margin: min(-300px, 0px)", "transition: opacity 99999s", "padding: 5000px", "width: 400%", "gap: 99999px",
    "width: 1px 2px 3px 4px 5px 6px 7px 8px 9px 10px 11px 12px 13px",
  ];
  for (const text of refused) test(`refuses: ${text}`, () => assert.deepEqual(kept(text), [], text));

  const accepted = [
    "width: 4000px", "height: 100vh", "min-height: 60vh", "margin-top: -200px", "margin: 0 -10px", "margin-top: -20rem",
    "transform: translate(400px, -400px) rotate(3600deg) scale(5)", "transform: translateX(50vw)", "transform: scale(0.5)",
    "grid-template-columns: repeat(24, minmax(0, 1fr))", "grid-template-columns: repeat(3, 1fr)", "font-size: 200px", "font-size: clamp(1rem, 2vw, 2rem)",
    "width: calc(100% - 2rem)", "aspect-ratio: 16/9", "grid-column: 1 / 3", "line-height: 1.5", "flex: 1 1 0", "letter-spacing: 0.05em",
    "background: linear-gradient(90deg, #112233, rgba(0,0,0,.5))", "clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%)",
    "color: var(--wx-c-c3)", "opacity: 0.5", "transition: opacity 300ms ease",
  ];
  for (const text of accepted) test(`still accepts: ${text}`, () => assert.equal(kept(text).length, 1, text));

  test("a z-index beyond the range is clamped, as with the control", () => {
    assert.deepEqual(kept("z-index: 500"), ["z-index:100!important"]);
    assert.deepEqual(kept("z-index: -50"), ["z-index:-10!important"]);
  });

  test("the overlay recipe from the review is no longer assembled", () => {
    const got = kept("position:relative;z-index:100;width:100vw;height:100vh;margin-top:-100vh;opacity:0;background:#fff;transform: translate(99999px,-99999px) scale(500);margin:-99999px;width:calc(100vw * 1000);grid-template-columns: repeat(100000, 1px);font-size:99999px");
    for (const d of got) assert.ok(!/margin-top:-100vh|99999|calc\(100vw|repeat\(100000|scale\(500/.test(d), d);
  });
});
