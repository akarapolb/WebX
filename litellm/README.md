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
