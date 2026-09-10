# WebX AI gateway — LiteLLM (LLM-agnostic)

All WebX AI features call a single LiteLLM proxy (OpenAI-compatible), so the
LLM provider/model is swappable per tenant/env with no feature-code changes.

## Run
```bash
pip install "litellm[proxy]"
export ANTHROPIC_API_KEY=...   # and/or GEMINI_API_KEY / OPENAI_API_KEY
export LITELLM_MASTER_KEY=sk-webx-...     # any strong secret
litellm --config litellm/config.yaml --port 4000
```

## Point WebX at it (webx-studio/.env.local)
```
LITELLM_URL=http://localhost:4000
LITELLM_KEY=sk-webx-...        # master key, or a per-tenant virtual key
LITELLM_MODEL=webx-default
LITELLM_EMBED_MODEL=webx-embed
```

## Per-tenant model + budgets
Mint a virtual key per tenant (own model allow-list + monthly budget) via
`POST /key/generate` on the proxy, and store it as that tenant's `LITELLM_KEY`.
For a PDPA-sensitive Thai-gov tenant, point its key at `webx-local` (Ollama/vLLM)
so no content leaves the perimeter.

If LITELLM_URL is unset, WebX AI features degrade gracefully (fall back to their
non-LLM behavior) — nothing breaks without keys.

## WebX Agent (Phase 8) — tool-calling requirement

The WebX Agent (webx-studio/lib/agent/*) is the one caller that needs real
OpenAI-shaped tool-calling (`tools`/`tool_choice` in the request,
`message.tool_calls` in the response) — `lib/llm.ts`'s `generate()`/
`structured()` don't need this, only `chat()` does. Every model above
supports it through LiteLLM's own translation layer, but depth of support
still varies by provider: `webx-default` (Claude) and `webx-local`
(recent Llama/Qwen builds via Ollama) are the most reliable; a fallback
model swapped in via `router_settings.fallbacks` should be verified for
tool-calling specifically before relying on it for agent traffic, not just
for plain generation — a model that silently ignores `tools` and answers in
prose instead will make the agent's own turn loop treat every message as
final text (see `webx-studio/lib/agent/engine/loop.ts`), not a hard error,
so a bad fallback here fails quietly rather than loudly.

`webx-studio/tests/harness/mockLlmServer.ts` stands in for a real LiteLLM
proxy in `e2e/tests/agent.spec.ts` — a scenario-driven `/chat/completions`
server (scenarios in `webx-studio/tests/scenarios/`), no real model calls,
that also rejects any request breaking the tool-calling protocol. See
`e2e/README.md`'s own Suite 5 section for how to run it.
