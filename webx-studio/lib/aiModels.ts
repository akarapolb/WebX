// The models the AI gateway (LiteLLM) really serves, read from its own /model/info (which carries no API keys): the
// alias Studio asks for, what it points at, and the default. Used by the Agent settings page, the model picker in the
// chat, and to check a model a user picked before a run uses it.
import "server-only";

export type GatewayModel = { alias: string; model: string; provider: string; host: string; kind: "chat" | "embedding"; custom?: boolean };
export type Gateway = { models: GatewayModel[]; defaultModel: string; embedModel: string; reachable: boolean; reason?: string; canAdd?: boolean };

const hostOf = (u: unknown): string => {
  try { return u ? new URL(String(u)).host : ""; } catch { return ""; }
};

let cache: { at: number; value: Gateway } | null = null;
const TTL_MS = 30_000;

/** Forget the cached list (after a model is added or removed). */
export function resetGatewayCache() { cache = null; }

export async function gatewayModels(): Promise<Gateway> {
  const defaultModel = process.env.LITELLM_MODEL || "webx-default";
  const embedModel = process.env.LITELLM_EMBED_MODEL || "webx-embed";
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const base = (process.env.LITELLM_URL || "").replace(/\/$/, "");
  if (!base) return { models: [], defaultModel, embedModel, reachable: false, reason: "not_configured" };
  let value: Gateway;
  try {
    const r = await fetch(base + "/model/info", {
      headers: { Authorization: "Bearer " + (process.env.LITELLM_KEY || "") },
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!r.ok) return { models: [], defaultModel, embedModel, reachable: false, reason: "gateway_" + r.status };
    const j: any = await r.json();
    const models: GatewayModel[] = (Array.isArray(j?.data) ? j.data : []).map((m: any) => {
      const underlying = String(m?.litellm_params?.model || "");
      const alias = String(m?.model_name || "");
      return {
        alias, model: underlying, provider: underlying.includes("/") ? underlying.split("/")[0] : "",
        host: hostOf(m?.litellm_params?.api_base),
        kind: alias === embedModel || /embed/i.test(alias) ? "embedding" : "chat",
        ...(m?.model_info?.db_model ? { custom: true } : {}),
      } as GatewayModel;
    }).filter((m: GatewayModel) => m.alias);
    // /health/readiness says whether the gateway has a database; without one it cannot store a model added at runtime.
    const ready: any = await fetch(base + "/health/readiness", { signal: AbortSignal.timeout(5000), cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    value = { models, defaultModel, embedModel, reachable: true, canAdd: String(ready?.db || "").toLowerCase() === "connected" };
  } catch {
    return { models: [], defaultModel, embedModel, reachable: false, reason: "unreachable" };
  }
  cache = { at: Date.now(), value };
  return value;
}

/** The alias if the gateway serves it as a chat model, otherwise "" (a client-supplied name is never trusted as is). */
export async function validChatModel(alias: unknown): Promise<string> {
  if (typeof alias !== "string" || !alias) return "";
  const g = await gatewayModels();
  return g.models.some((m) => m.alias === alias && m.kind === "chat") ? alias : "";
}
