/* ============================================================
   backup-db.js — สำรองฐานข้อมูล (TOR ข้อ 8.3(5) Backup Data + DR RPO)
   • SQLite: คัดลอกไฟล์ .tmp/data.db → backups/data-YYYYMMDD-HHmmss.db
   • PostgreSQL: เรียก pg_dump (อ่านค่าจาก env DATABASE_*)
   เก็บย้อนหลัง KEEP ชุดล่าสุด (ลบที่เก่ากว่า) — รองรับตั้ง cron รายวัน/ราย ชม.
   ใช้: node scripts/backup-db.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 30);
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const now = new Date();
const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15); // YYYYMMDDHHmmss
const client = (process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();

try {
  if (client === 'postgres') {
    const out = path.join(BACKUP_DIR, `pg-${stamp}.sql`);
    const url = process.env.DATABASE_URL;
    const cmd = url
      ? `pg_dump "${url}" -f "${out}"`
      : `pg_dump -h ${process.env.DATABASE_HOST || 'localhost'} -p ${process.env.DATABASE_PORT || 5432} -U ${process.env.DATABASE_USERNAME} -d ${process.env.DATABASE_NAME} -f "${out}"`;
    execSync(cmd, { stdio: 'inherit', env: { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD || '' } });
    console.log('[backup] postgres →', out);
  } else {
    const db = path.join(ROOT, process.env.DATABASE_FILENAME || '.tmp/data.db');
    if (!fs.existsSync(db)) throw new Error('ไม่พบไฟล์ฐานข้อมูล: ' + db);
    const out = path.join(BACKUP_DIR, `data-${stamp}.db`);
    fs.copyFileSync(db, out);
    console.log('[backup] sqlite →', out, '(' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
  }
  // หมุนเวียน: เก็บ KEEP ชุดล่าสุด
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^(data|pg)-/.test(f)).sort();
  while (files.length > KEEP) { const f = files.shift(); fs.unlinkSync(path.join(BACKUP_DIR, f)); console.log('[backup] ลบเก่า', f); }
} catch (e) {
  console.error('[backup] ล้มเหลว:', e.message);
  process.exit(1);
}
