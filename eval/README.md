# Thai RAG retrieval eval

Validates that retrieval actually surfaces the right Thai/government source for a
question — *before* you lock the RAG stack, and as a CI quality gate (keyword mode
runs on every push/PR via `.github/workflows/ci.yml`'s `eval-thai-retrieval` job,
against a freshly-seeded throwaway Strapi instance — a 2026-09-12 audit fix; this
claim used to be aspirational, not actually wired in). Zero dependencies (Node 18+).

Two modes, scored side by side:
- **keyword** — always runs. Thai-friendly character **3-gram** overlap (Jaccard),
  so it works on Thai text that has no word spaces. A sanity floor for retrieval.
- **semantic** — runs when `LITELLM_URL` is set. Embeddings + cosine, i.e. the
  same retrieval the app's RAG uses — provider-agnostic via LiteLLM.

## Run
```bash
export STRAPI_URL=http://localhost:1337        # corpus source (public read)
# optional — turns on the semantic run:
export LITELLM_URL=http://localhost:4000
export LITELLM_KEY=<key>
node eval/thai-eval.mjs
```

Output: per-case hit/miss for each mode, then a scorecard with **recall@k** and
**MRR**. Exit code `2` if keyword recall drops below the floor (CI gate);
`0` on pass.

```
Scorecard (n=8):
  keyword   recall@5 = 100%   MRR = 0.938
```

## Dataset — `dataset.thai.json`
```jsonc
{
  "k": 5,
  "cases": [
    { "q": "แอป ทางรัฐ คือ อะไร ...", "expect": ["ทางรัฐ"] }
  ]
}
```
- `q` — the question. Separate key words with spaces; it helps the keyword mode
  and reads naturally for the semantic mode.
- `expect` — substrings a *relevant* source should contain. A case counts as a
  hit if any top-k result contains any `expect` string.

The shipped set is tuned to the DGA seed content (corpus = `articles`,
`services`, `faqs`). Extend it with your own domain questions — the harness
scales to as many cases as you add.

## Why it matters
Public RAG benchmarks are English-only. Thai government content (no word
segmentation, formal register, domain acronyms) needs its own eval before you
trust a retrieval setup. This is that eval — and a gate that fails the build if
a change quietly regresses Thai recall.
