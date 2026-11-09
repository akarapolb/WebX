"use client";
// The "bind to live WordPress data" controls of a block: which kind of entry feeds it, how each entry is shown,
// and a few options that only apply to some of the ways of showing it. Replaces a row of selects that listed raw
// internal names ("news", "orgunit", "dated") and asked for an icon and a tag override whether or not they did
// anything (lib/sourceOptions.ts has the choices).
import { SOURCE_CATEGORIES, SOURCE_MAPS, categoryOf, defaultMapFor, isValidCombo, type SourceMapKey } from "@/lib/sourceOptions";

type Source = { kind?: string; postType?: string; map?: string; icon?: string; tag?: string; limit?: number; offset?: number };

export default function SourceBinding({ source, lang, t, onField }: {
  source: Source;
  lang: "en" | "th";
  t: (k: string) => string;
  /** Sets one field of the binding (undefined clears it). */
  onField: (key: keyof Source, value: any) => void;
}) {
  const th = lang === "th";
  const postType = source.postType || "service";
  const cat = categoryOf(postType);
  const map = (source.map || "card") as SourceMapKey;
  const known = isValidCombo(postType, map);
  const mi = SOURCE_MAPS[map];
  const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.floor(Number(v)) || 0));

  function pickCategory(v: string) {
    onField("postType", v);
    // Keep the way of showing it when it still fits; otherwise move to the first one that does.
    if (!isValidCombo(v, map)) onField("map", defaultMapFor(v));
  }

  return (
    <div className="src" data-testid="source-binding">
      <p className="muted src-note">{t("src.note")}</p>

      <label className="src-l">{t("src.from")}</label>
      <select value={cat ? postType : ""} onChange={(e) => pickCategory(e.target.value)} data-testid="source-category">
        {!cat && <option value="">{postType}</option>}
        {SOURCE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{th ? c.th : c.en}</option>)}
      </select>

      <label className="src-l">{t("src.as")}</label>
      <select value={known ? map : ""} onChange={(e) => onField("map", e.target.value)} data-testid="source-map">
        {!known && <option value="">{map}</option>}
        {(cat?.maps ?? []).map((m) => <option key={m} value={m}>{th ? SOURCE_MAPS[m].th : SOURCE_MAPS[m].en}</option>)}
      </select>
      {known && mi && <p className="muted src-help">{th ? mi.descTh : mi.descEn}</p>}
      {!known && <p className="auth-err src-help">{t("src.unknown")}</p>}

      {known && mi?.icon && (
        <>
          <label className="src-l">{t("src.icon")}</label>
          <input placeholder="i-file" value={source.icon || ""} onChange={(e) => onField("icon", e.target.value || undefined)} />
          <p className="muted src-help">{t("src.icon.help")}</p>
        </>
      )}
      {known && mi?.tag && (
        <>
          <label className="src-l">{t("src.tag")}</label>
          <input value={source.tag || ""} onChange={(e) => onField("tag", e.target.value || undefined)} />
          <p className="muted src-help">{t("src.tag.help")}</p>
        </>
      )}

      <div className="src-row">
        <div>
          <label className="src-l">{t("src.limit")}</label>
          <input type="number" min={0} placeholder={t("src.all")} value={source.limit ?? ""} onChange={(e) => onField("limit", num(e.target.value))} />
        </div>
        <div>
          <label className="src-l">{t("src.offset")}</label>
          <input type="number" min={0} placeholder="0" value={source.offset ?? ""} onChange={(e) => onField("offset", num(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
