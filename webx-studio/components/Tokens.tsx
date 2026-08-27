"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

const lbl: any = { display: "block", fontSize: 12, color: "var(--muted)", margin: "10px 0 4px" };

type ApiToken = {
  id: number; name: string; description?: string;
  type: "read-only" | "full-access" | "custom";
  lifespan: number | null; expiresAt: string | null; lastUsedAt: string | null; createdAt: string;
};
type PermCatalog = Record<string, { controllers: Record<string, string[]> }>;

const LIFESPANS = [
  { label: "No expiration", value: "" },
  { label: "7 days", value: String(7 * 24 * 3600 * 1000) },
  { label: "30 days", value: String(30 * 24 * 3600 * 1000) },
  { label: "90 days", value: String(90 * 24 * 3600 * 1000) },
];

export default function Tokens() {
  const { t } = useLang();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  async function load() {
    setLoading(true); setErr(""); setForbidden(false);
    try {
      const r = await fetch("/api/cms/tokens");
      if (r.status === 403) { setForbidden(true); setLoading(false); return; }
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Could not load tokens"); setLoading(false); return; }
      setTokens(j);
    } catch { setErr("Cannot reach the server"); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function removeToken(id: number) {
    if (confirmId !== id) { setConfirmId(id); return; }
    setRemovingId(id); setConfirmId(null);
    try {
      const r = await fetch(`/api/cms/tokens/${id}`, { method: "DELETE" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || "Could not delete token"); }
      await load();
    } catch { setErr("Cannot reach the server"); }
    setRemovingId(null);
  }

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.tokens")}</h1><p>{t("tok.sub")}</p></div>
        {!forbidden && <button className="btn btn--p" onClick={() => setShowCreate(true)} disabled={loading}><Icon name="plus" /> {t("tok.create")}</button>}
      </div>

      {forbidden && (
        <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{t("tok.forbidden")}</span></div>
      )}

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!forbidden && !err && (
        <div className="panel" style={{ padding: "8px 0", minHeight: 160 }}>
          {loading && <div className="muted" style={{ padding: 20 }}>{t("tok.loading")}</div>}
          {!loading && tokens.length === 0 && <div className="muted" style={{ padding: 20 }}>{t("tok.none")}</div>}
          {!loading && tokens.length > 0 && (
            <table className="tbl">
              <thead><tr><th>{t("tok.colName")}</th><th>{t("tok.colType")}</th><th>{t("tok.colExpires")}</th><th>{t("tok.colLastUsed")}</th><th>{t("tok.colCreated")}</th><th /></tr></thead>
              <tbody>
                {tokens.map((tk) => (
                  <tr key={tk.id}>
                    <td>
                      <b>{tk.name}</b>
                      {tk.description && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{tk.description}</div>}
                    </td>
                    <td><span className="badge b-acc">{tk.type}</span></td>
                    <td className="muted">{tk.expiresAt ? fmt(tk.expiresAt) : t("tok.noExpiry")}</td>
                    <td className="muted">{tk.lastUsedAt ? fmt(tk.lastUsedAt) : t("tok.neverUsed")}</td>
                    <td className="muted">{fmt(tk.createdAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className={"btn " + (confirmId === tk.id ? "btn--p" : "btn--g")}
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        disabled={removingId === tk.id}
                        onClick={() => removeToken(tk.id)}
                      >
                        <Icon name="trash" /> {confirmId === tk.id ? t("u.removeConfirm") : t("tok.revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("tok.foot")}</div>

      {showCreate && <CreateTokenModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </>
  );
}

function CreateTokenModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"read-only" | "full-access" | "custom">("read-only");
  const [lifespan, setLifespan] = useState("");
  const [catalog, setCatalog] = useState<PermCatalog | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ accessKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (type === "custom" && !catalog) {
      fetch("/api/cms/tokens/permissions").then((r) => r.json()).then(setCatalog).catch(() => {});
    }
  }, [type, catalog]);

  const uids = useMemo(() => {
    if (!catalog) return [];
    const all = Object.keys(catalog);
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((u) => u.toLowerCase().includes(q));
  }, [catalog, search]);

  function toggle(uid: string, controller: string, action: string) {
    const key = uid + "." + controller + "." + action;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr(t("nw.needname")); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cms/tokens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), description: description.trim(), type,
          lifespan: lifespan ? Number(lifespan) : null,
          permissions: type === "custom" ? Array.from(selected) : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Could not create the token"); setBusy(false); return; }
      setResult({ accessKey: j.accessKey, name: j.token.name });
    } catch { setErr("Cannot reach the server"); }
    setBusy(false);
  }

  function copyKey() {
    if (!result) return;
    navigator.clipboard?.writeText(result.accessKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  function finish() { onCreated(); onClose(); }

  return (
    <div className="scrim" style={{ zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={result ? undefined : onClose}>
      <div className="panel" style={{ maxWidth: 560, width: "94%", maxHeight: "88vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        {!result && (
          <form onSubmit={submit}>
            <h3 style={{ marginTop: 0 }}><Icon name="plus" /> {t("tok.createTitle")}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{t("tok.createSub")}</p>
            {err && <div className="badge b-warn" style={{ display: "inline-flex", marginBottom: 8 }}><span className="dot" />{err}</div>}

            <label style={lbl}>{t("tok.name")}</label>
            <input className="rv-assignee" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="my-integration" />

            <label style={lbl}>{t("tok.description")}</label>
            <input className="rv-assignee" style={{ width: "100%" }} value={description} onChange={(e) => setDescription(e.target.value)} />

            <label style={lbl}>{t("tok.type")}</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              {(["read-only", "full-access", "custom"] as const).map((ty) => (
                <button key={ty} type="button" onClick={() => setType(ty)}
                  className={"btn " + (type === ty ? "btn--p" : "btn--g")} style={{ flex: 1, padding: "6px 0", fontSize: 12.5 }}>
                  {t("tok.type_" + ty.replace("-", ""))}
                </button>
              ))}
            </div>

            <label style={lbl}>{t("tok.lifespan")}</label>
            <select className="vb-sel" style={{ width: "100%" }} value={lifespan} onChange={(e) => setLifespan(e.target.value)}>
              {LIFESPANS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>

            {type === "custom" && (
              <div style={{ marginTop: 12 }}>
                <label style={lbl}>{t("tok.permissions")}</label>
                <input className="rv-assignee" style={{ width: "100%", marginBottom: 8 }} placeholder={t("tok.searchTypes")}
                  value={search} onChange={(e) => setSearch(e.target.value)} />
                <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--line, rgba(255,255,255,0.12))", borderRadius: 8, padding: 8 }}>
                  {!catalog && <div className="muted" style={{ padding: 8, fontSize: 12.5 }}>{t("sec.loading")}</div>}
                  {catalog && uids.length === 0 && <div className="muted" style={{ padding: 8, fontSize: 12.5 }}>{t("tok.noMatch")}</div>}
                  {catalog && uids.map((uid) => {
                    const controllers = catalog[uid]?.controllers || {};
                    return (
                      <div key={uid} style={{ marginBottom: 8 }}>
                        <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>{uid}</div>
                        {Object.entries(controllers).map(([controller, actions]) => (
                          <div key={controller} style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
                            {actions.map((action) => {
                              const key = uid + "." + controller + "." + action;
                              return (
                                <label key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                                  <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(uid, controller, action)} />
                                  {action}
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{selected.size} {t("tok.selected")}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn--g" onClick={onClose} disabled={busy}>{t("e.cancel")}</button>
              <button type="submit" className="btn btn--p" disabled={busy}>{busy ? t("nw.creating") : t("tok.createBtn")}</button>
            </div>
          </form>
        )}

        {result && (
          <>
            <h3 style={{ marginTop: 0 }}><Icon name="lock" /> {t("tok.resultTitle")}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{t("tok.resultSub")}</p>
            <div className="mono" style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
              background: "var(--panel-2, rgba(255,255,255,0.06))", border: "1px solid var(--line, rgba(255,255,255,0.12))",
              borderRadius: 8, padding: "10px 12px", fontSize: 11.5, wordBreak: "break-all", margin: "12px 0",
            }}>
              <span>{result.accessKey}</span>
              <button className="btn btn--g" style={{ padding: "4px 10px", flex: "none" }} onClick={copyKey}>
                <Icon name={copied ? "check" : "copy"} /> {copied ? t("u.copied") : t("u.copy")}
              </button>
            </div>
            <div className="badge b-warn" style={{ display: "inline-flex", marginBottom: 16 }}>
              <span className="dot" />{t("tok.resultWarn")}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn--p" onClick={finish}>{t("u.done")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
