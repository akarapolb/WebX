"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import RichText from "./RichText";
import { useLang } from "./LangProvider";

type Kind = "input" | "textarea" | "rich";
type Field = { key: string; value: string; initial: string; kind: Kind };

const SYS = new Set([
  "id", "documentId", "createdAt", "updatedAt", "publishedAt", "locale", "status",
  "createdBy", "updatedBy", "localizations", "strapi_stage", "strapi_assignee",
]);
const RICH = new Set(["body", "content", "contentHtml"]);
const LONG = new Set(["excerpt", "description", "answer", "summary", "detail"]);
// ฟิลด์ที่เป็น dropdown (เลือกจากรายการ — กันพิมพ์ผิด) · ค่าต้องตรงกับ schema enum
const SELECTS: Record<string, string[]> = {
  pageKey: ["home", "news", "services", "careers", "job", "video", "calendar", "blog", "gallery", "catalog", "download", "faq", "complaint", "contact", "register", "accessibility", "sitemap", "application-status", "map"],
  bannerType: ["announcement", "mourning", "royal", "urgent", "maintenance"],
};

// ฟิลด์วันที่-เวลา (ตั้งเวลาแสดง banner) — แสดงเป็น datetime picker
const DATES = new Set(["startAt", "endAt", "publishAt", "expireAt"]);
function DateTimeField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  // ISO (UTC) <-> ค่าใน <input datetime-local> (เวลาเครื่องผู้ใช้)
  const toLocal = (iso: string) => { if (!iso) return ""; const d = new Date(iso); if (isNaN(+d)) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  return (
    <div className="ehdt">
      <input type="datetime-local" value={toLocal(value)} disabled={disabled}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")} />
      {value && <button type="button" className="ehdt__clr" onClick={() => onChange("")} disabled={disabled} aria-label="ล้าง">×</button>}
      <style>{`
        .ehdt{display:flex;align-items:center;gap:8px}
        .ehdt input{flex:1;background:var(--sunk);border:1px solid var(--line2);border-radius:10px;padding:10px 13px;font-size:14px;color:var(--ink);font-family:inherit}
        .ehdt input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .ehdt__clr{width:34px;height:34px;border-radius:8px;border:1px solid var(--line2);background:var(--sunk);color:var(--ink2);font-size:18px;cursor:pointer;flex:0 0 34px}
        .ehdt__clr:hover{color:var(--ink);border-color:var(--accent)}
      `}</style>
    </div>
  );
}

// ฟิลด์ตัวเลือก (โพล/แบบสำรวจ) — เก็บเป็น JSON [{label,votes}] · เพิ่ม/ลบ/เลื่อน/แก้ + โชว์คะแนน
const JSONOPTS = new Set(["options", "choices", "items", "answers"]);
function OptionsField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  let arr: { label?: string; votes?: number }[] = [];
  try { const p = JSON.parse(value || "[]"); if (Array.isArray(p)) arr = p; } catch {}
  const set = (n: any[]) => onChange(JSON.stringify(n));
  const upd = (i: number, label: string) => { const n = arr.slice(); n[i] = { ...n[i], label }; set(n); };
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= arr.length) return; const n = arr.slice(); const tmp = n[i]; n[i] = n[j]; n[j] = tmp; set(n); };
  return (
    <div className="ehopt">
      {arr.map((o, i) => (
        <div className="ehopt__row" key={i}>
          <span className="ehopt__n">{i + 1}</span>
          <input className="ehopt__in" value={o.label || ""} onChange={(e) => upd(i, e.target.value)} disabled={disabled} placeholder={"ตัวเลือกที่ " + (i + 1)} />
          {typeof o.votes === "number" && o.votes > 0 && <span className="ehopt__v">{o.votes} โหวต</span>}
          <button type="button" className="ehopt__b" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label="เลื่อนขึ้น">↑</button>
          <button type="button" className="ehopt__b" onClick={() => move(i, 1)} disabled={disabled || i === arr.length - 1} aria-label="เลื่อนลง">↓</button>
          <button type="button" className="ehopt__b ehopt__del" onClick={() => set(arr.filter((_, x) => x !== i))} disabled={disabled} aria-label="ลบ">✕</button>
        </div>
      ))}
      {arr.length === 0 && <p className="ehopt__empty">ยังไม่มีตัวเลือก — กด “เพิ่มตัวเลือก” ด้านล่าง</p>}
      <button type="button" className="ehopt__add" onClick={() => set([...arr, { label: "", votes: 0 }])} disabled={disabled}>+ เพิ่มตัวเลือก</button>
      <style>{`
        .ehopt{display:flex;flex-direction:column;gap:8px}
        .ehopt__row{display:flex;align-items:center;gap:7px}
        .ehopt__n{flex:0 0 24px;height:24px;border-radius:7px;background:var(--sunk);color:var(--ink2);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center}
        .ehopt__in{flex:1;min-width:0;background:var(--sunk);border:1px solid var(--line2);border-radius:9px;padding:9px 12px;font-size:14px;color:var(--ink)}
        .ehopt__in:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .ehopt__v{flex:0 0 auto;font-size:11.5px;color:var(--ink2);background:var(--sunk);border-radius:7px;padding:4px 8px;white-space:nowrap}
        .ehopt__b{width:30px;height:30px;flex:0 0 30px;border:1px solid var(--line2);background:var(--sunk);border-radius:7px;color:var(--ink2);cursor:pointer;font-size:13px}
        .ehopt__b:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}.ehopt__b:disabled{opacity:.4;cursor:not-allowed}
        .ehopt__del:hover:not(:disabled){border-color:#e11d48;color:#e11d48}
        .ehopt__add{align-self:flex-start;margin-top:2px;background:var(--accent-soft);color:var(--accent);border:1px dashed var(--accent);border-radius:9px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer}
        .ehopt__add:hover{background:var(--accent);color:#fff}
        .ehopt__empty{font-size:12.5px;color:var(--ink2);margin:2px 0}
      `}</style>
    </div>
  );
}

