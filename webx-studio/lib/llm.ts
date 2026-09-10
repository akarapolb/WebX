// LLM-agnostic layer. All AI calls go through here → a LiteLLM proxy
// (OpenAI-compatible), so the provider/model is swappable per tenant/env with
// zero feature-code changes. Server-only: keys never reach the browser.
import "server-only";

const URL = (process.env.LITELLM_URL || "").replace(/\/$/, "");      // e.g. http://localhost:4000
const KEY = process.env.LITELLM_KEY || "";                           // LiteLLM master/virtual key
const MODEL = process.env.LITELLM_MODEL || "webx-default";
const EMBED_MODEL = process.env.LITELLM_EMBED_MODEL || "webx-embed";

export const llmConfigured = () => Boolean(URL);

type Role = "system" | "user" | "assistant" | "tool";
type Block = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Msg = { role: Role; content: string | Block[] | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, any> } };

async function call(path: string, body: unknown, signal?: AbortSignal): Promise<any> {
  if (!URL) throw new Error("LLM_NOT_CONFIGURED");
  const r = await fetch(URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(KEY ? { Authorization: "Bearer " + KEY } : {}) },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!r.ok) throw new Error("LLM_HTTP_" + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200));
  return r.json();
}

// cache=true marks the system prompt as a cacheable prefix (Anthropic prompt
// caching via cache_control; LiteLLM forwards it, providers that don't support
// it simply ignore the marker). Opt-in for large, reused system prompts.
function msgs(prompt: string, system?: string, cache?: boolean): Msg[] {
  const m: Msg[] = [];
  if (system) m.push({ role: "system", content: cache ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system });
  m.push({ role: "user", content: prompt });
  return m;
}

/** Free-text generation. */
export async function generate(o: { prompt: string; system?: string; model?: string; maxTokens?: number; temperature?: number; cache?: boolean }): Promise<string> {
  const j = await call("/chat/completions", {
    model: o.model || MODEL, messages: msgs(o.prompt, o.system, o.cache),
    max_tokens: o.maxTokens ?? 900, temperature: o.temperature ?? 0.7,
  });
  return j?.choices?.[0]?.message?.content ?? "";
}

/** JSON-schema-constrained output — schema-aware actions never break structured content. */
export async function structured<T = any>(o: { prompt: string; system?: string; schema: any; model?: string; cache?: boolean }): Promise<T> {
  const j = await call("/chat/completions", {
    model: o.model || MODEL, messages: msgs(o.prompt, o.system, o.cache), temperature: 0.4,
    response_format: { type: "json_schema", json_schema: { name: "webx_out", schema: o.schema, strict: true } },
  });
  const raw = j?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(raw) as T; }
  catch { return JSON.parse(String(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")) as T; }
}

/** Tool-calling chat turn for the WebX Agent (lib/agent/runtime.ts) — the one
 * caller that needs raw message history + tool definitions in and a message +
 * usage back out, rather than generate()/structured()'s single-prompt shape.
 * No `stream` option: v1 emits per-turn SSE events (thinking/tool_call/
 * tool_result/text/done) rather than token deltas — tool-call argument
 * streaming is the least consistent part of LiteLLM's OpenAI-compat surface
 * across Anthropic/Gemini/Ollama, so per-turn events (already a few seconds
 * apart at most) are the more reliable v1 choice; token streaming can be
 * added here later without changing this function's signature. */
export async function chat(o: {
  messages: Msg[]; tools?: ToolSpec[]; model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal;
}): Promise<{ message: { content: string | null; tool_calls?: ToolCall[] }; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const body: Record<string, any> = {
    model: o.model || MODEL, messages: o.messages,
    max_tokens: o.maxTokens ?? 1200, temperature: o.temperature ?? 0.4,
  };
  if (o.tools?.length) { body.tools = o.tools; body.tool_choice = "auto"; }
  const j = await call("/chat/completions", body, o.signal);
  const m = j?.choices?.[0]?.message ?? {};
  return {
    message: { content: m.content ?? null, tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls : undefined },
    usage: j?.usage ? { prompt_tokens: j.usage.prompt_tokens ?? 0, completion_tokens: j.usage.completion_tokens ?? 0 } : undefined,
  };
}

/** Embeddings for RAG — provider-agnostic. Keep one embed model per vector index. */
export async function embed(texts: string[], model?: string): Promise<number[][]> {
  const j = await call("/embeddings", { model: model || EMBED_MODEL, input: texts });
  return (j?.data ?? []).map((d: any) => d.embedding as number[]);
}
