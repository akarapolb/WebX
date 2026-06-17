/* captcha-guard — บังคับ CAPTCHA ก่อนรับฟอร์มสาธารณะ (ร้องเรียน/สมัครงาน/ลงทะเบียน)
   ต้องวางหลัง strapi::body เพื่ออ่าน ctx.request.body */
import { CAPTCHA_ENABLED, verifyCaptcha } from '../utils/captcha';

const GUARDED = new Set(['/api/complaints', '/api/applications', '/api/registrations']);

export default (_config: any, _ctx: any) => {
  return async (ctx: any, next: any) => {
    if (!CAPTCHA_ENABLED || ctx.method !== 'POST' || !GUARDED.has(ctx.path || '')) return next();
    const b = ctx.request.body || {};
    if (!verifyCaptcha(b.captchaId, b.captchaAnswer)) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, name: 'CaptchaError', message: 'ยืนยัน CAPTCHA ไม่สำเร็จ โปรดลองใหม่' } };
      return;
    }
    return next();
  };
};
