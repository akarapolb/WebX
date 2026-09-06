"use client";
// Webflow-style "Embed" escape hatch — raw HTML/CSS/JS for the cases the
// block library can't cover. A plain dangerouslySetInnerHTML div would only
// render markup: browsers never execute a <script> tag that was inserted as
// innerHTML (true whether that's done via raw DOM APIs or React's
// dangerouslySetInnerHTML — not a React limitation, a browser one). Custom
// Code needs JS to actually run, so after mounting the markup this replaces
// every <script> with a freshly `document.createElement`d one — a script
// element created and appended that way DOES execute, which is the standard
// technique for "raw HTML with working scripts" widgets. Gated server-side
// by governance.ts's embedCode custom-role permission, not by anything here.
import { useEffect, useRef } from "react";

export default function EmbedBlock({ b }: { b: any }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = b.html || "";
    el.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  }, [b.html]);
  if (!b.html) return null;
  return <div ref={ref} className="block block--embed" />;
}
