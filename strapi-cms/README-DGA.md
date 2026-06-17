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

## งวดที่ 3 — Multi-tenant + Hybrid Search/AI + Navigation/Global (เพิ่มแล้ว)

**Multi-tenant (Shared DB + tenant field, ระบุด้วย custom domain):**
- **Tenant** content type = ทะเบียนหน่วยงาน + ตั้งค่าแบรนด์/ติดต่อ/social/footer ต่อ tenant
  (seed 2 ราย: `dga`, `pea` เพื่อพิสูจน์ data isolation)
- เพิ่ม `tenant` relation ในทุก content type + backfill ของเดิมเป็น `dga`
- **HTTP middleware** (`src/middlewares/tenant.ts`): resolve tenant จาก `?tenant=` → `X-Tenant` → Host
- **Document Service middleware** (`src/index.ts` register): บังคับ scope ใต้ชั้น validate ของ REST
  อ่าน tenant จาก `strapi.requestContext` → ฉีด filter ตอนอ่าน / ตั้ง tenant ตอน create
  (ตอน seed ไม่มี request context จึงไม่ถูก scope — seed ข้าม tenant ได้)
- Admin (content-manager) ไม่ถูก scope → super admin เห็นทุก tenant (per-tenant RBAC = งานถัดไป)
- ตรวจแล้ว: `?tenant=dga` เห็นเฉพาะ DGA, `?tenant=pea` เห็นเฉพาะ PEA แยกขาดกัน

**Hybrid Search + AI Smart Search (tenant-scoped):**
- `GET /api/search?q=&locale=&limit=` — ค้น keyword จาก article/service/faq/job ใน tenant นั้น
- `GET /api/ai/answer?q=&locale=` — คำตอบสั้น + แหล่งอ้างอิง (จาก FAQ/เนื้อหา CMS)
- ฝั่งเว็บ: `assets/search-cms.js` (และ `cms.js` สำหรับหน้าแรก) สร้าง `window.DGA_DATA`
  จากเนื้อหา CMS → ช่องค้นหา hero + แชตบอท **DGA Guide ตอบจากเนื้อหา CMS จริง**

**Navigation/Global ต่อ tenant:**
- `assets/tenant.js` ดึง `GET /api/tenants/resolve` (เซิร์ฟเวอร์ใช้ Host) แล้วอัปเดต
  ชื่อหน่วยงาน/ที่อยู่/เบอร์/คอลัมน์ลิงก์/ลิขสิทธิ์ ใน footer ทุกหน้า + ตั้ง `data-tenant`
- ทุกหน้า (ยกเว้นหน้าแรกไทยที่ใช้ cms.js) เปลี่ยน `search-data.js`+`home.js` → `search-cms.js`
  (โหลด home.js + tenant.js ให้เอง)

**dev:** ตั้ง `window.DGA_TENANT='pea'` เพื่อจำลอง tenant อื่นในเครื่อง (prod ใช้ custom domain อัตโนมัติ)

## ยังไม่ได้ทำ (งวดถัดไป)
- per-tenant **RBAC ในหลังบ้าน** (จำกัด editor ให้เห็นเฉพาะ tenant ของตน), เมนู mega จาก CMS
- เนื้อหา `/en/` ครบทุก collection (ตอนนี้ en มีเฉพาะ home/service/job), แปลง Home เป็น per-tenant
- อัปโหลดไฟล์แนบในฟอร์ม (multipart), full-text ในไฟล์ pdf/docx, MFA หลังบ้าน, SMTP จริง