// ฟิลด์เปิด-ปิด (boolean) — สวิตช์
const BOOLS = new Set(["active", "enabled", "featured", "pinned", "highlighted", "dismissible"]);
function ToggleField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const on = value === "true";
  return (
    <button type="button" role="switch" aria-checked={on} className={"ehtgl" + (on ? " on" : "")} onClick={() => { if (!disabled) onChange(on ? "false" : "true"); }} disabled={disabled}>
      <span className="ehtgl__track"><span className="ehtgl__knob" /></span>
      <span className="ehtgl__lbl">{on ? "เปิดใช้งาน" : "ปิด"}</span>
      <style>{`
        .ehtgl{display:inline-flex;align-items:center;gap:10px;background:none;border:0;cursor:pointer;padding:4px 0;font:inherit}
        .ehtgl:disabled{opacity:.55;cursor:not-allowed}
        .ehtgl__track{width:46px;height:26px;border-radius:999px;background:var(--line2);position:relative;transition:background .2s;flex:0 0 46px}
        .ehtgl.on .ehtgl__track{background:var(--accent)}
        .ehtgl__knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s}
        .ehtgl.on .ehtgl__knob{transform:translateX(20px)}
        .ehtgl__lbl{font-size:13.5px;color:var(--ink);font-weight:600}
      `}</style>
    </button>
  );
}

// แปลงค่า field (string ใน state) → ชนิดจริงตอนบันทึก (JSON array / boolean)
function serializeField(f: { key: string; value: string }) {
  if (JSONOPTS.has(f.key)) { try { const p = JSON.parse(f.value || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } }
  if (BOOLS.has(f.key)) return f.value === "true";
  return f.value;
}

// ฟิลด์สี (theme) — แสดงเป็นถาดเลือกสี + ช่อง hex
const COLORS = new Set(["primaryColor", "primaryDark", "secondaryColor", "accentBar", "color", "bgColor", "textColor"]);
function ColorField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value || "");
  return (
    <div className="ehcol">
      <label className="ehcol__sw">
        <input type="color" value={valid ? value : "#000000"} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      </label>
      <input className="ehcol__hex" type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder="#RRGGBB" spellCheck={false} />
      <style>{`
        .ehcol{display:flex;align-items:center;gap:10px}
        .ehcol__sw{position:relative;width:46px;height:42px;border-radius:10px;border:1px solid var(--line2);cursor:pointer;overflow:hidden;flex:0 0 46px}
        .ehcol__sw input{position:absolute;inset:-4px;width:140%;height:140%;border:0;padding:0;cursor:pointer}
        .ehcol__hex{flex:1;background:var(--sunk);border:1px solid var(--line2);border-radius:10px;padding:11px 13px;font-size:14px;color:var(--ink);font-family:ui-monospace,monospace;text-transform:uppercase}
        .ehcol__hex:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
      `}</style>
    </div>
  );
}

