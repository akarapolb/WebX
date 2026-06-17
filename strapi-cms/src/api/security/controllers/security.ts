import { MFA_SECRET, COOKIE_NAME, signCookie } from '../../../utils/mfa';
import { verifyTOTP, otpauthUri } from '../../../utils/totp';
import { issueCaptcha } from '../../../utils/captcha';

function mfaPage(to: string, error: string): string {
  const safeTo = (typeof to === 'string' && to.indexOf('/admin') === 0) ? to : '/admin';
  const uri = otpauthUri(MFA_SECRET, 'admin', 'WebX-CMS');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ยืนยันตัวตน 2 ขั้น (MFA) — WebX CMS</title>
<style>
:root{font-family:'Kanit','Segoe UI',system-ui,sans-serif}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1226;color:#e8eaf2}
.card{width:min(420px,92vw);background:#171a35;border:1px solid #2a2f55;border-radius:18px;padding:30px 28px;box-shadow:0 24px 70px rgba(0,0,0,.5)}
h1{font-size:20px;margin:0 0 6px}p{color:#aab;font-size:13.5px;line-height:1.6;margin:0 0 18px}
input{width:100%;box-sizing:border-box;font-size:24px;letter-spacing:8px;text-align:center;padding:14px;border-radius:12px;border:1px solid #3a3f6b;background:#0f1226;color:#fff;margin-bottom:14px}
button{width:100%;padding:13px;border:0;border-radius:12px;background:#5b6cff;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{background:#3a1320;color:#ff9bb0;border:1px solid #5e1e30;padding:9px 12px;border-radius:10px;font-size:13px;margin-bottom:14px}
.demo{margin-top:18px;padding:12px;border:1px dashed #3a3f6b;border-radius:10px;font-size:11.5px;color:#8a90c0;word-break:break-all}
.demo b{color:#cdd}
</style></head><body><form class="card" method="POST" action="/api/mfa/verify">
<h1>🔐 ยืนยันตัวตน 2 ขั้น (MFA)</h1>
<p>กรอกรหัส 6 หลักจากแอป Authenticator เพื่อเข้าสู่ระบบหลังบ้าน (TOR Security)</p>
${error ? `<div class="err">${error}</div>` : ''}
<input name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="000000" autofocus>
<input type="hidden" name="to" value="${safeTo}">
<button type="submit">ยืนยัน</button>
<div class="demo">โหมดสาธิต — เพิ่มลงแอป Authenticator ด้วยคีย์:<br><b>${MFA_SECRET}</b><br>หรือ otpauth URI:<br>${uri}</div>
</form></body></html>`;
}

export default {
  async mfaPage(ctx: any) {
    ctx.type = 'text/html';
    ctx.body = mfaPage(ctx.query.to, '');
  },
  async mfaVerify(ctx: any) {
    const body = ctx.request.body || {};
    const code = body.code, to = body.to;
    if (verifyTOTP(MFA_SECRET, code)) {
      const exp = Date.now() + 8 * 3600 * 1000; // 8 ชม.
      ctx.cookies.set(COOKIE_NAME, signCookie(exp), { httpOnly: true, sameSite: 'lax', path: '/', overwrite: true });
      ctx.redirect(typeof to === 'string' && to.indexOf('/admin') === 0 ? to : '/admin');
    } else {
      ctx.type = 'text/html';
      ctx.body = mfaPage(to, 'รหัสไม่ถูกต้องหรือหมดอายุ โปรดลองใหม่');
    }
  },
  async captcha(ctx: any) {
    ctx.body = { data: issueCaptcha() };
  },
};
