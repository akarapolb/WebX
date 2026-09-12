/* admin-mfa — กั้นพื้นที่หลังบ้านทั้งหมดด้วย MFA (TOTP) ก่อนใช้งาน
   ครอบคลุมทุก path ยกเว้น /api/* (content API สาธารณะ ซึ่งรวม /api/mfa เอง)
   และ /uploads/* (ไฟล์สื่อสาธารณะ) — ไม่ใช่แค่การเปิดหน้า HTML แบบเดิม เพราะ
   /admin/login (JSON POST) และ endpoint อื่นของแผงหลังบ้าน (/content-manager,
   /content-type-builder, /upload, /users-permissions ฯลฯ) ก็ต้องผ่านด่านนี้
   เช่นกัน มิฉะนั้นผู้ที่มีรหัสผ่านหรือ token ที่ถูกขโมยจะเรียก endpoint เหล่านี้
   ตรงๆ โดยไม่ต้องผ่าน MFA เลย (พบจากการตรวจสอบความปลอดภัย 2026-09-12)

   webx-studio's own backend is exempt (X-Internal-Secret, same shared
   secret/header the rest of this system already uses for trusted
   server-to-server calls — see rate-limit.ts's own /api/internal/*
   exemption for the established pattern). This isn't a loophole back to
   the original gap: an attacker with a stolen Strapi admin password or
   session token still has no way to produce this header, since it's never
   sent to a browser. It's required because webx-studio's server IS the
   normal, first-party way every real user authenticates and does every
   content operation — it calls /admin/login on a user's behalf after they
   authenticate through webx-studio's own login page, then calls
   /content-manager/* for every read/write the Visual Builder and content
   screens make. Found live, immediately: without this exemption, every
   real login and every content operation through webx-studio 401'd. */
import { MFA_ENABLED, COOKIE_NAME, verifyCookie } from '../utils/mfa';

export default (_config: any, _ctx: any) => {
  return async (ctx: any, next: any) => {
    if (!MFA_ENABLED) return next();
    const internalSecret = process.env.WEBX_INTERNAL_SECRET;
    if (internalSecret && ctx.headers['x-internal-secret'] === internalSecret) return next();
    const p = ctx.path || '';
    const isPublic = p.indexOf('/api/') === 0 || p.indexOf('/uploads/') === 0;
    if (isPublic) return next();
    if (verifyCookie(ctx.cookies.get(COOKIE_NAME))) return next();
    const wantsHtml = ctx.method === 'GET' && String(ctx.headers.accept || '').indexOf('text/html') >= 0;
    if (wantsHtml) return ctx.redirect('/api/mfa?to=' + encodeURIComponent(p));
    ctx.status = 401;
    ctx.body = { error: { status: 401, name: 'MfaRequiredError', message: 'Complete MFA at /api/mfa before using the admin API.' } };
  };
};
