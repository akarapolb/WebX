/* ============================================================
   traffic-log — บันทึกข้อมูลจราจรทางคอมพิวเตอร์ (Log File)
   ตาม พ.ร.บ.ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ (TOR ข้อ 4.7.4)
   เก็บ: วันเวลา · IP ต้นทาง · method · path · status · user-agent · ผู้ใช้(ถ้ามี)
   - เขียนลงไฟล์รายวัน logs/traffic-YYYY-MM-DD.log (เก็บ ≥ 90 วันตามกฎหมาย)
   - ส่งออกไปยัง Log Server ภายนอกได้ผ่าน env LOG_SERVER_URL (syslog/HTTP collector)
   ============================================================ */
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) { /* noop */ }

const SKIP = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|json)(\?|$)/i;

export default (_config: any, _deps: any) => {
  const logServer = process.env.LOG_SERVER_URL || '';
  return async (ctx: any, next: any) => {
    const start = Date.now();
    await next();
    try {
      const url = ctx.originalUrl || ctx.url || '';
      // ข้ามไฟล์ static (asset ของแอดมิน/เว็บ) เพื่อให้ log เป็นเหตุการณ์เข้าถึงจริง
      if (SKIP.test(url) && ctx.method === 'GET') return;
      const now = new Date();
      const xff = (ctx.request.headers['x-forwarded-for'] || '').toString();
      const ip = (xff.split(',')[0].trim()) || ctx.request.ip || '-';
      const entry = {
        ts: now.toISOString(),
        ip,
        method: ctx.method,
        path: url.split('?')[0],
        status: ctx.status,
        ms: Date.now() - start,
        ua: (ctx.request.headers['user-agent'] || '').toString().slice(0, 180),
        user: ctx.state?.user?.email || ctx.state?.adminUser?.email || null,
      };
      const file = path.join(LOG_DIR, 'traffic-' + now.toISOString().slice(0, 10) + '.log');
      fs.appendFile(file, JSON.stringify(entry) + '\n', () => { /* noop */ });
      if (logServer) {
        fetch(logServer, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => { /* noop */ });
      }
    } catch (e) { /* ไม่ให้ logging ล้มแล้วกระทบงานหลัก */ }
  };
};
