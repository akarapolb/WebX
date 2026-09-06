"use client";
// Click-to-replace image overlay for the real-preview canvas. No-ops to a
// plain <img> (or the given placeholder) when `edit` is absent. Reuses the
// same upload mechanism as everything else here (edit.onImagePick calls
// through to VisualBuilder.tsx's uploadFieldImage, which is cms.media.upload()
// under the hood, same as the sidebar's own file inputs).
import type { EditBag, Path } from "./editing";

export default function EditableImage({
  edit, path, src, alt, className, style, placeholder,
}: {
  edit?: EditBag; path: Path; src?: string; alt?: string; className?: string; style?: React.CSSProperties; placeholder?: React.ReactNode;
}) {
  if (!edit) {
    if (!src) return placeholder ? <>{placeholder}</> : null;
    return <img src={src} alt={alt || ""} className={className} style={style} />;
  }
  return (
    <span className="pvb-imgwrap" style={style}>
      {src ? <img src={src} alt={alt || ""} className={className} style={{ width: "100%", height: "100%", objectFit: "inherit" }} /> : (placeholder ?? <span className="pvb-imgph">+ Image</span>)}
      <label className="pvb-img-overlay" onClick={(e) => e.stopPropagation()}>
        <span>Change image</span>
        <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) edit.onImagePick(path, f); }} />
      </label>
    </span>
  );
}
