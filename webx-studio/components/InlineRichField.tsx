"use client";
// A text field where a few words can be made bold, italic, underlined, struck through, a link, or a theme colour —
// select the words, then press a button on the small bar above the field (or Ctrl/Cmd+B / I / U, Ctrl/Cmd+K for a
// link). What is stored is the small fixed set of tags lib/inlineMarkup.ts allows; pasting brings in plain text only.
import { useEffect, useRef, useState } from "react";
import { serialize, toEditorHtml, safeHref, isColour } from "@/lib/inlineMarkup";

type Token = { key: string; value: string; label?: string };

export default function InlineRichField({ value, onChange, multiline, placeholder, tokens = [], t, testId }: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  /** Theme colours (key like "@primary", value its CSS colour) offered on the bar. */
  tokens?: Token[];
  t: (k: string) => string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>("");
  const [focus, setFocus] = useState(false);
  const [colourOpen, setColourOpen] = useState(false);
  const swatch = (c: string) => tokens.find((x) => x.key === c)?.value;

  // Show the stored text — unless this is what the field itself just wrote (keeps the caret where it is).
  useEffect(() => {
    const el = ref.current;
    if (!el || value === last.current) return;
    el.innerHTML = toEditorHtml(value, swatch);
    last.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const v = serialize(el, !!multiline);
    if (v === last.current) return;
    last.current = v;
    onChange(v);
  };
  const run = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(cmd, false, arg);
    emit();
  };
  const link = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { window.alert(t("rt.selectFirst")); return; }
    const raw = window.prompt(t("rt.linkPrompt"), "https://");
    if (raw === null) return;
    if (!raw.trim()) { run("unlink"); return; }
    const href = safeHref(raw.trim());
    if (!href) { window.alert(t("rt.badLink")); return; }
    run("createLink", href);
  };
  const colour = (c: string | null) => {
    setColourOpen(false);
    const el = ref.current, sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode)) { window.alert(t("rt.selectFirst")); return; }
    const range = sel.getRangeAt(0);
    const frag = range.extractContents();
    // Drop colours already inside the selection so the new one (or none) applies to all of it.
    frag.querySelectorAll?.("span[data-c], font").forEach((n) => n.replaceWith(...Array.from(n.childNodes)));
    if (c && isColour(c)) {
      const span = document.createElement("span");
      span.setAttribute("data-c", c);
      const look = c.startsWith("@") ? swatch(c) : c;
      if (look) span.style.color = look;
      span.appendChild(frag);
      range.insertNode(span);
    } else range.insertNode(frag);
    sel.removeAllRanges();
    emit();
  };
  const clear = () => { run("removeFormat"); run("unlink"); colour(null); };

  return (
    <div className={"irf" + (focus ? " on" : "")} data-testid={testId}>
      <div className="irf-bar" onMouseDown={(e) => e.preventDefault() /* keep the selection in the field */}>
        <button type="button" onClick={() => run("bold")} title={t("rt.bold") + " (Ctrl+B)"} aria-label={t("rt.bold")} data-testid="irf-bold"><b>B</b></button>
        <button type="button" onClick={() => run("italic")} title={t("rt.italic") + " (Ctrl+I)"} aria-label={t("rt.italic")}><i>I</i></button>
        <button type="button" onClick={() => run("underline")} title={t("rt.underline") + " (Ctrl+U)"} aria-label={t("rt.underline")}><u>U</u></button>
        <button type="button" onClick={() => run("strikeThrough")} title={t("rt.strike")} aria-label={t("rt.strike")}><s>S</s></button>
        <button type="button" onClick={link} title={t("rt.wordLink") + " (Ctrl+K)"} aria-label={t("rt.wordLink")} data-testid="irf-link">🔗</button>
        <span className="irf-col">
          <button type="button" onClick={() => setColourOpen((o) => !o)} title={t("rt.colour")} aria-label={t("rt.colour")} aria-expanded={colourOpen} data-testid="irf-colour"><span className="irf-a">A</span></button>
          {colourOpen && (
            <span className="irf-pal" role="menu">
              {tokens.map((tk) => (
                <button type="button" key={tk.key} role="menuitem" title={tk.label || tk.key} style={{ background: tk.value }} onClick={() => colour(tk.key)} data-testid={"irf-c-" + tk.key.slice(1)} />
              ))}
              <button type="button" role="menuitem" className="irf-hex" onClick={() => { const v = window.prompt(t("rt.hexPrompt"), "#"); if (v && isColour(v.trim())) colour(v.trim()); }}>#</button>
              <button type="button" role="menuitem" className="irf-none" title={t("rt.noColour")} onClick={() => colour(null)}>⌀</button>
            </span>
          )}
        </span>
        <button type="button" onClick={clear} title={t("rt.wordClear")} aria-label={t("rt.wordClear")}>⨯</button>
      </div>
      <div ref={ref} className={"irf-ed" + (multiline ? " multi" : "")} contentEditable suppressContentEditableWarning role="textbox" aria-multiline={!!multiline}
        data-placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); emit(); }}
        onInput={emit}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); link(); return; }
          if (mod && ["b", "i", "u"].includes(e.key.toLowerCase())) { e.preventDefault(); run(({ b: "bold", i: "italic", u: "underline" } as Record<string, string>)[e.key.toLowerCase()]); return; }
          if (e.key === "Enter") { e.preventDefault(); if (multiline) run("insertLineBreak"); }
        }}
        onPaste={(e) => { e.preventDefault(); const txt = e.clipboardData.getData("text/plain"); document.execCommand("insertText", false, multiline ? txt : txt.replace(/\s*\n\s*/g, " ")); emit(); }}
      />
    </div>
  );
}
