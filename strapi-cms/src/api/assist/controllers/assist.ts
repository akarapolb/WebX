/**
 * assist controller — public, rate-limited, LLM-agnostic (LiteLLM).
 *  - simplify : rewrite จากภาษาราชการ -> ภาษาที่ประชาชนเข้าใจง่าย
 *  - translate: แปลข้อความเป็นภาษาที่เลือก (on-demand)
 *  - find     : AI service finder (AEO) — ตอบจากบริการ/FAQ ของ tenant พร้อมขั้นตอน
 */
const LITELLM = (process.env.LITELLM_URL || '').replace(/\/$/, '');
const LKEY = process.env.LITELLM_KEY || '';
const MODEL = process.env.LITELLM_MODEL || 'webx-default';
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 20, WINDOW = 60_000; // 20 req / min / IP

function limited(ip: string): boolean {
  const now = Date.now(); const rec = hits.get(ip);
  if (rec && now - rec.t < WINDOW) { if (rec.n >= LIMIT) return true; rec.n++; return false; }
  hits.set(ip, { n: 1, t: now }); return false;
}
async function llm(system: string, prompt: string, maxTokens = 700): Promise<string> {
  const r = await fetch(LITELLM + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(LKEY ? { Authorization: 'Bearer ' + LKEY } : {}) },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.4 }),
  });
  if (!r.ok) throw new Error('llm ' + r.status);
  const j: any = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}
const ipOf = (ctx: any) => String(ctx.request.ip || ctx.request.header?.['x-forwarded-for'] || '?');
const gate = (ctx: any): boolean => {
  if (!LITELLM) { ctx.status = 503; ctx.body = { error: 'AI not configured' }; return false; }
  if (limited(ipOf(ctx))) { ctx.status = 429; ctx.body = { error: 'Too many requests' }; return false; }
  return true;
};

export default {
  async simplify(ctx: any) {
    if (!gate(ctx)) return;
    const text = String(ctx.request.body?.text || '').slice(0, 6000);
    if (!text) { ctx.status = 400; ctx.body = { error: 'text required' }; return; }
    try {
      ctx.body = { text: await llm(
        'คุณเป็นผู้ช่วยที่อธิบายเนื้อหาภาษาราชการไทยให้เป็นภาษาที่ประชาชนทั่วไปเข้าใจง่าย กระชับ ตรงประเด็น ใช้คำธรรมดา ไม่เพิ่มข้อมูลที่ไม่มีในต้นฉบับ',
        'อธิบายข้อความต่อไปนี้ให้เข้าใจง่าย:\n\n' + text) };
    } catch { ctx.status = 502; ctx.body = { error: 'AI error' }; }
  },
  async translate(ctx: any) {
    if (!gate(ctx)) return;
    const text = String(ctx.request.body?.text || '').slice(0, 6000);
    const target = String(ctx.request.body?.target || 'en').slice(0, 20);
    if (!text) { ctx.status = 400; ctx.body = { error: 'text required' }; return; }
    try {
      ctx.body = { text: await llm(
        'You are a professional translator. Translate the user text into the requested language, preserving meaning and a formal public-sector tone. Output only the translation.',
        'Translate to ' + target + ':\n\n' + text, 1200) };
    } catch { ctx.status = 502; ctx.body = { error: 'AI error' }; }
  },
  async find(ctx: any) {
    if (!gate(ctx)) return;
    const q = String(ctx.request.body?.q || ctx.query?.q || '').slice(0, 400);
    const tenantKey = ctx.state?.tenantKey || ctx.query?.tenant || '';
    if (!q) { ctx.status = 400; ctx.body = { error: 'q required' }; return; }
    const strapi = (global as any).strapi;
    const tf: any = tenantKey ? { tenant: { key: tenantKey } } : {};
    let services: any[] = [], faqs: any[] = [];
    try {
      services = await strapi.documents('api::service.service').findMany({ locale: 'th', status: 'published', filters: tf, fields: ['title', 'description', 'slug'], limit: 60 });
      faqs = await strapi.documents('api::faq.faq').findMany({ locale: 'th', status: 'published', filters: tf, fields: ['question', 'answer'], limit: 40 });
    } catch {}
    const ctxText = services.map((s, i) => '[S' + i + '] ' + s.title + ': ' + String(s.description || '').slice(0, 200)).join('\n') +
      '\n' + faqs.map((f, i) => '[Q' + i + '] ' + f.question + ' — ' + String(f.answer || '').replace(/<[^>]+>/g, ' ').slice(0, 200)).join('\n');
    try {
      const answer = await llm(
        'คุณเป็นผู้ช่วยแนะนำบริการภาครัฐ ตอบจาก "บริการและคำถามที่ให้มา" เท่านั้น บอกว่าควรใช้บริการใด และสรุปขั้นตอนสั้น ๆ เป็นข้อ ๆ ถ้าไม่มีข้อมูลให้บอกว่าไม่พบและแนะนำให้ติดต่อหน่วยงาน ตอบเป็นภาษาไทย',
        'บริการและคำถาม:\n' + ctxText + '\n\nคำถามประชาชน: ' + q, 700);
      ctx.body = { answer, services: services.slice(0, 6).map((s) => ({ title: s.title, slug: s.slug })) };
    } catch { ctx.status = 502; ctx.body = { error: 'AI error' }; }
  },
};
