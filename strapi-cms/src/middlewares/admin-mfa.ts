/* admin-mfa — กั้นการเปิดหน้า /admin ในเบราว์เซอร์ด้วย MFA (TOTP) ก่อนถึงหน้า login
   ไม่แตะ API/asset (เช็คเฉพาะ HTML navigation) จึงไม่กระทบ SPA หลังผ่าน gate แล้ว */
import { MFA_ENABLED, COOKIE_NAME, verifyCookie } from '../utils/mfa';

export default (_config: any, _ctx: any) => {
  return async (ctx: any, next: any) => {
    if (!MFA_ENABLED) return next();
    const p = ctx.path || '';
    const isAdminNav = (p === '/admin' || p.indexOf('/admin/') === 0) &&
      ctx.method === 'GET' && String(ctx.headers.accept || '').indexOf('text/html') >= 0;
    if (!isAdminNav) return next();
    if (verifyCookie(ctx.cookies.get(COOKIE_NAME))) return next();
    return ctx.redirect('/api/mfa?to=' + encodeURIComponent(p));
  };
};
