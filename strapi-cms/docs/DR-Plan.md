# แผนกู้คืนระบบจากภัยพิบัติ (Disaster Recovery Plan) — DGA Website / WebX

อ้างอิง TOR DGA-69-0177 ข้อ 6.1 (เกณฑ์ Security — DR site + RTO/RPO) และข้อ 4.7 (ความมั่นคงปลอดภัย)

## 1. เป้าหมายการกู้คืน
| ตัวชี้วัด | ค่าเป้าหมาย | ความหมาย |
|---|---|---|
| **RTO** (Recovery Time Objective) | **≤ 1 ชั่วโมง** | เวลาสูงสุดที่ระบบกลับมาให้บริการหลังเกิดเหตุ |
| **RPO** (Recovery Point Objective) | **≤ 1 ชั่วโมง** | ข้อมูลที่อาจสูญหายสูงสุด = ความถี่การสำรองข้อมูล |

## 2. สถาปัตยกรรม DR (Active–Standby)
```
        ผู้ใช้ / DNS (TTL ต่ำ 60s)
                 │
        ┌────────┴─────────┐
   [Primary Site]      [DR Site]  (คนละ Availability Zone/Region)
   - Web/CMS (Strapi)  - Web/CMS (standby, image เดียวกัน)
   - DB (PostgreSQL)   - DB replica (streaming replication)
   - Object storage    - storage ที่ sync (rsync/S3 cross-region)
                 │            ▲
                 └── replicate┘  (DB streaming + storage sync)
```
- **DB**: PostgreSQL streaming replication (hot standby) → RPO ใกล้ 0; เสริมด้วย backup รายชั่วโมง
- **ไฟล์อัปโหลด**: sync ไป object storage ข้าม region (S3/MinIO) หรือ rsync ตามรอบ
- **โค้ด/คอนฟิก**: deploy จาก image/Git เดียวกันทั้งสอง site (IaC)
- **Failover**: เปลี่ยน DNS/Load Balancer ชี้ DR site เมื่อ Primary ล่ม (อัตโนมัติด้วย health check หรือกึ่งอัตโนมัติ)

## 3. การสำรองข้อมูล (Backup)
- สคริปต์ `scripts/backup-db.js` — สำรอง DB (SQLite copy / PostgreSQL `pg_dump`), หมุนเวียนเก็บ 30 ชุด
- ตั้ง **cron** รายชั่วโมง (ตาม RPO):
  - Linux: `0 * * * * cd /app && node scripts/backup-db.js`
  - Windows Task Scheduler: รัน `node scripts/backup-db.js` ทุกชั่วโมง
- เก็บสำเนา backup ไว้นอก Primary site (object storage/region อื่น) — กัน single point of failure
- ทดสอบ **restore** อย่างน้อยไตรมาสละครั้ง (DR drill) — เดิมมีแต่ข้อความนโยบายในเอกสารนี้ ไม่มีการทดสอบจริงเลย (TOR gap audit) จนกระทั่งมี `scripts/restore-test.js`: กู้คืน backup ล่าสุดลงฐานข้อมูล scratch แยกต่างหาก (ไม่แตะฐานข้อมูลจริง) แล้วตรวจสอบจริง (SQLite: `PRAGMA integrity_check` + ตาราง `admin_users` มีข้อมูล · MySQL/Postgres: โหลด dump ลง `<DATABASE_NAME>_restore_test` แล้วตรวจนับตาราง/แถว) จบด้วยการลบฐานข้อมูล scratch ทิ้ง — คืนค่า exit code ไม่เป็นศูนย์เมื่อพัง ตั้ง cron/Task Scheduler รายไตรมาสแบบเดียวกับ `backup-db.js`:
  - Linux: `0 3 1 */3 * cd /app && node scripts/restore-test.js`
  - Windows Task Scheduler: รัน `node scripts/restore-test.js` ทุกไตรมาส

## 4. ขั้นตอนกู้คืน (Restore)
1. ประเมินเหตุ + ประกาศ DR (ผู้มีอำนาจ)
2. **SQLite**: หยุดบริการ → คัดลอก `backups/data-*.db` ล่าสุดทับ `.tmp/data.db` → start
   **PostgreSQL**: `psql -d <db> -f backups/pg-*.sql` หรือ promote DB replica เป็น primary
3. กู้ไฟล์อัปโหลดจาก storage sync/backup
4. เปลี่ยน DNS/LB ชี้ DR site → ตรวจสอบ health (`/_health`, หน้าแรก, ล็อกอินหลังบ้าน)
5. แจ้งผู้เกี่ยวข้อง + บันทึกเหตุการณ์ (incident log)

## 5. Log & ความมั่นคงปลอดภัย (รองรับ พ.ร.บ.คอมพิวเตอร์)
- Traffic log: `src/middlewares/traffic-log.ts` → `logs/traffic-YYYY-MM-DD.log` (เก็บ ≥ 90 วัน)
- ส่งออก Log Server ภายนอกผ่าน `LOG_SERVER_URL` (syslog/HTTP collector รวมศูนย์)
- MFA หลังบ้าน + session/idle timeout + rate limit + CAPTCHA + audit log (มีในระบบแล้ว)

## 6. ตารางทดสอบ DR
| กิจกรรม | ความถี่ |
|---|---|
| Backup DB | รายชั่วโมง |
| Backup ไฟล์อัปโหลด | รายวัน |
| ทดสอบ restore (DR drill) — อัตโนมัติผ่าน `scripts/restore-test.js` | รายไตรมาส |
| ทบทวนแผน DR | รายปี |
