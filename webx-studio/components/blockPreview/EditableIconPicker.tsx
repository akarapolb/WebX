"use client";
// Transparent <select> stacked exactly over a rendered icon (via CSS, see
// RealPreview.tsx's EDITOR_CSS .pvb-iconwrap/.pvb-iconpick) — clicking it
// opens the native OS dropdown right on top of the icon, so no custom
// popover positioning logic is needed. Reuses the same built-in icon lists
// the sidebar's own <select> uses (webx-studio/components/blockPreview/
// iconChoices.ts), lifted out specifically so the two don't drift.
import type { EditBag, Path } from "./editing";
import { FEATURE_ICONS, STAT_ICONS } from "./iconChoices";

export default function EditableIconPicker({
  edit, path, value, kind, customIcons,
}: {
  edit: EditBag; path: Path; value: string; kind: "feature" | "stat";
  customIcons?: Record<string, { key: string; name?: string }>;
}) {
  const builtins = kind === "feature" ? FEATURE_ICONS : STAT_ICONS;
  const customList = customIcons ? Object.values(customIcons) : [];
  return (
    <select className="pvb-iconpick" value={value} onClick={(e) => e.stopPropagation()}
      onChange={(e) => edit.onFieldChange(path, e.target.value)} aria-label="Icon">
      <optgroup label="Built-in">{builtins.map((ic) => <option key={ic} value={ic}>{ic}</option>)}</optgroup>
      {customList.length > 0 && (
        <optgroup label="Custom">{customList.map((ic) => <option key={ic.key} value={ic.key}>{ic.name || ic.key}</option>)}</optgroup>
      )}
    </select>
  );
}
