/* rate-limit — กันยิงซ้ำ: ล็อกอินหลังบ้าน + POST /api (ฟอร์มสาธารณะ)
 *
 * Sliding window (a timestamp log per key, not a single fixed-reset
 * counter) — the old fixed-window version let up to 2x max through across
 * a window boundary (e.g. max=10 at t=599s, another 10 at t=600s = 20 in
 * under a second) and reset the count to a flat 0 the instant the window
 * rolled over, rather than reflecting fading-out recent activity.
 *
 * The /admin/login bucket used to key on IP alone. Every caller in this
 * deployment — every human admin, the scheduler service account,
 * self-serve signup's auto-login, SSO, MFA-disable's re-proof — shares one
 * container IP (webx -> strapi in docker-compose), so they all shared ONE
 * bucket: a handful of staff signing in around the same time, or the
 * scheduler refreshing its own token, could lock out everyone else on a
 * platform-wide 10-per-10-minute cap. Found live, repeatedly, this session.
 * Now keys per (ip, email) instead — one busy or misbehaving account no
 * longer exhausts the budget for every other login — and exempts the
 * scheduler account entirely, the same way requireUnscoped()-style
 * exemptions work elsewhere in this system for the one caller that's
 * infrastructure, not a person hitting "sign in" too many times. */
const hits = new Map<string, number[]>();

function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  let arr = hits.get(key);
  if (!arr) { arr = []; hits.set(key, arr); }
  // Evict anything outside the window, then check + record in one pass.
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  if (i > 0) arr.splice(0, i);
  if (arr.length >= max) return false;
  arr.push(now);
  return true;
}

const SCHEDULER_EMAIL = (process.env.STRAPI_SCHEDULER_EMAIL || 'scheduler@webx.local').toLowerCase();

export default (_config: any, _ctx: any) => {
  return async (ctx: any, next: any) => {
    if (ctx.method === 'POST') {
      const p = ctx.path || '';
      const ip = ctx.request.ip || 'unknown';
      let ok = true;
      if (p === '/admin/login' || p === '/admin/forgot-password' || p === '/api/mfa/verify') {
        const email = String(ctx.request.body?.email || '').toLowerCase();
        if (email !== SCHEDULER_EMAIL) {
          ok = hit('login:' + ip + ':' + (email || 'unknown'), 10, 10 * 60 * 1000); // 10 ครั้ง/10 นาที ต่อ (ip, email)
        }
      } else if (p.indexOf('/api/') === 0) {
        ok = hit('api:' + ip, 60, 60 * 1000); // 60 ครั้ง/นาที
      }
      if (!ok) {
        ctx.status = 429;
        ctx.set('Retry-After', '60');
        ctx.body = { error: { status: 429, name: 'TooManyRequests', message: 'คำขอมากเกินไป โปรดลองใหม่ภายหลัง' } };
        return;
      }
    }
    if (hits.size > 20000) {
      const cutoff = Date.now() - 10 * 60 * 1000;
      for (const [k, arr] of hits) { if (!arr.length || arr[arr.length - 1] < cutoff) hits.delete(k); }
    }
    return next();
  };
};
