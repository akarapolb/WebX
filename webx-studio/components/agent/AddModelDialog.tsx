"use client";
// The pop-up to add an AI model: pick the provider, give it a name, the provider's model id and the API key. The key
// goes to the AI gateway (which stores it encrypted) and is never shown again. The server checks the key works with one
// tiny request before keeping the model.
import { useMemo, useState } from "react";
import Icon from "../Icon";
import { useLang } from "../LangProvider";
import { PROVIDERS, providerById, checkNewModel, slugAlias, type ProviderId } from "@/lib/aiModelAdmin";

export default function AddModelDialog({ tenant, canAdd, existingAliases, onClose, onAdded }: {
  tenant: string;
  /** Whether the gateway can store a model right now (it needs its database). */
  canAdd: boolean;
  existingAliases: string[];
  onClose: () => void;
  onAdded: (alias: string) => void;
}) {
  const { t } = useLang();
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [alias, setAlias] = useState("");
  const [lastAuto, setLastAuto] = useState(""); // the name we filled in ourselves, so changing provider can replace it but never a typed name
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null);

  const p = providerById(provider)!;
  const checked = useMemo(() => checkNewModel({ alias, provider, model, apiKey, apiBase }, existingAliases), [alias, provider, model, apiKey, apiBase, existingAliases]);
  const slug = slugAlias(alias);
  const showBase = Boolean(p.needsBase) || Boolean(apiBase);

  function pick(id: ProviderId) {
    setProvider(id);
    const np = providerById(id)!;
    setModel(np.suggest[0] || "");
    setApiBase("");
    if (!alias || alias === lastAuto) { const a = id === "other" ? "" : slugAlias(np.suggest[0] || ""); setAlias(a); setLastAuto(a); }
  }

  async function submit() {
    if (!checked.ok || busy || !canAdd) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ai/models?tenant=" + encodeURIComponent(tenant), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, provider, model, apiKey, ...(apiBase ? { apiBase } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr({ field: j.field, text: j.error || t("am.failed") }); return; }
      setApiKey(""); // the key is not kept here once it has been sent
      onAdded(j.alias || slug);
    } catch { setErr({ text: t("am.failed") }); }
    finally { setBusy(false); }
  }

  const fieldErr = (f: string) => (!checked.ok && checked.field === f && (alias || model || apiKey)) ? t("am.e." + f) : "";

  return (
    <>
      <div className="scrim" onClick={() => !busy && onClose()} />
      <div className="am-modal" role="dialog" aria-modal="true" aria-label={t("as.addModel")} data-testid="add-model-dialog">
        <div className="ovhead">
          <h3 style={{ flex: 1 }}>{t("as.addModel")}</h3>
          <button className="ic-btn" onClick={onClose} disabled={busy} aria-label={t("imp.close")}><Icon name="close" /></button>
        </div>
        <div className="am-body">
          {!canAdd && <div className="auth-err" data-testid="am-gateway-note" style={{ marginBottom: 12 }}>{t("as.addModelWhy")}</div>}

          <label className="vb-fld"><span>{t("am.provider")}</span>
            <select className="rv-assignee" value={provider} onChange={(e) => pick(e.target.value as ProviderId)} data-testid="am-provider">
              {PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>

          <label className="vb-fld"><span>{t("am.name")}</span>
            <input className="rv-assignee" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="my-claude" data-testid="am-name" />
            <small className={fieldErr("alias") || fieldErr("aliasTaken") ? "auth-err" : "muted"}>
              {fieldErr("alias") || fieldErr("aliasTaken") || (slug ? t("am.nameHint").replace("{a}", slug) : t("am.nameHelp"))}
            </small>
          </label>

          <label className="vb-fld"><span>{t("am.model")}</span>
            <input className="rv-assignee" list="am-model-list" value={model} onChange={(e) => setModel(e.target.value)} placeholder={p.suggest[0] || "model-id"} data-testid="am-model" />
            <datalist id="am-model-list">{p.suggest.map((m) => <option key={m} value={m} />)}</datalist>
            <small className={fieldErr("model") ? "auth-err" : "muted"}>{fieldErr("model") || t("am.modelHelp")}</small>
          </label>

          <label className="vb-fld"><span>{t("am.key")}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="rv-assignee" style={{ flex: 1 }} type={showKey ? "text" : "password"} value={apiKey} autoComplete="off" spellCheck={false}
                onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" data-testid="am-key" />
              <button type="button" className="btn btn--g" onClick={() => setShowKey((v) => !v)} aria-label={t("am.showKey")}><Icon name="eye" /></button>
            </div>
            <small className={fieldErr("apiKey") ? "auth-err" : "muted"}>{fieldErr("apiKey") || t("am.keyHelp")}</small>
          </label>

          {showBase ? (
            <label className="vb-fld"><span>{t("am.base")}</span>
              <input className="rv-assignee" value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder={p.apiBase || "https://api.example.org/v1"} data-testid="am-base" />
              <small className={fieldErr("apiBase") ? "auth-err" : "muted"}>{fieldErr("apiBase") || t("am.baseHelp")}</small>
            </label>
          ) : (
            <button type="button" className="btn btn--g" style={{ marginBottom: 10 }} onClick={() => setApiBase(p.apiBase || " ")}>{t("am.useBase")}</button>
          )}

          {err && <div className="auth-err" data-testid="am-error">{err.text}</div>}
        </div>
        <div className="ovfoot" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn--g" onClick={onClose} disabled={busy}>{t("am.cancel")}</button>
          <button className="btn btn--p" onClick={submit} disabled={!checked.ok || busy || !canAdd} data-testid="am-save">
            <Icon name="check" />{busy ? t("am.testing") : t("am.save")}
          </button>
        </div>
      </div>
    </>
  );
}
