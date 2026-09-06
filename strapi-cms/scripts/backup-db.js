/* ============================================================
   backup-db.js — สำรองฐานข้อมูล (TOR ข้อ 8.3(5) Backup Data + DR RPO)
   • SQLite: คัดลอกไฟล์ .tmp/data.db → backups/data-YYYYMMDD-HHmmss.db
   • PostgreSQL: เรียก pg_dump (อ่านค่าจาก env DATABASE_*)
   • MySQL: เรียก mysqldump (เพิ่มเข้ามาสำหรับ wp-db-backup service —
     WordPress ใช้ MySQL ไม่ใช่ Postgres; เดิมสคริปต์นี้สำรองเฉพาะฐานข้อมูล
     Strapi เท่านั้น ทำให้เนื้อหาจริงของ ORST/RoyalSociety (อยู่ใน WordPress
     ทั้งหมด) ไม่มีการสำรองข้อมูลเลย — TOR gap audit)
   • ไฟล์อัปโหลด (uploads): ถ้าตั้ง env UPLOADS_SRC ไว้ (docker-compose.yml
     mount volume strapi-uploads หรือ wp-content-data ไว้ที่เส้นทางนี้) จะ
     tar.gz สำรองไว้ด้วย — ครบตาม DEPLOY.md checklist "Backups: nightly
     pg_dump/mysqldump + the uploads volume". UPLOAD_PREFIX แยกชื่อไฟล์เมื่อ
     สคริปต์เดียวกันนี้รันเป็นหลาย service เขียนลง backup dir เดียวกัน
     (db-backup ใช้ค่าเดิม "uploads", wp-db-backup ตั้งเป็น "wp-content")
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
const stamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHmmss
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
  } else if (client === 'mysql') {
    const out = path.join(BACKUP_DIR, `mysql-${stamp}.sql`);
    // --single-transaction: consistent snapshot without locking WordPress's
    // own tables for the duration (InnoDB, which wp-mysql's default engine
    // already is) — same "don't block the live site for a backup" goal
    // pg_dump gets for free. --no-tablespaces: the wp-db-backup service's
    // own DB user is deliberately non-root/least-privilege (same
    // WORDPRESS_DB_USER wordpress itself connects with) — confirmed live,
    // without this flag mysqldump still succeeds but prints "Access denied
    // ... PROCESS privilege" to stderr on every run trying to dump
    // tablespace metadata no restore of THIS database actually needs.
    const cmd = `mysqldump -h ${process.env.DATABASE_HOST || 'localhost'} -P ${process.env.DATABASE_PORT || 3306} -u ${process.env.DATABASE_USERNAME} --single-transaction --no-tablespaces ${process.env.DATABASE_NAME} > "${out}"`;
    execSync(cmd, { stdio: 'inherit', shell: '/bin/sh', env: { ...process.env, MYSQL_PWD: process.env.DATABASE_PASSWORD || '' } });
    console.log('[backup] mysql →', out, '(' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
  } else {
    const db = path.join(ROOT, process.env.DATABASE_FILENAME || '.tmp/data.db');
    if (!fs.existsSync(db)) throw new Error('ไม่พบไฟล์ฐานข้อมูล: ' + db);
    const out = path.join(BACKUP_DIR, `data-${stamp}.db`);
    fs.copyFileSync(db, out);
    console.log('[backup] sqlite →', out, '(' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
  }
  // ไฟล์อัปโหลด (media) — สำรองแยกจากฐานข้อมูล เผื่อ UPLOADS_SRC ถูกตั้งไว้
  const uploadsSrc = process.env.UPLOADS_SRC;
  const uploadPrefix = process.env.UPLOAD_PREFIX || 'uploads';
  if (uploadsSrc && fs.existsSync(uploadsSrc)) {
    const uploadsOut = path.join(BACKUP_DIR, `${uploadPrefix}-${stamp}.tar.gz`);
    execSync(`tar -czf "${uploadsOut}" -C "${path.dirname(uploadsSrc)}" "${path.basename(uploadsSrc)}"`, { stdio: 'inherit' });
    console.log('[backup] uploads →', uploadsOut, '(' + Math.round(fs.statSync(uploadsOut).size / 1024) + ' KB)');
  }

  // หมุนเวียน: เก็บ KEEP ชุดล่าสุด (แยกหมุนเวียนของฐานข้อมูลและ uploads)
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^(data|pg|mysql)-/.test(f)).sort();
  while (files.length > KEEP) { const f = files.shift(); fs.unlinkSync(path.join(BACKUP_DIR, f)); console.log('[backup] ลบเก่า', f); }
  const uploadFiles = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith(`${uploadPrefix}-`)).sort();
  while (uploadFiles.length > KEEP) { const f = uploadFiles.shift(); fs.unlinkSync(path.join(BACKUP_DIR, f)); console.log('[backup] ลบเก่า', f); }
} catch (e) {
  console.error('[backup] ล้มเหลว:', e.message);
  process.exit(1);
}
