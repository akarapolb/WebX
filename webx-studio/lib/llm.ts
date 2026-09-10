// LLM-agnostic layer. All AI calls go through here → a LiteLLM proxy
// (OpenAI-compatible), so the provider/model is swappable per tenant/env with
// zero feature-code changes. Server-only: keys never reach the browser.
import "server-only";
import { LlmError, classifyHttp, parseRetryAfter } from "./agent/engine/errors";
import type { ChatReply, ChatRequest, ToolCall, ToolSpec, WireMsg } from "./agent/engine/types";

const URL = (process.env.LITELLM_URL || "").replace(/\/$/, "");      // e.g. http://localhost:4000
const KEY = process.env.LITELLM_KEY || "";                           // LiteLLM master/virtual key
const MODEL = process.env.LITELLM_MODEL || "webx-default";
const EMBED_MODEL = process.env.LITELLM_EMBED_MODEL || "webx-embed";

export const llmConfigured = () => Boolean(URL);

export { LlmError };
export type { ToolCall, ToolSpec };
export type Msg = WireMsg;

/** Throws LlmError (with a retry-relevant `kind`) for network failures,
 * timeouts and HTTP errors. The caller's own abort is rethrown unchanged. */
async function call(path: string, body: unknown, signal?: AbortSignal): Promise<any> {
  if (!URL) throw new Error("LLM_NOT_CONFIGURED");
  let r: Response;
  try {
    r = await fetch(URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(KEY ? { Authorization: "Bearer " + KEY } : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (e: any) {
    if (e?.name === "TimeoutError" || signal?.reason?.name === "TimeoutError") {
      throw new LlmError("LLM request timed out", { status: 0, kind: "timeout" });
    }
    if (signal?.aborted || e?.name === "AbortError") throw e;
    throw new LlmError("LLM_NETWORK: " + String(e?.message || e).slice(0, 200), { status: 0, kind: "network" });
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new LlmError("LLM_HTTP_" + r.status + ": " + text.slice(0, 200), {
      status: r.status,
      kind: classifyHttp(r.status, text),
      retryAfterMs: parseRetryAfter(r.headers.get("retry-after")),
      body: text.slice(0, 2000),
    });
  }
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

/** One tool-calling turn for the WebX Agent engine (lib/agent/engine/loop.ts).
 * Per-turn rather than token-streamed: tool-call argument streaming is the
 * least consistent part of LiteLLM's OpenAI-compatible surface across
 * providers. Besides the message, it returns what the engine needs to keep a
 * long run healthy: the provider's reasoning (Kimi's `reasoning_content`,
 * Anthropic's `thinking_blocks`, which must be echoed back within a turn),
 * `finish_reason`, and the model that actually served the request (a router
 * fallback can differ from the alias asked for). */
export async function chat(o: ChatRequest): Promise<ChatReply> {
  const body: Record<string, any> = {
    model: o.model || MODEL, messages: o.messages,
    max_tokens: o.maxTokens ?? 1200, temperature: o.temperature ?? 0.4,
  };
  if (o.tools?.length) { body.tools = o.tools; body.tool_choice = "auto"; }
  const j = await call("/chat/completions", body, o.signal);
  const choice = j?.choices?.[0] ?? {};
  const m = choice.message ?? {};
  return {
    message: {
      content: typeof m.content === "string" ? m.content : null,
      tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls : undefined,
      ...(typeof m.reasoning_content === "string" && m.reasoning_content ? { reasoning_content: m.reasoning_content } : {}),
      ...(Array.isArray(m.thinking_blocks) && m.thinking_blocks.length ? { thinking_blocks: m.thinking_blocks } : {}),
    },
    usage: j?.usage ? { prompt_tokens: j.usage.prompt_tokens ?? 0, completion_tokens: j.usage.completion_tokens ?? 0 } : undefined,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
    model: typeof j?.model === "string" ? j.model : undefined,
  };
}

/** Embeddings for RAG — provider-agnostic. Keep one embed model per vector index. */
export async function embed(texts: string[], model?: string): Promise<number[][]> {
  const j = await call("/embeddings", { model: model || EMBED_MODEL, input: texts });
  return (j?.data ?? []).map((d: any) => d.embedding as number[]);
}
