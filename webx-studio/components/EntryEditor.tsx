"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import RichText from "./RichText";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";
import type { MediaAsset } from "@/lib/cms";
import MediaLibrary from "./MediaLibrary";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "publish">("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [media, setMedia] = useState<{ key: string; url: string; mime?: string; name?: string; newId?: number }[]>([]);
  const [rels, setRels] = useState<{ key: string; items: string[] }[]>([]);
  const [uploadingKey, setUploadingKey] = useState("");
  const [pickerKey, setPickerKey] = useState("");
  const [review, setReview] = useState<any>(null);
  const [revBusy, setRevBusy] = useState(false);
  const [trBusy, setTrBusy] = useState(false);
  const [delBusy, setDelBusy] = useState<"" | "unpub" | "del">("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [delAck, setDelAck] = useState(false);
  const [releases, setReleases] = useState<any[]>([]);
  const [fp, setFp] = useState<{ hidden: Set<string>; readonly: Set<string> }>({ hidden: new Set(), readonly: new Set() });
  const typer = useRef<ReturnType<typeof setInterval> | null>(null);
  const locOpt = locale ? { locale } : undefined;

  useEffect(() => {
    (async () => {
      try {
        const e: any = await cms.entries.get(uid, docId, locOpt);
        const fs: Field[] = Object.keys(e)
          .filter((k) => !SYS.has(k) && (typeof e[k] === "string" || typeof e[k] === "number" || (RICH.has(k) && e[k] == null)))
          .slice(0, 12)
          .map((k) => {
            // Phase 10 — ACF number fields (year/order/etc, see wordpress.ts's
            // normalizePost) round-trip as plain JS numbers; editing them as
            // text is fine since WP/ACF coerces a numeric string back on save.
            const v = typeof e[k] === "number" ? String(e[k]) : typeof e[k] === "string" ? (e[k] as string) : "";
            const kind: Kind = RICH.has(k) ? "rich" : (LONG.has(k) || v.length > 100 || v.includes("\n")) ? "textarea" : "input";
            return { key: k, value: v, initial: v, kind };
          });
        fs.sort((a, b) => ["input", "textarea", "rich"].indexOf(a.kind) - ["input", "textarea", "rich"].indexOf(b.kind));
        setFields(fs);
        // media + relations (arrays of records). Every schema-declared media
        // key gets its own uploader — even when empty (new entries) — not
        // just the first one found (see the plan's Part 2 step 1: this used
        // to hardcode mk[0], which silently hid every media field but the
        // first, e.g. video.subtitles behind video.thumbnail).
        const m: { key: string; url: string; mime?: string; name?: string }[] = [];
        const mk = mediaKeys || [];
        for (const k of mk) {
          const v = e[k];
          m.push((v && typeof v === "object" && typeof v.url === "string") ? { key: k, url: v.url, mime: v.mime, name: v.name } : { key: k, url: "" });
        }
        const rs: { key: string; items: string[] }[] = [];
        for (const k of Object.keys(e)) {
          if (SYS.has(k) || k === "localizations" || mk.includes(k)) continue;
          const v = e[k];
          if (v && typeof v === "object" && !Array.isArray(v) && typeof v.url === "string") { m.push({ key: k, url: v.url, mime: v.mime, name: v.name }); }
          else if (Array.isArray(v) && v.length && typeof v[0] === "object") {
            rs.push({ key: k, items: v.slice(0, 12).map((o: any) => o.title || o.name || o.label || ("#" + (o.documentId ?? o.id))) });
          }
        }
        setMedia(m); setRels(rs);
        try {
          const { data } = await cms.entries.list<any>("api::review.review", { pageSize: 1, sort: "updatedAt:DESC", filter: [{ field: "documentRef", op: "eq", value: docId }] });
          setReview(data[0] || null);
        } catch {}
        try {
          const { data } = await cms.entries.list<any>("api::release.release", { pageSize: 50, sort: "updatedAt:DESC", filter: [{ field: "state", op: "ne", value: "done" }] });
          setReleases(data);
        } catch {}
        try {
          const meU = await cms.auth.me();
          const myRoles = meU?.roles || [];
          if (myRoles.length) {
            const { data } = await cms.entries.list<any>("api::field-policy.field-policy", { pageSize: 100, filter: [{ field: "contentType", op: "eq", value: uid }] });
            const hid = new Set<string>(), ro = new Set<string>();
            data.forEach((p) => { if (myRoles.includes(p.role)) { (Array.isArray(p.hidden) ? p.hidden : []).forEach((f: string) => hid.add(f)); (Array.isArray(p.readonly) ? p.readonly : []).forEach((f: string) => ro.add(f)); } });
            setFp({ hidden: hid, readonly: ro });
          }
        } catch {}
      } catch (err) {
        if (err instanceof CmsError) setMsg({ t: "Could not load entry (HTTP " + err.status + ")", ok: false });
        else setMsg({ t: "Cannot reach the backend.", ok: false });
      }
      finally { setLoading(false); }
    })();
    return () => { if (typer.current) clearInterval(typer.current); };
  }, [uid, docId, locale]);

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

  async function upload(key: string, file: File) {
    setUploadingKey(key); setMsg(null);
    try {
      const asset = await cms.media.upload(file);
      setMedia((arr) => arr.map((m) => (m.key === key ? { ...m, url: asset.url, mime: asset.mime, name: asset.name, newId: asset.id } : m)));
    } catch (err) {
      if (err instanceof CmsError) setMsg({ t: "Upload failed (HTTP " + err.status + ")", ok: false });
      else setMsg({ t: "Upload failed", ok: false });
    }
    finally { setUploadingKey(""); }
  }

  // Media library gap (TOR — search/tag/reuse/crop/caption) — "reuse" half:
  // pick a previously-uploaded asset instead of always uploading a fresh
  // file. Same field-state update as upload() above, just from an asset
  // that already exists rather than a freshly-uploaded one.
  function pick(key: string, asset: MediaAsset) {
    setMedia((arr) => arr.map((m) => (m.key === key ? { ...m, url: asset.url, mime: asset.mime, name: asset.name, newId: asset.id } : m)));
    setPickerKey("");
  }

  async function save() {
    const changed = fields.filter((f) => f.value !== f.initial);
    const mediaChanged = media.filter((m) => m.newId);
    if (changed.length === 0 && mediaChanged.length === 0) { setMsg({ t: t("e.nochange"), ok: false }); return; }
    setBusy("save"); setMsg(null);
    const payload: Record<string, any> = {};
    changed.forEach((f) => (payload[f.key] = f.value));
    mediaChanged.forEach((m) => (payload[m.key] = m.newId));
    try {
      await cms.entries.update(uid, docId, payload, locOpt);
      setFields((f) => f.map((x) => ({ ...x, initial: x.value })));
      setMsg({ t: t("e.savedDraft"), ok: true }); onSaved(); setTimeout(onClose, 700);
    } catch (err) {
      if (err instanceof CmsError) setMsg({ t: "Save failed (HTTP " + err.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setBusy(""); }
  }

  async function publish() {
    setBusy("publish"); setMsg(null);
    try {
      // Publish must reflect what's on screen, not just what was last
      // saved — without this, editing fields and hitting Publish straight
      // away silently discarded the edits and published the entry's old
      // saved state (found live: typed a real title/body, published, the
      // live post still said "Untitled Post" with no content).
      const changed = fields.filter((f) => f.value !== f.initial);
      const mediaChanged = media.filter((m) => m.newId);
      if (changed.length > 0 || mediaChanged.length > 0) {
        const payload: Record<string, any> = {};
        changed.forEach((f) => (payload[f.key] = f.value));
        mediaChanged.forEach((m) => (payload[m.key] = m.newId));
        await cms.entries.update(uid, docId, payload, locOpt);
        setFields((f) => f.map((x) => ({ ...x, initial: x.value })));
      }
      await cms.publish.publish(uid, docId, locOpt);
      setMsg({ t: t("e.publishedOk"), ok: true }); onSaved(); setTimeout(onClose, 800);
    } catch (err) {
      if (err instanceof CmsError) setMsg({ t: "Publish failed (HTTP " + err.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setBusy(""); }
  }

  async function submitReview() {
    setRevBusy(true);
    let actor = "admin";
    try { const u = await cms.auth.me(); if (u?.email) actor = u.email; } catch {}
    const title = fields.find((f) => f.key === "title")?.value || (typeName + " " + docId.slice(0, 6));
    const hist = Array.isArray(review?.history) ? review.history : [];
    const entry = { from: review?.stage || "draft", to: "in_review", by: actor, at: new Date().toISOString() };
    try {
      if (review) {
        await cms.entries.update("api::review.review", String(review.documentId ?? review.id), { stage: "in_review", title, history: [...hist, entry] });
      } else {
        await cms.entries.create("api::review.review", { documentRef: docId, contentType: uid, title, stage: "in_review", requestedBy: actor, history: [entry] });
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
    try {
      await cms.publish.unpublish(uid, docId, locOpt);
      setMsg({ t: t("e.unpublished"), ok: true }); onSaved();
    } catch (err) {
      if (err instanceof CmsError) setMsg({ t: t("e.unpubFail") + " (HTTP " + err.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setDelBusy(""); }
  }
  async function deleteEntry() {
    setDelBusy("del"); setMsg(null);
    try {
      await cms.entries.remove(uid, docId, locOpt);
      setConfirmDel(false); onSaved(); onClose();
    } catch (err) {
      if (err instanceof CmsError) setMsg({ t: t("e.delFail") + " (HTTP " + err.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setDelBusy(""); }
  }

  async function addToRelease(relId: string) {
    const rel = releases.find((r) => String(r.documentId ?? r.id) === String(relId));
    if (!rel) return;
    const items = Array.isArray(rel.items) ? rel.items : [];
    if (items.some((it: any) => it.documentRef === docId)) { setMsg({ t: t("rl.added"), ok: true }); return; }
    const title = fields.find((f) => f.key === "title")?.value || (typeName + " " + docId.slice(0, 6));
    try {
      await cms.entries.update("api::release.release", String(rel.documentId ?? rel.id), { items: [...items, { contentType: uid, documentRef: docId, title }] });
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
              <button className="btn btn--g" style={releases.length > 0 ? {} : { marginLeft: "auto" }} onClick={translate} disabled={trBusy} title={t("tr.hint")}>
                <Icon name="spark" />{trBusy ? t("tr.translating") : t("tr.to") + " " + (trTarget === "th" ? "ไทย" : "EN")}
              </button>
              <button className="btn btn--g" onClick={submitReview} disabled={revBusy || review?.stage === "in_review"}>
                <Icon name="check" />{revBusy ? t("rv.submitting") : t("rv.submit")}
              </button>
            </div>
          )}
          {loading && <div className="muted">{t("e.loading")}</div>}
          {!loading && fields.length === 0 && <div className="muted">{t("e.noFields")}</div>}
          {fields.filter((f) => !fp.hidden.has(f.key)).map((f) => {
            const ro = fp.readonly.has(f.key);
            const lock = ro ? <span className="muted" style={{ fontWeight: 500 }}> · {t("e.locked")}</span> : null;
            const busy = aiBusyKey === f.key;
            return (
              <div className={"fld" + (ro ? " fld--ro" : "")} key={f.key}>
                <div className="ai-row">
                  <label style={{ margin: 0, flex: 1 }}>{labelize(f.key)}{lock}</label>
                  {!ro && (
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
                {f.kind === "input"
                  ? <input data-testid={"field-" + f.key} value={f.value} onChange={(e) => setVal(f.key, e.target.value)} disabled={ro || busy} />
                  : f.kind === "rich"
                    ? <RichText value={f.value} onChange={(html) => setVal(f.key, html)} placeholder={labelize(f.key)} />
                    : <textarea data-testid={"field-" + f.key} value={f.value} onChange={(e) => setVal(f.key, e.target.value)} disabled={ro || busy} />}
              </div>
            );
          })}

          {media.map((m) => (
            <div className="fld" key={m.key}>
              <label>{labelize(m.key)}</label>
              <div className="ed-media">
                {m.url
                  ? (isImageFile(m.mime, m.url)
                    ? <img className="ed-img" src={mediaSrc(m.url)} alt="" />
                    : <a className="ed-img ed-file" href={mediaSrc(m.url)} target="_blank" rel="noreferrer"><Icon name="doc" /><span>{m.name || m.url.split("/").pop()}</span></a>)
                  : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                <label className="btn btn--g" style={{ cursor: "pointer" }}>
                  <Icon name="img" />{uploadingKey === m.key ? t("m.uploading") : t("m.change")}
                  <input type="file" hidden disabled={uploadingKey !== ""}
                    onChange={(ev) => ev.target.files?.[0] && upload(m.key, ev.target.files[0])} />
                </label>
                <button type="button" className="btn btn--g" onClick={() => setPickerKey(m.key)}>
                  <Icon name="doc" />{t("m.browse")}
                </button>
              </div>
            </div>
          ))}

          {pickerKey && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
              onClick={() => setPickerKey("")}>
              <div style={{ width: 720, maxWidth: "92vw", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
                <MediaLibrary onPick={(asset) => pick(pickerKey, asset)} />
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

          <div className="fld" style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 12 }}>
            <label style={{ color: "var(--bad)" }}>{t("e.danger")}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn--g" onClick={unpublishEntry} disabled={delBusy !== ""}><Icon name="eye" />{delBusy === "unpub" ? "…" : t("e.unpublish")}</button>
              <button className="btn btn--g" style={{ color: "var(--bad)", borderColor: "var(--bad)" }} onClick={() => { setDelAck(false); setConfirmDel(true); }} disabled={delBusy !== ""}><Icon name="trash" />{t("e.delete")}</button>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>{t("e.dangerNote")}</div>
          </div>
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
