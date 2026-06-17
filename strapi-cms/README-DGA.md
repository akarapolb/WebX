# DGA Web CMS (Strapi 5) — คู่มือใช้งาน (งวดที่ 1: หน้าแรก)

CMS แบบ Headless สำหรับเว็บไซต์ สพร. (dga.or.th) ตาม TOR DGA-69-0177
หน้า static เดิมยังคงเดิม เพียงดึงเนื้อหามาจาก CMS ผ่าน REST API

## โครงสร้าง
- `strapi-cms/` — Strapi 5 + SQLite (`.tmp/data.db`) + TypeScript
- `../site/DGA-Website/` — เว็บ static (เพิ่ม `assets/cms.js` เพื่อต่อ API)

## วิธีรัน (dev)
1. **Strapi** (CMS + API, พอร์ต 1337)
   ```powershell
   cd C:\Users\Avalant\ClaudeCode\strapi-cms
   npm run develop
   ```
2. **หน้าเว็บ static** (พอร์ต 8080 — ตรงกับ CORS ที่ตั้งไว้)
   ```powershell
   python -m http.server 8080 --directory C:\Users\Avalant\ClaudeCode\site\DGA-Website
   ```
3. เปิด http://localhost:8080/ (หน้าเว็บ) · http://localhost:1337/admin (หลังบ้าน)

## เริ่มต้นใช้งานหลังบ้าน
- เข้า http://localhost:1337/admin แล้ว **สร้างบัญชีผู้ดูแลคนแรก** (owner)
- เมนู Content Manager จะเห็นเนื้อหาที่ seed มาแล้ว แก้ไข/เผยแพร่ได้ทันที
- รองรับ 2 ภาษา (ไทยค่าเริ่มต้น / อังกฤษ) — สลับ locale ที่มุมขวาบนของแต่ละรายการ

## Content Types (งวดนี้)
| Type | ใช้ที่ | i18n | Draft/Publish |
|---|---|---|---|
| Home Page (single) | Hero, สถิติ, โปรโมท | ✓ | ✓ |
| Article | ข่าว (kind=news) + บทความ (kind=article) | ✓ | ✓ |
| Service | บริการยอดนิยม | ✓ | ✓ |
| Banner | แบนเนอร์ไฮไลต์ | ✓ | ✓ |
| Video | DGA Channel | ✓ | ✓ |
| Award | DGA Auditorium | ✓ | ✓ |
| FAQ | คำถามที่พบบ่อย (อัปเดต FAQPage schema/AEO อัตโนมัติ) | ✓ | ✓ |

## การตั้งค่าที่สำคัญ (โค้ด)
- `src/index.ts` → `bootstrap`: ตั้ง locale ไทย, สิทธิ์ Public (find/findOne), และ seed เนื้อหาครั้งแรก (idempotent — seed เฉพาะตอนยังว่าง)
- `src/seed/` : `data.ts` (เนื้อหาสกัดจาก index.html), `seed.ts` (อัปโหลดรูป + สร้างรายการ)
- `config/middlewares.ts` : เปิด CORS ให้ `http://localhost:8080`
- `.env` : `DATABASE_FILENAME=.tmp/data.db` (ห้ามเว้นว่าง ไม่งั้น SQLite เปิดไฟล์ไม่ได้)

## ฝั่งหน้าเว็บ
- `assets/cms.js` : ดึงข้อมูลจาก API → เรนเดอร์ DOM → แล้วจึงโหลด `home.js`
  ถ้า API ล่ม จะ fallback ไปใช้เนื้อหา static เดิมโดยอัตโนมัติ
- ตั้งโดเมน API ได้ที่ `window.DGA_CMS_URL` (ดีฟอลต์ `http://localhost:1337`)

## งวดที่ 2 — งาน/ฟอร์ม/ใบสมัคร (เพิ่มแล้ว)
Content Types เพิ่มเติม:
| Type | ใช้ที่ | สิทธิ์สาธารณะ | หมายเหตุ |
|---|---|---|---|
| Job | careers.html / job.html (+/en/) | find, findOne | i18n th/en, seed 20 ตำแหน่งจาก jobs-data.js |
| Complaint | complaint.html (ยื่น+ติดตาม) | **create เท่านั้น** | ออกเลข `DGA-CMP-<พ.ศ.>-<6หลัก>` + auto-email |
| Application | job.html (ฟอร์มสมัคร) + application-status.html | **create เท่านั้น** | ออกเลข `DGA-JOB-<พ.ศ.>-<6หลัก>` + auto-email |
| Registration | register.html | **create เท่านั้น** | สร้าง username ฝั่งเซิร์ฟเวอร์ (ไม่เก็บรหัสผ่าน) |

ความปลอดภัย (PDPA): ฟอร์มเปิดเฉพาะ `create` — **ไม่เปิด** find/findOne สาธารณะ (กันข้อมูลรั่ว)
การติดตามสถานะใช้ endpoint แยกที่ค้นด้วย ref เท่านั้น:
- `GET /api/complaints/track/:ref` · `GET /api/applications/track/:ref`

Auto-email: ส่งอีเมลตอบรับเมื่อสร้างเรื่อง/ใบสมัคร (ผ่าน lifecycle) — dev ใช้ provider `sendmail`
(ไม่ส่งจริงจนกว่าจะตั้งค่า SMTP ใน production; ระบบจะ log ไว้แทน)

ฝั่งหน้าเว็บ (ต่อ API + fallback เป็นพฤติกรรมเดิมถ้า API ล่ม):
- `assets/jobs-cms.js` : โหลดงาน th+en ประกอบเป็น `window.DGA_JOBS` แล้วโหลด `careers.js`
- แก้ seam ใน `careers.js` (ส่งใบสมัคร), `complaint.js` (ยื่น+ติดตาม), `appstatus.js` (ตรวจสถานะ), `register.js` (ลงทะเบียน)
- หน้า `/en/careers.html`, `/en/job.html` ใช้ตัวโหลดเดียวกัน (อ่าน locale จาก `<html lang>`)

## ยังไม่ได้ทำ (งวดถัดไป)
- ต่อ API หน้า `/en/` ที่เหลือ (complaint/register/application-status), Navigation/Global (เมนู mega, footer)
- Hybrid Search + AI Smart Search จากเนื้อหา CMS, อัปโหลดไฟล์แนบในฟอร์ม (multipart)
- MFA หลังบ้าน, SMTP จริง, Web Analytics/Heatmap, Cookie consent log
