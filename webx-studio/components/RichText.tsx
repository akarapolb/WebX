"use client";
import { useEffect, useRef } from "react";
import { useLang } from "./LangProvider";
import { sanitizeCmsHtml } from "@/lib/sanitize";

// Lightweight WYSIWYG for Strapi CKEditor (HTML) fields. Edits & emits HTML.
export default function RichText({
  value, onChange, placeholder,
}: {
  value: string; onChange: (html: string) => void; placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLang();

  // Sync external value (e.g. AI assist) without disturbing the caret while typing.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== value) el.innerHTML = sanitizeCmsHtml(value);
  }, [value]);

  function cmd(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  }
  function link() {
    const url = window.prompt("URL:", "https://");
    if (url) cmd("createLink", url);
  }

  const B = ({ c, label, children, arg }: { c: string; label: string; children: React.ReactNode; arg?: string }) => (
    <button type="button" title={label} onMouseDown={(e) => { e.preventDefault(); cmd(c, arg); }}>{children}</button>
  );

  return (
    <div className="rt">
      <div className="rt-tb">
        <B c="bold" label={t("rt.bold")}>B</B>
        <B c="italic" label={t("rt.italic")}><span style={{ fontStyle: "italic" }}>I</span></B>
        <span className="div" />
        <B c="formatBlock" arg="<h2>" label={t("rt.h2")}>H2</B>
        <B c="formatBlock" arg="<h3>" label={t("rt.h3")}>H3</B>
        <B c="formatBlock" arg="<p>" label="Paragraph">¶</B>
        <span className="div" />
        <B c="insertUnorderedList" label={t("rt.ul")}>•</B>
        <B c="insertOrderedList" label={t("rt.ol")}>1.</B>
        <button type="button" title={t("rt.link")} onMouseDown={(e) => { e.preventDefault(); link(); }}>🔗</button>
        <span className="div" />
        <B c="removeFormat" label={t("rt.clear")}>⌫</B>
      </div>
      <div
        ref={ref}
        className="rt-area"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder || ""}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
      />
    </div>
  );
}
