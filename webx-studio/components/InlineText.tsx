"use client";
import { useEffect, useRef } from "react";

// Edit-in-place plain text for the builder canvas. Caret-stable (writes to DOM
// only when not focused), commits to state on input.
export default function InlineText({
  value, onChange, as = "div", className, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  as?: any; className?: string; placeholder?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    // el.ownerDocument, not the ambient `document` — when this is mounted via
    // createPortal into RealPreview.tsx's iframe, the ambient `document` is
    // the PARENT window's, so that comparison would always be false and this
    // would clobber the caret on every keystroke inside the iframe.
    if (el && el.ownerDocument.activeElement !== el && el.textContent !== value) el.textContent = value || "";
  }, [value]);
  const Tag: any = as;
  return (
    <Tag
      ref={ref}
      className={"inl " + (className || "")}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder || ""}
      onInput={(e: any) => onChange(e.currentTarget.textContent || "")}
    />
  );
}
