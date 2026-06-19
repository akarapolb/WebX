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

function labelize(k: string) {
  return k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
}

export default function EntryEditor({
  uid, docId, locale, typeName, onClose, onSaved,
}: {
  uid: string; docId: string; locale?: string; typeName: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLang();
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "publish">("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [media, setMedia] = useState<{ key: string; url: string; newId?: number } | null>(null);
  const [rels, setRels] = useState<{ key: string; items: string[] }[]>([]);
  const [uploading, setUploading] = useState(false);
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
          .filter((k) => !SYS.has(k) && (typeof e[k] === "string" || (RICH.has(k) && e[k] == null)))
          .slice(0, 12)
          .map((k) => {
            const v = typeof e[k] === "string" ? (e[k] as string) : "";
            const kind: Kind = RICH.has(k) ? "rich" : (LONG.has(k) || v.length > 100 || v.includes("\n")) ? "textarea" : "input";
            return { key: k, value: v, initial: v, kind };
          });
        fs.sort((a, b) => ["input", "textarea", "rich"].indexOf(a.kind) - ["input", "textarea", "rich"].indexOf(b.kind));
        setFields(fs);
        // media (single file w/ url) + relations (arrays of records)
        let m: { key: string; url: string } | null = null;
        const rs: { key: string; items: string[] }[] = [];
        for (const k of Object.keys(e)) {
          if (SYS.has(k) || k === "localizations") continue;
          const v = e[k];
          if (v && typeof v === "object" && !Array.isArray(v) && typeof v.url === "string") { if (!m) m = { key: k, url: v.url }; }
          else if (Array.isArray(v) && v.length && typeof v[0] === "object") {
            rs.push({ key: k, items: v.slice(0, 12).map((o: any) => o.title || o.name || o.label || ("#" + (o.documentId ?? o.id))) });
          }
        }
        setMedia(m); setRels(rs);
      } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
      finally { setLoading(false); }
    })();
    return () => { if (typer.current) clearInterval(typer.current); };
  }, [base]);

  function setVal(key: string, value: string) {
    setFields((f) => f.map((x) => (x.key === key ? { ...x, value } : x)));
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
      if (r.ok) { const j = await r.json(); const f = Array.isArray(j) ? j[0] : j; if (f?.id) setMedia((m) => ({ key: m?.key || "coverImage", url: f.url, newId: f.id })); }
      else setMsg({ t: "Upload failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Upload failed", ok: false }); }
    finally { setUploading(false); }
  }

  async function save() {
    const changed = fields.filter((f) => f.value !== f.initial);
    if (changed.length === 0 && !media?.newId) { setMsg({ t: t("e.nochange"), ok: false }); return; }
    setBusy("save"); setMsg(null);
    const payload: Record<string, any> = {};
    changed.forEach((f) => (payload[f.key] = f.value));
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
    const url = "/api/strapi/content-manager/collection-types/" + uid + "/" + docId + "/actions/publish" + (locale ? "?locale=" + locale : "");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (r.ok) { setMsg({ t: t("e.publishedOk"), ok: true }); onSaved(); setTimeout(onClose, 800); }
      else setMsg({ t: "Publish failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setBusy(""); }
  }

  const mainAssistKey = (fields.find((f) => f.kind === "rich") ?? fields.find((f) => f.kind === "textarea") ?? fields[0])?.key;

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
          {loading && <div className="muted">{t("e.loading")}</div>}
          {!loading && fields.length === 0 && <div className="muted">{t("e.noFields")}</div>}
          {fields.map((f) => (
            <div className="fld" key={f.key}>
              {f.kind === "input" ? (
                <>
                  <label>{labelize(f.key)}</label>
                  <input value={f.value} onChange={(e) => setVal(f.key, e.target.value)} />
                </>
              ) : (
                <>
                  <div className="ai-row">
                    <label style={{ margin: 0, flex: 1 }}>{labelize(f.key)}</label>
                    {f.key === mainAssistKey && (
                      <button className="ai-chip" onClick={aiAssist} disabled={assisting}>
                        <Icon name="spark" />{assisting ? t("e.drafting") : t("e.aiAssist")}
                      </button>
                    )}
                  </div>
                  {f.kind === "rich"
                    ? <RichText value={f.value} onChange={(html) => setVal(f.key, html)} placeholder={labelize(f.key)} />
                    : <textarea value={f.value} onChange={(e) => setVal(f.key, e.target.value)} />}
                </>
              )}
            </div>
          ))}

          {media && (
            <div className="fld">
              <label>{labelize(media.key)}</label>
              <div className="ed-media">
                {media.url
                  ? <img className="ed-img" src={media.url.startsWith("http") ? media.url : "/api/strapi" + media.url} alt="" />
                  : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                <label className="btn btn--g" style={{ cursor: "pointer" }}>
                  <Icon name="img" />{uploading ? t("m.uploading") : t("m.change")}
                  <input type="file" accept="image/*" hidden disabled={uploading}
                    onChange={(ev) => ev.target.files?.[0] && upload(ev.target.files[0])} />
                </label>
              </div>
            </div>
          )}

          {rels.map((r) => (
            <div className="fld" key={r.key}>
              <label>{labelize(r.key)} · {t("m.related")}</label>
              <div className="relchips">{r.items.map((it, i) => <span key={i} className="relchip">{it}</span>)}</div>
            </div>
          ))}
          {rels.length > 0 && <div className="muted" style={{ fontSize: 11 }}>{t("m.relnote")}</div>}
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
    </>
  );
}
