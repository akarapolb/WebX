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
const isImageFile = (mime?: string, url?: string) => (mime ? mime.startsWith("image/") : /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(url || ""));
const mediaSrc = (url: string) => (url.startsWith("http") ? url : "/api/strapi" + url);

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
  const [media, setMedia] = useState<{ key: string; url: string; mime?: string; name?: string; newId?: number } | null>(null);
  const [rels, setRels] = useState<{ key: string; items: string[] }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [revBusy, setRevBusy] = useState(false);
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
        let m: { key: string; url: string; mime?: string; name?: string } | null = null;
        const rs: { key: string; items: string[] }[] = [];
        for (const k of Object.keys(e)) {
          if (SYS.has(k) || k === "localizations") continue;
          const v = e[k];
          if (v && typeof v === "object" && !Array.isArray(v) && typeof v.url === "string") { if (!m) m = { key: k, url: v.url, mime: v.mime, name: v.name }; }
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
              <button className="btn btn--g" style={releases.length > 0 ? {} : { marginLeft: "auto" }} onClick={submitReview} disabled={revBusy || review?.stage === "in_review"}>
                <Icon name="check" />{revBusy ? t("rv.submitting") : t("rv.submit")}
              </button>
            </div>
          )}
          {loading && <div className="muted">{t("e.loading")}</div>}
          {!loading && fields.length === 0 && <div className="muted">{t("e.noFields")}</div>}
          {fields.filter((f) => !fp.hidden.has(f.key)).map((f) => {
            const ro = fp.readonly.has(f.key);
            const lock = ro ? <span className="muted" style={{ fontWeight: 500 }}> · {t("e.locked")}</span> : null;
            return (
              <div className={"fld" + (ro ? " fld--ro" : "")} key={f.key}>
                {f.kind === "input" ? (
                  <>
                    <label>{labelize(f.key)}{lock}</label>
                    <input value={f.value} onChange={(e) => setVal(f.key, e.target.value)} disabled={ro} />
                  </>
                ) : (
                  <>
                    <div className="ai-row">
                      <label style={{ margin: 0, flex: 1 }}>{labelize(f.key)}{lock}</label>
                      {f.key === mainAssistKey && !ro && (
                        <button className="ai-chip" onClick={aiAssist} disabled={assisting}>
                          <Icon name="spark" />{assisting ? t("e.drafting") : t("e.aiAssist")}
                        </button>
                      )}
                    </div>
                    {f.kind === "rich"
                      ? <RichText value={f.value} onChange={(html) => setVal(f.key, html)} placeholder={labelize(f.key)} />
                      : <textarea value={f.value} onChange={(e) => setVal(f.key, e.target.value)} disabled={ro} />}
                  </>
                )}
              </div>
            );
          })}

          {media && (
            <div className="fld">
              <label>{labelize(media.key)}</label>
              <div className="ed-media">
                {media.url
                  ? (isImageFile(media.mime, media.url)
                    ? <img className="ed-img" src={mediaSrc(media.url)} alt="" />
                    : <a className="ed-img ed-file" href={mediaSrc(media.url)} target="_blank" rel="noreferrer"><Icon name="doc" /><span>{media.name || media.url.split("/").pop()}</span></a>)
                  : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                <label className="btn btn--g" style={{ cursor: "pointer" }}>
                  <Icon name="img" />{uploading ? t("m.uploading") : t("m.change")}
                  <input type="file" hidden disabled={uploading}
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
