/* rate-limit — กันยิงซ้ำ: ล็อกอินหลังบ้าน + POST /api (ฟอร์มสาธารณะ) ต่อ IP */
const buckets = new Map<string, { c: number; reset: number }>();

function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { c: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.c++;
  return b.c <= max;
}

export default (_config: any, _ctx: any) => {
  return async (ctx: any, next: any) => {
    if (ctx.method === 'POST') {
      const p = ctx.path || '';
      const ip = ctx.request.ip || 'unknown';
      let ok = true;
      if (p === '/admin/login' || p === '/admin/forgot-password' || p === '/api/mfa/verify') {
        ok = hit('login:' + ip, 10, 10 * 60 * 1000);   // 10 ครั้ง/10 นาที
      } else if (p.indexOf('/api/') === 0) {
        ok = hit('api:' + ip, 60, 60 * 1000);           // 60 ครั้ง/นาที
      }
      if (!ok) {
        ctx.status = 429;
        ctx.set('Retry-After', '60');
        ctx.body = { error: { status: 429, name: 'TooManyRequests', message: 'คำขอมากเกินไป โปรดลองใหม่ภายหลัง' } };
        return;
      }
    }
    if (buckets.size > 20000) { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }
    return next();
  };
};
