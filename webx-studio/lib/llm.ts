// LLM-agnostic layer. All AI calls go through here → a LiteLLM proxy
// (OpenAI-compatible), so the provider/model is swappable per tenant/env with
// zero feature-code changes. Server-only: keys never reach the browser.
import "server-only";

const URL = (process.env.LITELLM_URL || "").replace(/\/$/, "");      // e.g. http://localhost:4000
const KEY = process.env.LITELLM_KEY || "";                           // LiteLLM master/virtual key
const MODEL = process.env.LITELLM_MODEL || "webx-default";
const EMBED_MODEL = process.env.LITELLM_EMBED_MODEL || "webx-embed";

export const llmConfigured = () => Boolean(URL);

type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

async function call(path: string, body: unknown): Promise<any> {
  if (!URL) throw new Error("LLM_NOT_CONFIGURED");
  const r = await fetch(URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(KEY ? { Authorization: "Bearer " + KEY } : {}) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("LLM_HTTP_" + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200));
  return r.json();
}

function msgs(prompt: string, system?: string): Msg[] {
  const m: Msg[] = [];
  if (system) m.push({ role: "system", content: system });
  m.push({ role: "user", content: prompt });
  return m;
}

/** Free-text generation. */
export async function generate(o: { prompt: string; system?: string; model?: string; maxTokens?: number; temperature?: number }): Promise<string> {
  const j = await call("/chat/completions", {
    model: o.model || MODEL, messages: msgs(o.prompt, o.system),
    max_tokens: o.maxTokens ?? 900, temperature: o.temperature ?? 0.7,
  });
  return j?.choices?.[0]?.message?.content ?? "";
}

/** JSON-schema-constrained output — schema-aware actions never break structured content. */
export async function structured<T = any>(o: { prompt: string; system?: string; schema: any; model?: string }): Promise<T> {
  const j = await call("/chat/completions", {
    model: o.model || MODEL, messages: msgs(o.prompt, o.system), temperature: 0.4,
    response_format: { type: "json_schema", json_schema: { name: "webx_out", schema: o.schema, strict: true } },
  });
  const raw = j?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(raw) as T; }
  catch { return JSON.parse(String(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")) as T; }
}

/** Embeddings for RAG — provider-agnostic. Keep one embed model per vector index. */
export async function embed(texts: string[], model?: string): Promise<number[][]> {
  const j = await call("/embeddings", { model: model || EMBED_MODEL, input: texts });
  return (j?.data ?? []).map((d: any) => d.embedding as number[]);
}
