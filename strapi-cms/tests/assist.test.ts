// Site assistant: retrieval → answer, with and without an LLM. The LLM is a
// local mock of the OpenAI-compatible /chat/completions endpoint LiteLLM
// serves, so no real model, key or account is involved.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { rank, type Doc } from '../src/utils/retrieval';
import { composeAnswer, checkCitations } from '../src/utils/answer';
import { llmChat, llmConfig } from '../src/utils/llm';

const docs: Doc[] = [
  { id: 'faq-1', kind: 'faq', title: 'What is the EGDI?', text: 'The UN E-Government Development Index (EGDI) measures online services, telecom infrastructure and human capital.', url: '/en/dgahub/knowledge' },
  { id: 'ds-1', kind: 'dataset', title: 'UN EGDI: score and rank', text: 'THA 2024 0.8351 52; THA 2026 0.7732 72', url: '/en/dgahub/indices' },
  { id: 'page-1', kind: 'page', title: 'Open data', text: 'Download every dataset as CSV or JSON.', url: '/en/dgahub/open-data' },
];

// Mock LiteLLM: records requests, answers per scenario set in `reply`.
let reply: (body: any) => { status?: number; content?: string; delayMs?: number } = () => ({ content: '' });
const seen: any[] = [];
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    seen.push({ url: req.url, auth: req.headers.authorization, body });
    const r = reply(body);
    setTimeout(() => {
      res.writeHead(r.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: r.content ?? '' } }] }));
    }, r.delayMs || 0);
  });
});
let env: Record<string, string> = {};
let cfg: NonNullable<ReturnType<typeof llmConfig>>;
before(async () => {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  env = { LITELLM_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, LITELLM_KEY: 'sk-test', LITELLM_ASK_MODEL: 'webx-thai', LITELLM_TIMEOUT_MS: '300' };
  cfg = llmConfig(env, 'ask')!;
});
after(() => server.close());
const ask = (s: string, p: string) => llmChat(cfg, s, p, 600);

test('config: no LITELLM_URL means no LLM; ask model and timeout are configurable', () => {
  assert.equal(llmConfig({}), null);
  assert.equal(cfg.model, 'webx-thai');
  assert.equal(llmConfig({ ...env, LITELLM_ASK_MODEL: '' }, 'ask')!.model, 'webx-default');
  assert.equal(cfg.timeoutMs, 300);
});

test('without an LLM the answer quotes the best passage and still lists sources', async () => {
  const hits = rank(docs, 'what is the EGDI');
  const a = await composeAnswer(hits, 'what is the EGDI', 'en', null);
  assert.equal(a.mode, 'extractive');
  assert.match(a.answer!, /^The UN E-Government Development Index/);
  assert.ok(a.sources.length >= 1);
  assert.deepEqual(a.sources[0], { n: 1, kind: 'faq', title: 'What is the EGDI?', url: '/en/dgahub/knowledge' });
});

test('with an LLM: OpenAI-shaped request with numbered sources, answer keeps valid citations only', async () => {
  reply = () => ({ content: "Thailand's 2026 EGDI score is 0.7732 [2], rank 72 [2] [9]." });
  const q = "Thailand EGDI score 2026";
  const hits = docs.map((d) => ({ ...d, score: 1 })); // three numbered sources
  const a = await composeAnswer(hits, q, 'en', ask);
  assert.equal(a.mode, 'llm');
  assert.equal(a.answer, "Thailand's 2026 EGDI score is 0.7732 [2], rank 72 [2].");
  assert.ok(a.sources.length >= 2, 'sources always returned');
  assert.deepEqual(a.cited, [2]);
  const req = seen.at(-1);
  assert.equal(req.url, '/chat/completions');
  assert.equal(req.auth, 'Bearer sk-test');
  assert.equal(req.body.model, 'webx-thai');
  assert.equal(req.body.messages[0].role, 'system');
  assert.match(req.body.messages[0].content, /ONLY the numbered sources/);
  assert.match(req.body.messages[1].content, /^Sources:\n\[1\] /);
  assert.match(req.body.messages[1].content, /Question: Thailand EGDI score 2026$/);
});

test('Thai questions get the Thai system prompt', async () => {
  reply = () => ({ content: 'คะแนน 0.7732 [1]' });
  const a = await composeAnswer(rank(docs, 'EGDI 2026'), 'EGDI 2026', 'th', ask);
  assert.equal(a.mode, 'llm');
  assert.match(seen.at(-1).body.messages[0].content, /ตอบเป็นภาษาไทย/);
});

for (const [name, r] of [
  ['an HTTP error', { status: 500 }],
  ['an empty reply', { content: '   ' }],
  ['a timeout', { content: 'late [1]', delayMs: 1000 }],
] as const) {
  test(`LLM failure (${name}) falls back to the quote, with sources`, async () => {
    reply = () => r;
    const hits = rank(docs, 'what is the EGDI');
    const a = await composeAnswer(hits, 'what is the EGDI', 'en', ask);
    assert.equal(a.mode, 'extractive');
    assert.ok(a.answer && a.sources.length);
  });
}

test('nothing relevant: no answer and no sources, the LLM is not called', async () => {
  const before = seen.length;
  const a = await composeAnswer(rank(docs, 'zzzz qqqq'), 'zzzz qqqq', 'en', ask);
  assert.deepEqual(a, { answer: null, mode: 'none', sources: [], cited: [] });
  assert.equal(seen.length, before);
});

test('checkCitations drops numbers outside the source list', () => {
  assert.deepEqual(checkCitations('A [1] B [3] C [0]', 2), { text: 'A [1] B C', cited: [1] });
});

test('the quote skips a too-short passage (e.g. a glossary label) for a real sentence', async () => {
  const hits = [
    { id: 'g', kind: 'page', title: 'EGDI', text: 'E-Government Development Index (UN)', url: '/a', score: 3 },
    { ...docs[0], score: 2 },
  ];
  const a = await composeAnswer(hits, 'what is the EGDI', 'en', null);
  assert.match(a.answer!, /^The UN E-Government Development Index/);
  assert.deepEqual(a.cited, [2]);
  assert.equal(a.sources.length, 2, 'both still listed as sources');
});
