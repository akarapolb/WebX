"use client";
// Path-based inline text wrapper for the real-preview canvas. No-ops to
// plain text when `edit` is absent (read-only preview / the real public
// site never imports this at all). Reuses InlineText as-is — its
// ownerDocument-based caret-stability fix (see InlineText.tsx) is what
// makes it safe to mount here, inside RealPreview's portaled iframe tree.
import InlineText from "../InlineText";
import type { EditBag, Path } from "./editing";

export default function EditableText({
  edit, path, value, as = "span", className, placeholder,
}: {
  edit?: EditBag; path: Path; value: string; as?: any; className?: string; placeholder?: string;
}) {
  if (!edit) return <>{value}</>;
  return (
    <InlineText as={as} className={className} value={value} placeholder={placeholder}
      onChange={(v) => edit.onFieldChange(path, v)} />
  );
}
