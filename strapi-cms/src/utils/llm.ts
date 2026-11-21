/**
 * One call to an OpenAI-compatible /chat/completions endpoint (the LiteLLM
 * proxy in platform/webx/litellm, or anything speaking the same protocol).
 * Configuration comes from the environment; see litellm/README.md:
 *
 *   LITELLM_URL         proxy base URL, e.g. http://localhost:4000 (unset = no LLM)
 *   LITELLM_KEY         bearer key (master or per-tenant virtual key)
 *   LITELLM_MODEL       model alias, default "webx-default"
 *   LITELLM_ASK_MODEL   model for the public site assistant (default: LITELLM_MODEL)
 *   LITELLM_TIMEOUT_MS  give up after this long, default 20000
 */
export type LlmConfig = { url: string; key?: string; model: string; timeoutMs?: number };

export function llmConfig(env: Record<string, string | undefined> = process.env, purpose: 'ask' | 'general' = 'general'): LlmConfig | null {
  const url = (env.LITELLM_URL || '').replace(/\/$/, '');
  if (!url) return null;
  const model = (purpose === 'ask' && env.LITELLM_ASK_MODEL) || env.LITELLM_MODEL || 'webx-default';
  return { url, key: env.LITELLM_KEY || '', model, timeoutMs: Number(env.LITELLM_TIMEOUT_MS) || 20_000 };
}

export async function llmChat(cfg: LlmConfig, system: string, prompt: string, maxTokens = 700, temperature = 0.4): Promise<string> {
  const r = await fetch(cfg.url + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}) },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(cfg.timeoutMs || 20_000),
  });
  if (!r.ok) throw new Error('llm ' + r.status);
  const j: any = await r.json();
  return String(j?.choices?.[0]?.message?.content || '');
}