// Custom dropdown — เต็มความกว้าง + เปิด-ปิดมี animation + hover + ติ๊กถูกตัวที่เลือก
function SelectField({ value, options, onChange, disabled }: { value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false); };
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div className="ehsel" ref={ref}>
      <button type="button" className={"ehsel__btn" + (open ? " open" : "")} onClick={() => { if (!disabled) setOpen((o) => !o); }} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}>
        <span className={value ? "" : "ehsel__ph"}>{value || "— เลือกหน้า —"}</span>
        <svg className="ehsel__arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="ehsel__menu" role="listbox">
          {options.map((o) => (
            <button type="button" key={o} role="option" aria-selected={o === value} className={"ehsel__opt" + (o === value ? " sel" : "")} onClick={() => { onChange(o); setOpen(false); }}>
              <span>{o}</span>
              {o === value && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>}
            </button>
          ))}
        </div>
      )}
      <style>{`
        .ehsel{position:relative;width:100%}
        .ehsel__btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--sunk);border:1px solid var(--line2);border-radius:10px;padding:11px 13px;font-size:14px;color:var(--ink);cursor:pointer;font-family:inherit;transition:border-color .15s,box-shadow .15s,background .15s}
        .ehsel__btn:hover:not(:disabled){border-color:var(--accent)}
        .ehsel__btn.open{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);background:var(--panel)}
        .ehsel__btn:disabled{opacity:.55;cursor:not-allowed}
        .ehsel__ph{color:var(--ink2);opacity:.75}
        .ehsel__arr{width:18px;height:18px;color:var(--ink2);flex:0 0 18px;transition:transform .22s}
        .ehsel__btn.open .ehsel__arr{transform:rotate(180deg);color:var(--accent)}
        .ehsel__menu{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:60;background:var(--panel);border:1px solid var(--line2);border-radius:12px;box-shadow:0 18px 44px -14px rgba(15,15,35,.4);padding:6px;max-height:266px;overflow-y:auto;animation:ehDrop .17s cubic-bezier(.2,.85,.3,1)}
        @keyframes ehDrop{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}
        .ehsel__opt{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:transparent;border:0;border-radius:8px;padding:9px 12px;font-size:13.5px;color:var(--ink);text-align:left;cursor:pointer;font-family:inherit;transition:background .12s,color .12s}
        .ehsel__opt:hover{background:var(--accent-soft)}
        .ehsel__opt.sel{background:var(--accent-soft);color:var(--accent);font-weight:600}
        .ehsel__opt svg{width:16px;height:16px;color:var(--accent);flex:0 0 16px}
      `}</style>
    </div>
  );
}

function labelize(k: string) {
  return k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
}
const isImageFile = (mime?: string, url?: string) => (mime ? mime.startsWith("image/") : /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(url || ""));
const mediaSrc = (url: string) => (url.startsWith("http") ? url : "/api/strapi" + url);

// Per-field schema-aware AI actions (run through the LLM-agnostic /api/ai layer)
const AI_ACTIONS: { id: string; instr: string }[] = [
  { id: "improve", instr: "Improve the clarity and flow of this text, keeping its meaning and language." },
  { id: "expand", instr: "Expand this into a fuller, more detailed version, same language and tone." },
  { id: "shorten", instr: "Make this more concise while keeping the key points, same language." },
  { id: "formal", instr: "Rewrite this in a formal, official tone suitable for a government website, same language." },
  { id: "fix", instr: "Fix grammar, spelling and punctuation. Return the corrected text only, same language." },
  { id: "th", instr: "Translate this into Thai (ภาษาไทย). Return only the translation." },
  { id: "en", instr: "Translate this into English. Return only the translation." },
];

