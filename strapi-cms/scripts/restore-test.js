/* ============================================================
   restore-test.js — automated backup restore drill (TOR gap audit:
   docs/DR-Plan.md §6 "ทดสอบ restore (DR drill) — รายไตรมาส" was a written
   policy line with no automation anywhere behind it — this is that
   automation, runnable on demand or on a schedule the same way
   backup-db.js already is).

   Takes the MOST RECENT backup this environment's DATABASE_CLIENT produces
   (same env-var convention as backup-db.js: DATABASE_CLIENT/HOST/PORT/
   USERNAME/PASSWORD/NAME — the wp-db-backup service already sets these for
   the MySQL/WordPress case, db-backup for Strapi's own Postgres/SQLite),
   restores it into a SEPARATE, disposable scratch database (never touches
   the live one), runs a real integrity check against it, then tears the
   scratch copy down. Exits non-zero on any failure — suitable for the same
   cron/Task-Scheduler wiring DR-Plan.md documents for backup-db.js, so a
   silently-broken backup gets caught before a real incident needs it.

   Usage: node scripts/restore-test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups');
const client = (process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();

function latestFile(prefix, dir = BACKUP_DIR) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function fail(msg) {
  console.error('[restore-test] FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('[restore-test] OK:', msg);
}

async function testSqlite() {
  const backup = latestFile('data-');
  if (!backup) fail('no sqlite backup found in ' + BACKUP_DIR + ' — has backup-db.js ever run?');
  ok('found backup ' + path.basename(backup));

  const Database = require('better-sqlite3');
  // A read-only open of the backup FILE ITSELF is the actual restore drill
  // for SQLite (its own "restore" step, per DR-Plan.md §4, is just copying
  // the backup file back over .tmp/data.db) — no separate scratch copy
  // needed, and opening read-only guarantees this can never mutate the
  // real backup even if a bug crept into the checks below.
  let db;
  try {
    db = new Database(backup, { readonly: true, fileMustExist: true });
  } catch (e) {
    fail('backup file will not even open as a SQLite database: ' + e.message);
  }
  const integrity = db.pragma('integrity_check');
  const okIntegrity = integrity.length === 1 && integrity[0].integrity_check === 'ok';
  if (!okIntegrity) fail('PRAGMA integrity_check failed: ' + JSON.stringify(integrity));
  ok('PRAGMA integrity_check passed');

  // Core control-plane tables every real deployment has, regardless of
  // which content types are actually in use — a meaningful, stable
  // assertion rather than pinning to one specific content type's table.
  const CORE_TABLES = ['tenants', 'admin_users'];
  const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
  for (const t of CORE_TABLES) {
    if (!tableNames.has(t)) fail('expected core table "' + t + '" is missing from the backup');
  }
  ok('core tables present: ' + CORE_TABLES.join(', '));

  const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n;
  if (adminCount < 1) fail('admin_users has 0 rows in the backup — every real deployment has at least one admin');
  ok('admin_users has ' + adminCount + ' row(s)');

  db.close();
}

function run(cmd, env) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], shell: '/bin/sh', env: { ...process.env, ...env } }).toString();
}

async function testMysql() {
  const backup = latestFile('mysql-');
  if (!backup) fail('no mysql backup found in ' + BACKUP_DIR + ' — has backup-db.js ever run with DATABASE_CLIENT=mysql?');
  ok('found backup ' + path.basename(backup));

  const host = process.env.DATABASE_HOST || 'localhost';
  const port = process.env.DATABASE_PORT || 3306;
  const user = process.env.DATABASE_USERNAME;
  const pass = process.env.DATABASE_PASSWORD || '';
  const scratchDb = (process.env.DATABASE_NAME || 'wordpress') + '_restore_test';
  const mysqlBase = `mysql -h ${host} -P ${port} -u ${user}`;
  const env = { MYSQL_PWD: pass };

  try {
    run(`${mysqlBase} -e "DROP DATABASE IF EXISTS \\\`${scratchDb}\\\`; CREATE DATABASE \\\`${scratchDb}\\\`;"`, env);
    ok('created scratch database ' + scratchDb);
    run(`${mysqlBase} ${scratchDb} < "${backup}"`, env);
    ok('loaded backup into scratch database');

    const tableCount = parseInt(run(`${mysqlBase} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${scratchDb}';"`, env).trim(), 10);
    if (!tableCount) fail('restored database has 0 tables');
    ok('restored database has ' + tableCount + ' table(s)');

    // wp_options always exists and always has rows (siteurl, home, etc.) on
    // any real WordPress database — same "stable core table" reasoning as
    // the SQLite check's admin_users.
    const optionsCount = parseInt(run(`${mysqlBase} -N -e "SELECT COUNT(*) FROM \\\`${scratchDb}\\\`.wp_options;"`, env).trim(), 10);
    if (!optionsCount) fail('wp_options has 0 rows in the restored database');
    ok('wp_options has ' + optionsCount + ' row(s)');
  } finally {
    try { run(`${mysqlBase} -e "DROP DATABASE IF EXISTS \\\`${scratchDb}\\\`;"`, env); ok('dropped scratch database'); } catch {}
  }
}

async function testPostgres() {
  const backup = latestFile('pg-');
  if (!backup) fail('no postgres backup found in ' + BACKUP_DIR + ' — has backup-db.js ever run with DATABASE_CLIENT=postgres?');
  ok('found backup ' + path.basename(backup));

  const host = process.env.DATABASE_HOST || 'localhost';
  const port = process.env.DATABASE_PORT || 5432;
  const user = process.env.DATABASE_USERNAME;
  const pass = process.env.DATABASE_PASSWORD || '';
  const scratchDb = (process.env.DATABASE_NAME || 'strapi') + '_restore_test';
  const env = { PGPASSWORD: pass };
  const psqlBase = `psql -h ${host} -p ${port} -U ${user}`;

  try {
    run(`dropdb -h ${host} -p ${port} -U ${user} --if-exists ${scratchDb}`, env);
    run(`createdb -h ${host} -p ${port} -U ${user} ${scratchDb}`, env);
    ok('created scratch database ' + scratchDb);
    run(`${psqlBase} -d ${scratchDb} -f "${backup}"`, env);
    ok('loaded backup into scratch database');

    const tableCount = parseInt(run(`${psqlBase} -d ${scratchDb} -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"`, env).trim(), 10);
    if (!tableCount) fail('restored database has 0 tables');
    ok('restored database has ' + tableCount + ' table(s)');

    const adminCount = parseInt(run(`${psqlBase} -d ${scratchDb} -t -A -c "SELECT COUNT(*) FROM admin_users;"`, env).trim(), 10);
    if (!adminCount) fail('admin_users has 0 rows in the restored database');
    ok('admin_users has ' + adminCount + ' row(s)');
  } finally {
    try { run(`dropdb -h ${host} -p ${port} -U ${user} --if-exists ${scratchDb}`, env); ok('dropped scratch database'); } catch {}
  }
}

async function main() {
  console.log('[restore-test] client:', client);
  if (client === 'mysql') await testMysql();
  else if (client === 'postgres') await testPostgres();
  else await testSqlite();
  console.log('[restore-test] PASS — backup is restorable and structurally sound.');
}

main().catch((e) => fail(e.message || String(e)));