export default function EntryEditor({
  uid, docId, locale, typeName, mediaKeys, onClose, onSaved,
}: {
  uid: string; docId: string; locale?: string; typeName: string; mediaKeys?: string[];
  onClose: () => void; onSaved: () => void;
}) {
  const { t, lang } = useLang();
  const [fields, setFields] = useState<Field[]>([]);
  const [aiMenu, setAiMenu] = useState("");
  const [aiBusyKey, setAiBusyKey] = useState("");
  const [showAdv, setShowAdv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "publish">("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [media, setMedia] = useState<{ key: string; url: string; mime?: string; name?: string; newId?: number } | null>(null);
  const [rels, setRels] = useState<{ key: string; items: string[] }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [revBusy, setRevBusy] = useState(false);
  const [trBusy, setTrBusy] = useState(false);
  const [delBusy, setDelBusy] = useState<"" | "unpub" | "del">("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [delAck, setDelAck] = useState(false);
  const [releases, setReleases] = useState<any[]>([]);
  const [fp, setFp] = useState<{ hidden: Set<string>; readonly: Set<string> }>({ hidden: new Set(), readonly: new Set() });
  const typer = useRef<ReturnType<typeof setInterval> | null>(null);
  const base = "/api/strapi/content-manager/collection-types/" + uid + "/" + docId + (locale ? "?locale=" + locale : "");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(base);
        if (!r.ok) { setMsg({ t: "Could not load entry (HTTP " + r.status + ")", ok: false }); setLoading(false); return; }
        const j = await r.json();
        const e = j.data ?? j;
        const fs: Field[] = Object.keys(e)
          .filter((k) => !SYS.has(k) && (typeof e[k] === "string" || SELECTS[k] || DATES.has(k) || (JSONOPTS.has(k) && Array.isArray(e[k])) || (BOOLS.has(k) && typeof e[k] === "boolean") || (RICH.has(k) && e[k] == null)))
          .slice(0, 12)
          .map((k) => {
            const v = JSONOPTS.has(k) ? JSON.stringify(e[k] || []) : BOOLS.has(k) ? (e[k] ? "true" : "false") : typeof e[k] === "string" ? (e[k] as string) : "";
            const kind: Kind = RICH.has(k) ? "rich" : (LONG.has(k) || v.length > 100 || v.includes("\n")) ? "textarea" : "input";
            return { key: k, value: v, initial: v, kind };
          });
        fs.sort((a, b) => ["input", "textarea", "rich"].indexOf(a.kind) - ["input", "textarea", "rich"].indexOf(b.kind));
        setFields(fs);
        // media + relations (arrays of records)
        let m: { key: string; url: string; mime?: string; name?: string } | null = null;
        const mk = mediaKeys || [];
        if (mk.length) {
          // schema-declared media field — show the uploader even when empty (new entries)
          const k = mk[0]; const v = e[k];
          m = (v && typeof v === "object" && typeof v.url === "string") ? { key: k, url: v.url, mime: v.mime, name: v.name } : { key: k, url: "" };
        }
        const rs: { key: string; items: string[] }[] = [];
        for (const k of Object.keys(e)) {
          if (SYS.has(k) || k === "localizations") continue;
          const v = e[k];
          if (!m && v && typeof v === "object" && !Array.isArray(v) && typeof v.url === "string") { m = { key: k, url: v.url, mime: v.mime, name: v.name }; }
          else if (Array.isArray(v) && v.length && typeof v[0] === "object") {
            rs.push({ key: k, items: v.slice(0, 12).map((o: any) => o.title || o.name || o.label || ("#" + (o.documentId ?? o.id))) });
          }
        }
        setMedia(m); setRels(rs);
        try {
          const rr = await fetch("/api/strapi/content-manager/collection-types/api::review.review?pageSize=1&sort=updatedAt:DESC&filters[documentRef][$eq]=" + encodeURIComponent(docId));
          if (rr.ok) { const rj = await rr.json(); setReview((rj.results ?? rj.data ?? [])[0] || null); }
        } catch {}
        try {
          const rl = await fetch("/api/strapi/content-manager/collection-types/api::release.release?filters[state][$ne]=done&pageSize=50&sort=updatedAt:DESC");
          if (rl.ok) { const lj = await rl.json(); setReleases(lj.results ?? lj.data ?? []); }
        } catch {}
        try {
          const meR = await fetch("/api/strapi/admin/users/me");
          const mj = meR.ok ? await meR.json() : null;
          const myRoles = ((mj?.data ?? mj)?.roles || []).map((x: any) => x.name).filter(Boolean);
          if (myRoles.length) {
            const pr = await fetch("/api/strapi/content-manager/collection-types/api::field-policy.field-policy?pageSize=100&filters[contentType][$eq]=" + encodeURIComponent(uid));
            if (pr.ok) {
              const pj = await pr.json(); const hid = new Set<string>(), ro = new Set<string>();
              (pj.results ?? pj.data ?? []).forEach((p: any) => { if (myRoles.includes(p.role)) { (Array.isArray(p.hidden) ? p.hidden : []).forEach((f: string) => hid.add(f)); (Array.isArray(p.readonly) ? p.readonly : []).forEach((f: string) => ro.add(f)); } });
              setFp({ hidden: hid, readonly: ro });
            }
          }
        } catch {}
      } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
      finally { setLoading(false); }
    })();
    return () => { if (typer.current) clearInterval(typer.current); };
  }, [base]);

  function setVal(key: string, value: string) {
    setFields((f) => f.map((x) => (x.key === key ? { ...x, value } : x)));
  }

  // schema-aware AI action on a single field, via the LLM-agnostic /api/ai layer
  async function aiAction(f: Field, instr: string) {
    setAiMenu(""); setAiBusyKey(f.key); setMsg(null);
    const isRich = f.kind === "rich";
    try {
      const r = await fetch("/api/ai/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "You are an expert bilingual (Thai/English) editor for Thai government web content. Output ONLY the resulting text — no preamble, no quotes, no explanation." + (isRich ? " Preserve simple HTML tags (<p>, <strong>, <ul>, <li>, <h2>, <h3>)." : ""),
          prompt: instr + "\n\n----\n" + (f.value || ""),
          cache: true,
        }),
      });
      if (r.ok) { const txt = (await r.json()).text; if (typeof txt === "string" && txt.trim()) { setVal(f.key, txt.trim()); setMsg({ t: t("ai.done"), ok: true }); } }
      else if (r.status === 503) setMsg({ t: t("ai.off"), ok: false });
      else setMsg({ t: t("ai.err"), ok: false });
    } catch { setMsg({ t: t("ai.err"), ok: false }); }
    finally { setAiBusyKey(""); }
  }

  function aiAssist() {
    const target = fields.find((f) => f.kind === "rich") ?? fields.find((f) => f.kind === "textarea") ?? fields[0];
    if (!target) return;
    const title = fields.find((f) => f.key === "title")?.value || typeName;
    const draft =
      title + " — สำนักงานพัฒนารัฐบาลดิจิทัล (สพร.) เดินหน้ายกระดับบริการภาครัฐสู่ดิจิทัล " +
      "โดยมุ่งเน้นความสะดวก ปลอดภัย และเข้าถึงได้สำหรับประชาชนทุกคน พร้อมวางมาตรฐานข้อมูลเปิด " +
      "และการเชื่อมโยงบริการระหว่างหน่วยงานอย่างไร้รอยต่อ เพื่อสร้างประสบการณ์ดิจิทัลที่ดีขึ้นอย่างต่อเนื่อง";
    if (target.kind === "rich") {
      setVal(target.key, (target.value || "") + "<p>" + draft + "</p>");
      setMsg({ t: t("e.savedDraft"), ok: true }); setTimeout(() => setMsg(null), 1500);
      return;
    }
    setAssisting(true);
    let i = 0;
    if (typer.current) clearInterval(typer.current);
    typer.current = setInterval(() => {
      i += 2;
      setVal(target.key, draft.slice(0, i));
      if (i >= draft.length) { if (typer.current) clearInterval(typer.current); setAssisting(false); }
    }, 14);
  }

  async function upload(file: File) {
    setUploading(true); setMsg(null);
    const fd = new FormData(); fd.append("files", file);
    try {
      const r = await fetch("/api/strapi/upload", { method: "POST", body: fd });
      if (r.ok) { const j = await r.json(); const f = Array.isArray(j) ? j[0] : j; if (f?.id) setMedia((m) => ({ key: m?.key || "coverImage", url: f.url, mime: f.mime, name: f.name, newId: f.id })); }
      else setMsg({ t: "Upload failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Upload failed", ok: false }); }
    finally { setUploading(false); }
  }

  async function save() {
    const changed = fields.filter((f) => f.value !== f.initial);
    if (changed.length === 0 && !media?.newId) { setMsg({ t: t("e.nochange"), ok: false }); return; }
    setBusy("save"); setMsg(null);
    const payload: Record<string, any> = {};
    changed.forEach((f) => (payload[f.key] = serializeField(f)));
    if (media?.newId) payload[media.key] = media.newId;
    if (locale) payload.locale = locale;
    try {
      const r = await fetch(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.ok) {
        setFields((f) => f.map((x) => ({ ...x, initial: x.value })));
        setMsg({ t: t("e.savedDraft"), ok: true }); onSaved(); setTimeout(onClose, 700);
      } else setMsg({ t: "Save failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setBusy(""); }
  }

  async function publish() {
    setBusy("publish"); setMsg(null);
    try {
      // 1) บันทึกการแก้ไขลง draft ก่อน (รวมรูปใหม่ media.newId) — ถ้าไม่ save ก่อน รูปใหม่จะไม่ถูกเผยแพร่
      const changed = fields.filter((f) => f.value !== f.initial);
      if (changed.length || media?.newId) {
        const payload: Record<string, any> = {};
        changed.forEach((f) => (payload[f.key] = serializeField(f)));
        if (media?.newId) payload[media.key] = media.newId;
        if (locale) payload.locale = locale;
        const sv = await fetch(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!sv.ok) { setMsg({ t: "Save failed (HTTP " + sv.status + ")", ok: false }); setBusy(""); return; }
        setFields((f) => f.map((x) => ({ ...x, initial: x.value })));
      }
      // 2) เผยแพร่ draft ที่บันทึกแล้ว
      const url = "/api/strapi/content-manager/collection-types/" + uid + "/" + docId + "/actions/publish" + (locale ? "?locale=" + locale : "");
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (r.ok) { setMsg({ t: t("e.publishedOk"), ok: true }); onSaved(); setTimeout(onClose, 800); }
      else setMsg({ t: "Publish failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setBusy(""); }
  }

  async function submitReview() {
    setRevBusy(true);
    let actor = "admin";
    try { const m = await fetch("/api/strapi/admin/users/me"); if (m.ok) { const j = await m.json(); const u = j.data ?? j; actor = u.email || actor; } } catch {}
    const title = fields.find((f) => f.key === "title")?.value || (typeName + " " + docId.slice(0, 6));
    const hist = Array.isArray(review?.history) ? review.history : [];
    const entry = { from: review?.stage || "draft", to: "in_review", by: actor, at: new Date().toISOString() };
    try {
      if (review) {
        await fetch("/api/strapi/content-manager/collection-types/api::review.review/" + (review.documentId ?? review.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "in_review", title, history: [...hist, entry] }) });
      } else {
        await fetch("/api/strapi/content-manager/collection-types/api::review.review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentRef: docId, contentType: uid, title, stage: "in_review", requestedBy: actor, history: [entry] }) });
      }
      setReview({ ...(review || {}), stage: "in_review", title });
      setMsg({ t: t("rv.submitted"), ok: true });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setRevBusy(false); }
  }

  const trTarget = (locale || "th").toLowerCase().startsWith("en") ? "th" : "en";
  async function translate() {
    setTrBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/ai/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, docId, locale: locale || "", targetLocale: trTarget }) });
      if (r.status === 503) setMsg({ t: t("ai.off"), ok: false });
      else if (r.ok) setMsg({ t: t("tr.queued"), ok: true });
      else { const j = await r.json().catch(() => ({} as any)); setMsg({ t: j.error || ("Translate failed (HTTP " + r.status + ")"), ok: false }); }
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setTrBusy(false); }
  }

  async function unpublishEntry() {
    setDelBusy("unpub"); setMsg(null);
    const url = "/api/strapi/content-manager/collection-types/" + uid + "/" + docId + "/actions/unpublish" + (locale ? "?locale=" + locale : "");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (r.ok) { setMsg({ t: t("e.unpublished"), ok: true }); onSaved(); }
      else setMsg({ t: t("e.unpubFail") + " (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setDelBusy(""); }
  }
  async function deleteEntry() {
    setDelBusy("del"); setMsg(null);
    const url = "/api/strapi/content-manager/collection-types/" + uid + "/" + docId + (locale ? "?locale=" + locale : "");
    try {
      const r = await fetch(url, { method: "DELETE" });
      if (r.ok) { setConfirmDel(false); onSaved(); onClose(); }
      else setMsg({ t: t("e.delFail") + " (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setDelBusy(""); }
  }

  async function addToRelease(relId: string) {
    const rel = releases.find((r) => String(r.documentId ?? r.id) === String(relId));
    if (!rel) return;
    const items = Array.isArray(rel.items) ? rel.items : [];
    if (items.some((it: any) => it.documentRef === docId)) { setMsg({ t: t("rl.added"), ok: true }); return; }
    const title = fields.find((f) => f.key === "title")?.value || (typeName + " " + docId.slice(0, 6));
    try {
      await fetch("/api/strapi/content-manager/collection-types/api::release.release/" + (rel.documentId ?? rel.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [...items, { contentType: uid, documentRef: docId, title }] }) });
      setMsg({ t: t("rl.added"), ok: true });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
  }

  const mainAssistKey = (fields.find((f) => f.kind === "rich") ?? fields.find((f) => f.kind === "textarea") ?? fields[0])?.key;

  // Live preview — derived from the current field values, updates as you type.
  const THEME: Record<string, string> = {
    blue: "#3B82F6", red: "#EF4444", green: "#10B981", orange: "#F97316", purple: "#8B5CF6",
    pink: "#EC4899", teal: "#14B8A6", yellow: "#F59E0B", amber: "#F59E0B", gray: "#6B7280",
    grey: "#6B7280", indigo: "#6366F1", navy: "#13497A", cyan: "#06B6D4",
  };
  const pvGet = (keys: string[]) => fields.find((f) => keys.includes(f.key))?.value?.trim() || "";
  const pvTitle = pvGet(["title", "name", "subject", "question", "label"]) || ((lang === "th" ? "ยังไม่มีชื่อ · " : "Untitled · ") + typeName);
  const pvBody = pvGet(["excerpt", "description", "detail", "summary", "answer", "body", "content"]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const pvUrl = pvGet(["url", "link", "href", "slug"]);
  const pvColor = pvGet(["color", "colorTheme", "theme", "colour"]).toLowerCase();
  const pvAccent = THEME[pvColor] || "var(--accent)";
  const pvImg = media?.url ? mediaSrc(media.url) : "";

  // ---- UX ย่อ: สำหรับ Site Banner โชว์เฉพาะ "รูป + ประเภท" ที่เหลือซ่อนใต้ "ตั้งค่าเพิ่มเติม" ----
  const isBanner = (uid || "").includes("site-banner");
  const BANNER_PRIMARY = ["bannerType"];
  const visibleFields = fields.filter((f) => !fp.hidden.has(f.key));
  const primaryFields = isBanner ? visibleFields.filter((f) => BANNER_PRIMARY.includes(f.key)) : visibleFields;
  const advancedFields = isBanner ? visibleFields.filter((f) => !BANNER_PRIMARY.includes(f.key)) : [];

  const renderField = (f: Field) => {
    const ro = fp.readonly.has(f.key);
    const lock = ro ? <span className="muted" style={{ fontWeight: 500 }}> · {t("e.locked")}</span> : null;
    const busy = aiBusyKey === f.key;
    return (
      <div className={"fld" + (ro ? " fld--ro" : "")} key={f.key}>
        <div className="ai-row">
          <label style={{ margin: 0, flex: 1 }}>{labelize(f.key)}{lock}</label>
          {!ro && !BOOLS.has(f.key) && !JSONOPTS.has(f.key) && !COLORS.has(f.key) && !DATES.has(f.key) && (
            <div className="ai-menu-wrap">
              <button className="ai-chip" onClick={() => setAiMenu((m) => (m === f.key ? "" : f.key))} disabled={busy}>
                <Icon name="spark" />{busy ? t("ai.working") : t("ai.btn")}
              </button>
              {aiMenu === f.key && (
                <div className="ai-menu" onMouseLeave={() => setAiMenu("")}>
                  {AI_ACTIONS.map((a) => (
                    <button key={a.id} onClick={() => aiAction(f, a.instr)}>{t("ai." + a.id)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {COLORS.has(f.key)
          ? <ColorField value={f.value} onChange={(v) => setVal(f.key, v)} disabled={ro || busy} />
          : BOOLS.has(f.key)
          ? <ToggleField value={f.value} onChange={(v) => setVal(f.key, v)} disabled={ro || busy} />
          : JSONOPTS.has(f.key)
          ? <OptionsField value={f.value} onChange={(v) => setVal(f.key, v)} disabled={ro || busy} />
          : DATES.has(f.key)
          ? <DateTimeField value={f.value} onChange={(v) => setVal(f.key, v)} disabled={ro || busy} />
          : SELECTS[f.key]
          ? <SelectField value={f.value} options={SELECTS[f.key]} onChange={(v) => setVal(f.key, v)} disabled={ro || busy} />
          : f.kind === "input"
            ? <input value={f.value} onChange={(e) => setVal(f.key, e.target.value)} disabled={ro || busy} />
            : f.kind === "rich"
              ? <RichText value={f.value} onChange={(html) => setVal(f.key, html)} placeholder={labelize(f.key)} />
              : <textarea value={f.value} onChange={(e) => setVal(f.key, e.target.value)} disabled={ro || busy} />}
      </div>
    );
  };

  const mediaBlock = media ? (
    <div className={"fld" + (isBanner ? " ehb-media" : "")} key="__media">
      <label>{isBanner ? (lang === "th" ? "รูปแบนเนอร์" : "Banner image") : labelize(media.key)}</label>
      <div className="ed-media">
        {media.url
          ? (isImageFile(media.mime, media.url)
            ? <img className="ed-img" src={mediaSrc(media.url)} alt="" />
            : <a className="ed-img ed-file" href={mediaSrc(media.url)} target="_blank" rel="noreferrer"><Icon name="doc" /><span>{media.name || media.url.split("/").pop()}</span></a>)
          : <div className="ed-img ed-img--none">{t("m.none")}</div>}
        <label className="btn btn--g" style={{ cursor: "pointer" }}>
          <Icon name="img" />{uploading ? t("m.uploading") : (media.url ? t("m.change") : (lang === "th" ? "อัปโหลดรูป" : "Upload"))}
          <input type="file" hidden disabled={uploading}
            onChange={(ev) => ev.target.files?.[0] && upload(ev.target.files[0])} />
        </label>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="ovhead">
          <div style={{ flex: 1 }}>
            <h3>{t("e.edit")} {typeName}</h3>
            <div className="meta">{docId}{locale ? " · " + locale : ""}</div>
          </div>
          <button className="ic-btn" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="ovbody">
          {!loading && (
            <div className="ed-review">
              <Icon name="check" />
              {review ? <span>{t("rv.inwf")} <b>{t("rv.s_" + review.stage)}</b></span> : <span className="muted">{t("rv.sub")}</span>}
              {releases.length > 0 && (
                <select className="vb-sel" style={{ marginLeft: "auto", minWidth: 150 }} value="" aria-label={t("rl.addto")} onChange={(e) => { if (e.target.value) addToRelease(e.target.value); e.currentTarget.selectedIndex = 0; }}>
                  <option value="">{t("rl.addto")}</option>
                  {releases.map((r) => <option key={r.id} value={r.documentId ?? r.id}>{r.name}</option>)}
                </select>
              )}
              <button className="btn btn--g" style={releases.length > 0 ? {} : { marginLeft: "auto" }} onClick={translate} disabled={trBusy} title={t("tr.hint")}>
                <Icon name="spark" />{trBusy ? t("tr.translating") : t("tr.to") + " " + (trTarget === "th" ? "ไทย" : "EN")}
              </button>
              <button className="btn btn--g" onClick={submitReview} disabled={revBusy || review?.stage === "in_review"}>
                <Icon name="check" />{revBusy ? t("rv.submitting") : t("rv.submit")}
              </button>
            </div>
          )}
          {loading && <div className="muted">{t("e.loading")}</div>}
          {!loading && (
          <div className="ed-split">
          <div className="ed-form">
          {visibleFields.length === 0 && !media && <div className="muted">{t("e.noFields")}</div>}

          {isBanner && mediaBlock}
          {primaryFields.map(renderField)}
          {isBanner && advancedFields.length > 0 && (
            <>
              <button type="button" onClick={() => setShowAdv((s) => !s)}
                style={{ display: "flex", alignItems: "center", width: "100%", gap: 8, background: "var(--sunk)", border: "1px solid var(--line2)", borderRadius: 10, padding: "11px 14px", fontSize: 13.5, color: "var(--ink2)", fontWeight: 600, cursor: "pointer", margin: "6px 0 2px" }}>
                {lang === "th" ? "ตั้งค่าเพิ่มเติม (ข้อความ · เวลาแสดง · ปุ่ม)" : "More settings (text · schedule · button)"}
                <span style={{ marginLeft: "auto", transition: "transform .2s", transform: showAdv ? "rotate(180deg)" : "none" }}>▾</span>
              </button>
              {showAdv && advancedFields.map(renderField)}
            </>
          )}
          {!isBanner && mediaBlock}

          {rels.map((r) => (
            <div className="fld" key={r.key}>
              <label>{labelize(r.key)} · {t("m.related")}</label>
              <div className="relchips">{r.items.map((it, i) => <span key={i} className="relchip">{it}</span>)}</div>
            </div>
          ))}
          {rels.length > 0 && <div className="muted" style={{ fontSize: 11 }}>{t("m.relnote")}</div>}
          <div className="fld" style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 12 }}>
            <label style={{ color: "var(--bad)" }}>{t("e.danger")}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn--g" onClick={unpublishEntry} disabled={delBusy !== ""}><Icon name="eye" />{delBusy === "unpub" ? "…" : t("e.unpublish")}</button>
              <button className="btn btn--g" style={{ color: "var(--bad)", borderColor: "var(--bad)" }} onClick={() => { setDelAck(false); setConfirmDel(true); }} disabled={delBusy !== ""}><Icon name="trash" />{t("e.delete")}</button>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>{t("e.dangerNote")}</div>
          </div>
          </div>

          <aside className="ed-preview">
            <div className="pv-h"><Icon name="eye" />{lang === "th" ? "ตัวอย่างสด" : "Live preview"}</div>
            <div className="pv-card">
              {pvImg
                ? <div className="pv-cover"><img src={pvImg} alt="" /></div>
                : <div className="pv-tile" style={{ background: pvAccent }}>{pvTitle[0]?.toUpperCase() || "•"}</div>}
              <div className="pv-card-in">
                <span className="pv-badge">{typeName}</span>
                <h4 className="pv-title">{pvTitle}</h4>
                {pvBody && <p className="pv-body">{pvBody.slice(0, 180)}{pvBody.length > 180 ? "…" : ""}</p>}
                {pvUrl && pvUrl !== "#" && <div className="pv-url"><Icon name="code" /><span>{pvUrl}</span></div>}
              </div>
            </div>
            <div className="pv-note">{lang === "th" ? "อัปเดตสดตามที่คุณพิมพ์ · เผยแพร่จริงเมื่อกด Publish" : "Updates live as you type · goes live on Publish"}</div>
          </aside>
          </div>
          )}
        </div>

        <div className="ovfoot">
          <span className="sp">
            {msg ? <span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span> : t("e.draftNote")}
          </span>
          <button className="btn btn--g" onClick={onClose}>{t("e.cancel")}</button>
          <button className="btn btn--g" onClick={publish} disabled={busy !== ""}>
            <Icon name="spark" />{busy === "publish" ? t("e.publishing") : t("e.publish")}
          </button>
          <button className="btn btn--p" onClick={save} disabled={busy !== "" || loading}>
            {busy === "save" ? t("e.saving") : t("e.save")}
          </button>
        </div>
      </div>

      {confirmDel && (
        <div className="scrim" style={{ zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirmDel(false)}>
          <div className="panel" style={{ maxWidth: 440, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: "var(--bad)" }}><Icon name="trash" /> {t("e.delTitle")}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{t("e.delWarn")} <b style={{ color: "var(--ink, inherit)" }}>{fields.find((f) => f.key === "title")?.value || typeName + " " + docId.slice(0, 8)}</b></p>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "12px 0" }}>
              <input type="checkbox" checked={delAck} onChange={(e) => setDelAck(e.target.checked)} />
              {t("e.delAck")}
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn--g" onClick={() => setConfirmDel(false)} disabled={delBusy === "del"}>{t("e.cancel")}</button>
              <button className="btn btn--p" style={{ background: "var(--bad)", borderColor: "var(--bad)" }} disabled={!delAck || delBusy === "del"} onClick={deleteEntry}>
                <Icon name="trash" />{delBusy === "del" ? t("e.deleting") : t("e.delConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
