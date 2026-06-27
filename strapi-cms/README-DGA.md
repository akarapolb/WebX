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

## งวดที่ 4 — Per-tenant RBAC + Home แบบ per-tenant (เพิ่มแล้ว)

**Home page → per-tenant:**
- เปลี่ยน `home-page` จาก single type เป็น **collection type + tenant relation** (1 home ต่อ tenant)
- seed home ของทั้ง `dga` และ `pea`; ฝั่งเว็บ `cms.js` ดึง `GET /api/home-pages` (scope ตาม tenant) แล้วใช้รายการแรก

**Per-tenant RBAC ในหลังบ้าน (content-manager):**
- ผูก admin editor กับ tenant ผ่าน `Tenant.adminEmails` (เช่น dga→`dga-editor@dga.local`)
- `effectiveTenant()` ใน `src/index.ts`: public → จาก Host; หลังบ้าน → จากอีเมล admin ที่ล็อกอิน;
  **super admin (ไม่อยู่ใน adminEmails ใด) → null → เห็น/แก้ได้ทุก tenant**
- Document Service middleware: scope reads, ตั้ง tenant ตอน create, และ **บล็อก update/delete/publish
  ข้าม tenant (throw ForbiddenError 403)**
- `grantLocalesToEditorRoles()` — locale ที่สร้างทีหลัง (th) ไม่ถูกผูกให้ role เดิม ทำให้ content-manager
  filter `locale:{$in:[]}` (editor มองไม่เห็นอะไรเลย) → เติม locales ให้ permission ของ editor/author

**บัญชี editor สาธิต (seed):** `dga-editor@dga.local` / `DgaEd@2569`, `pea-editor@pea.local` / `PeaEd@2569`

**ผลทดสอบ (ผ่าน content-manager API):**
| ผู้ใช้ | articles | services | homes | jobs |
|---|---|---|---|---|
| super admin | 12 (ทั้งหมด) | 9 | 2 | 20 |
| dga editor | 10 (เฉพาะ DGA) | 6 | 1 | 20 |
| pea editor | 2 (เฉพาะ PEA) | 3 | 1 | 0 |

dga-editor พยายาม update/delete บทความของ pea → **HTTP 403 (blocked)**

## สาธิต 2 tenants (DGA + PEA)

เปิดหน้าเว็บเดียวกัน แต่เลือก tenant ได้ — เนื้อหา/แบรนด์/footer เปลี่ยนตาม tenant อัตโนมัติ:
- **DGA** (สีน้ำเงิน, เนื้อหาเต็ม): http://localhost:8080/  หรือ  http://localhost:8080/?tenant=dga
- **PEA** (สีม่วง, เนื้อหา กฟภ.): http://localhost:8080/?tenant=pea

กลไก (dev): `?tenant=<key>` → จำใน `sessionStorage` ต่อแท็บ (เปิด 2 แท็บเทียบกันได้) → หรือ subdomain `pea.localhost`
prod: ใช้ **custom domain** (Host header) เซิร์ฟเวอร์ resolve ให้เอง ไม่ต้องมี query

ฝั่งเว็บที่ทำให้สลับ tenant ได้:
- `cms.js`/`search-cms.js`/`jobs-cms.js` อ่าน `?tenant=` ตั้ง `window.DGA_TENANT` แล้วแนบ `&tenant=` ทุก request
- `tenant.js` ใช้ `brand.primaryColor` รีคัลเลอร์ (`--c-primary`) + เปลี่ยนโลโก้ + footer ต่อ tenant
- ฟอร์ม (สมัครงาน/ร้องเรียน/ลงทะเบียน) และการติดตามสถานะ แนบ tenant ไปด้วย → ข้อมูลเข้า tenant ถูกต้อง
- `cms.js` แยก "ดึงไม่ได้" (คงของเดิม) ออกจาก "tenant ไม่มีข้อมูล" (ซ่อน section นั้น) → PEA ไม่มี
  แบนเนอร์/วิดีโอ/รางวัล/แท็บบทความ จะ**ซ่อนทั้ง section** ไม่ค้างเนื้อหา DGA

PEA seed: home, 3 services, 5 news, 3 FAQ, 2 jobs, โลโก้ `assets/image/pea-logo.svg`

## PDPA Cookie Consent + Web Analytics/Heatmap (เพิ่มแล้ว)

**Cookie Consent (PDPA) — `assets/consent.js`:**
- หมวด granular: **จำเป็น** (ล็อกเปิด) / **วิเคราะห์** / **การตลาด** — ค่าเริ่มต้น **OFF (opt-in)**
- 2 ภาษา (อ่านจาก `<html lang>`), แบนเนอร์ + แผงตั้งค่า (toggle), เปิดใหม่ได้จากปุ่ม footer "ตั้งค่าคุกกี้"
- เก็บตัวเลือกใน localStorage + **บันทึก consent log ลง CMS** (`POST /api/consent-logs`, scope ตาม tenant)
- โหลดมาแทน cookie banner เดิม (ลบบล็อกคุกกี้ออกจาก `home.js`)

**Consent Log** (content type): public **create เท่านั้น** (ไม่เปิดอ่านสาธารณะ — PDPA) เก็บ
`consentId, action, categories, language, path, userAgent, tenant` · ผูก tenant อัตโนมัติด้วย middleware

**Web Analytics + Heatmap:**
- `Tenant.analytics = { ga4, clarity, enabled }` (ตั้งต่อ tenant ในหลังบ้าน) · resolve คืนค่ามาด้วย
- `consent.js` โหลด **GA4 (gtag) + Microsoft Clarity เฉพาะเมื่อผู้ใช้ยินยอมหมวด "วิเคราะห์"** เท่านั้น
- ค่า seed เป็น demo (`G-DEMO-*`) → consent.js ตรวจเจอ `demo` แล้ว log แทนการเรียกจริง; ใส่ ID จริงเมื่อ deploy

โหลด consent.js อัตโนมัติทุกหน้า (ผ่าน cms.js/search-cms.js) · ทดสอบแล้ว: accept→โหลด analytics+log,
reject→ไม่โหลด, log เข้า CMS ผูก tenant ถูกต้อง, ไม่มี console error

## Security pack (เพิ่มแล้ว — TOR Security)

- **MFA หลังบ้าน (TOTP)**: `middlewares/admin-mfa.ts` กั้นการเปิดหน้า `/admin` ในเบราว์เซอร์ →
  redirect ไป `/api/mfa` ให้กรอกรหัส 6 หลักจากแอป Authenticator ก่อน (ตั้งคุกกี้ลงนาม 8 ชม.)
  - คีย์เดโม: **`JBSWY3DPEHPK3PXP`** (เพิ่มลง Google Authenticator/Authy แบบ manual key) — หน้า MFA แสดงคีย์+otpauth ให้
  - ตั้งค่า: `MFA_SECRET` (base32), `MFA_ENABLED=false` เพื่อปิด, `MFA_COOKIE_SECRET`
- **Rate limiting**: `middlewares/rate-limit.ts` — ล็อกอิน/MFA 10 ครั้ง/10 นาที, POST /api 60 ครั้ง/นาที → 429
- **Audit Log**: ทุกการเขียนของ admin (create/update/delete/publish) ถูกบันทึกลง `audit-log`
  (action, contentType, entryId, adminEmail, tenantKey, at) ผ่าน Document Service middleware
- **Session/idle timeout**: `config/admin.ts` `auth.options.expiresIn` = `ADMIN_SESSION_TTL` (ดีฟอลต์ 30m)
- **CAPTCHA**: backend พร้อม (`/api/captcha` + `middlewares/captcha-guard.ts` + `assets/captcha.js`) —
  ปิดเป็นค่าเริ่มต้น (`CAPTCHA_ENABLED=true` เพื่อเปิด) รอ wire ช่องในฟอร์มให้ครบก่อน

> ⚠️ เปิด MFA แล้ว: เข้า http://localhost:1337/admin จะเจอหน้า MFA ก่อน — ใส่คีย์เดโมในแอป Authenticator
> หรือใส่ `MFA_ENABLED=false` ใน `.env` เพื่อปิดชั่วคราว

## โมดูลเนื้อหา #3 (เพิ่มแล้ว)
Content type เพิ่ม 5 รายการ (tenant-scoped + seed + สิทธิ์ public):
- **Download** (ศูนย์ดาวน์โหลด), **E-book**, **Gallery** (อัลบั้มภาพ) — API พร้อม จัดการในหลังบ้าน
- **Popup** (ประกาศ) → `assets/modules.js` เด้งโมดอลบนหน้าเว็บตาม tenant (เด้งครั้งเดียว/เครื่อง)
- **Poll/Vote** → วิดเจ็ตโหวตบนหน้าแรก + `POST /api/polls/:documentId/vote` (โหวตแล้วแสดงผล %)

ทดสอบแล้ว: popup dga vs pea แยกกัน, poll โหวต 97→98 persist, frontend popup+poll ทำงาน

## GEO/AEO + SEO #2 (เพิ่มแล้ว)
`middlewares/seo.ts` เสิร์ฟ 3 ไฟล์ที่ root แบบ dynamic ต่อ tenant (resolve จาก Host):
- **`/robots.txt`** — allow + AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) + ลิงก์ sitemap
- **`/sitemap.xml`** — สร้างจาก CMS: หน้าหลัก + งานทุกตำแหน่ง (`job.html?id=`) ใช้โดเมนของ tenant
  (dga → https://dga.or.th, pea → https://pea.co.th)
- **`/llms.txt`** — สรุปเนื้อหา (org, บริการ, หน้าหลัก, FAQ, ติดต่อ) จาก CMS สำหรับ Generative AI
- **JSON-LD ต่อหน้า**: `careers.js` ฝัง **JobPosting** + **BreadcrumbList** ในหน้างาน (`job.html`)
  (หน้าแรกมี GovernmentOrganization + WebSite + FAQPage อยู่แล้ว)

ทดสอบแล้ว: robots/sitemap/llms แยกตาม tenant, sitemap มี 20 งาน, JobPosting+Breadcrumb บนหน้างาน

## Hybrid Search (TOR 8) — เพิ่มแล้ว
- **8.1 Simple**: `GET /api/search?q=` ค้นทุกเนื้อหา (article/service/faq/job/download/ebook) scope ตาม tenant
- **8.2 Advanced**: ตัวกรอง `types` (กลุ่มเนื้อหา), `from`/`to` (ช่วงวันที่), `fileType` (pdf/docx/xlsx), keyword
- **8.3 Full-text ในไฟล์**: lifecycle ของ Download/E-book สกัดข้อความจากไฟล์ที่แนบ (`src/utils/extract-text.ts`
  ใช้ pdf-parse/mammoth/xlsx) → เก็บใน `contentText` → ค้นเจอข้อความภายในไฟล์ได้
- หน้า **`search.html`** + `assets/search-page.js`: ฟอร์มค้นหาขั้นสูง + ไฮไลต์คำค้น + snippet จากในไฟล์ + ลิงก์เปิดไฟล์
- เดโม: อัปโหลด TOR PDF จริง (28 หน้า) → ค้นชื่อที่อยู่ "ในไฟล์" (เช่น พัฒนทวีกิจ) เจอเอกสาร พร้อม snippet
- gotcha: lifecycle ที่ index ต้องกันลูป (ข้ามถ้า update มี contentText) ไม่งั้น re-index วนจน heap OOM

## Performance / Lighthouse (#2 — เพิ่มแล้ว)
ปรับปรุงตามเกณฑ์ Lighthouse Performance:
- **ฟอนต์**: ย้ายจาก `@import` ใน design-system.css (render-blocking, serialize) → `<link rel="preconnect">`
  (googleapis+gstatic) + `<link rel="stylesheet" display=swap>` ใน `<head>` ทุกหน้า (14 หน้า) → โหลดขนาน, ลด FCP/LCP
- **font-display: swap** (กัน FOIT), โหลดเฉพาะ weight ที่ใช้ (300–700)
- **สคริปต์ไม่บล็อก**: ทุก `<script>` อยู่ท้าย `<body>` (ไม่บล็อก parsing); cms.js เรนเดอร์แล้วค่อยโหลด home.js
- **รูปภาพ**: `loading="lazy"` ใต้ fold, `width/height`/`onerror` กันรูปแตก (ลด CLS)
- หน้า static เสิร์ฟเร็ว (DOMContentLoaded ~55ms, load ~510ms บน localhost)

Checklist สำหรับวัด Lighthouse จริง (รันเอง): `npx lighthouse http://localhost:8080/ --view`
หรือ Chrome DevTools → Lighthouse → Performance · production ควรเพิ่ม: CDN + cache headers,
self-host fonts, brotli/gzip, รูป webp/avif + responsive sizes, HTTP/2

## Live chat + social channels (#3 — เพิ่มแล้ว)
- `Tenant.liveChat.channels = [{ type:'line'|'messenger'|'facebook'|'phone', label, url }]` (ตั้งต่อ tenant)
- `assets/livechat.js` = **ปุ่ม "แชตสด" ลอยมุมซ้ายล่าง** (วิดเจ็ตอิสระ มองเห็นชัด ไม่ต้องเปิดแชต AI ก่อน)
  → คลิกเปิด popup ช่องทาง LINE/Messenger/Facebook/โทร (สีตามแบรนด์) เปิดช่องทางจริงในแท็บใหม่
- resolve คืน `liveChat` ต่อ tenant · ทดสอบแล้ว: dga = LINE/Messenger/Facebook/โทร, pea = LINE/Facebook/โทร
- **cache-busting**: เพิ่ม `?v=N` ต่อท้าย cms.js/search-cms.js/jobs-cms.js ในทุกหน้า เพื่อให้เบราว์เซอร์โหลด JS ใหม่
  (เลี่ยงปัญหา cache JS เดิม) — บั๊มเลข v เมื่อแก้ไฟล์ loader

## Landing/Splash page builder (no-code) — เพิ่มแล้ว (TOR โมดูล Landing/Splash)
- **Content type `Landing`** (collection, draft&publish, ผูก tenant): `title`, `slug` (uid), `active`, `seoDescription`, `blocks` (**Dynamic Zone**)
- **บล็อกสำเร็จรูป** (`src/components/block/`): `hero`, `richtext`, `image`, `cta-banner`, `feature-grid` (+`feature-item`)
  → แอดมินกด **เพิ่ม/ลาก/สลับบล็อก** ในหลังบ้าน พิมพ์ข้อความ-อัปรูปเองได้ **โดยไม่เขียนโค้ด** = no-code page builder
- **หน้าเรนเดอร์**: `site/DGA-Website/landing.html` (shell ว่าง) + `assets/landing.js` (ดึง CMS → เรนเดอร์บล็อกตามลำดับ) + `assets/landing.css`
  → เปิดด้วย `/landing?slug=<slug>` เช่น `/landing?slug=thaid` · รองรับ `?tenant=` (multi-tenant)
  → `landing.js` มี markdown ย่อ (## ### , รายการเลข/จุด, **ตัวหนา**) สำหรับบล็อก rich text
- **Multi-tenant**: `landing` อยู่ใน SCOPED (index.ts) + backfill + public perm (find/findOne) — ทดสอบแล้ว pea เปิด landing ของ dga ไม่ได้ (data isolation)
- seed ตัวอย่าง: `seedLanding()` สร้างหน้า `thaid` (hero + feature-grid 3 + richtext + cta) ให้ dga
- **gotcha**: component UID = ชื่อไฟล์ (`richtext.json` → `block.richtext` ไม่ใช่ `block.rich-text`) — ถ้า dynamic zone อ้างผิดจะ 500 ที่ `getDeepPopulate`; แก้ index.ts (entry) แล้ว watcher ไม่ reload → ต้อง restart Strapi เอง
- populate ที่ใช้: `?populate[blocks][populate]=*` (ใช้ `curl -g` เพื่อกัน glob `[ ]`)

## Web Analytics dashboard (หลังบ้าน) — เพิ่มแล้ว (TOR โมดูล Web Analytics + Heatmap)
- **API**: `GET /api/analytics/summary` (`src/api/analytics/`) — สรุปสถิติ first-party ต่อ tenant
  → นับเนื้อหา (เฉพาะ published), ฟอร์มที่ได้รับ (**จำนวนรวมเท่านั้น — ไม่เปิดเผยตัวเรคคอร์ด/PDPA**), ความยินยอมคุกกี้, บทความยอดนิยม (ตาม views), ผลโพล, กิจกรรมแอดมินล่าสุด, ค่า GA4/Clarity ต่อ tenant
  → tenant จาก `ctx.state.tenantId` (ตั้งโดย tenant middleware จาก `?tenant=`)
- **ความปลอดภัย**: policy `global::admin-only` (`src/policies/admin-only.ts`) — ต้องส่ง Bearer admin token
  → **gotcha**: Strapi 5.48 admin login คืน token แบบ **opaque (session) ไม่ใช่ JWT** → verify ด้วย ADMIN_JWT_SECRET ไม่ได้; policy จึง **self-call `/admin/users/me`** ของ Strapi เอง ถ้าคืน 200 = admin จริง (ทนทุกเวอร์ชัน) · custom api ไม่รองรับ `type:'admin'` mount ที่ root → ใช้ content-api route + policy แทน
- **หน้าแดชบอร์ด**: `site/DGA-Website/analytics.html` + `assets/analytics.js` + `assets/analytics.css`
  → login ด้วยบัญชี Strapi Admin (POST `/admin/login` → เก็บ token ใน sessionStorage) → KPI cards + แท่งสัดส่วน + ตัวสลับ tenant + ลิงก์ GA4/Clarity ภายนอก · `<meta robots noindex>`
  → ทดสอบแล้ว: dga (เนื้อหา 101, views 2,258, consent 80%) สลับเป็น pea (15, 3,653, Clarity=demoPEA) — **ข้อมูลแยกต่อ tenant** · ไม่มี token = 403

## WebX Console — หลังบ้านรวมศูนย์ต่อ tenant (SPA) — กำลังสร้าง
แนวคิด: ล็อกอินบัญชี Strapi Admin **ครั้งเดียว** → หน้าแรกหลังบ้าน **แบรนด์ตาม tenant** → โมดูล (Analytics/Content/Users/Chat/Branding). ยังเป็น **backend เดียว (Strapi)**; Console = admin frontend ที่คุย API.
- **Context API**: `GET /api/console/context` (`src/api/console/`, policy `global::admin-only`)
  → คืน `{ admin:{email,firstname,isSuper}, tenants:[{key,name,brand}] }` · super admin = ทุก tenant, editor = เฉพาะ tenant ที่อีเมลอยู่ใน `adminEmails` (isSuper เช็คจาก role `strapi-super-admin`)
- **SPA**: `site/DGA-Website/console.html` + `assets/console.js` + `assets/console.css` (ใช้คลาส `a-*` จาก analytics.css ในวิว Analytics)
  → sidebar + topbar + hash router · `--wx-accent` = `brand.primaryColor` ต่อ tenant · ตัวสลับ tenant (super admin)
- **Increment 1 (เสร็จ)**: shell + login เดียว + Home(ไทล์) + **Analytics** (พับของเดิมเข้า) + **Content** (ลิงก์เข้า Strapi content-manager ต่อ type, RBAC อัตโนมัติ)
  → verify: login → 5 ไทล์, สลับ dga(#1a4fa0/สพร.)↔pea(#6a2c91/กฟภ.) accent+แบรนด์เปลี่ยนสด, Analytics 101/2,258/4/80%, ไม่มี console error
- **Increment 2+ (ค้าง)**: Users (จัดการ admin/editor ต่อ tenant), Chat (liveChat channels + AI), Branding (brand/contact/social) — ปุ่มขึ้น "เร็ว ๆ นี้" รอสร้าง
- หน้า standalone เดิม `analytics.html` ยังใช้ได้ (ใช้ token เดียวกัน)
- **SSO เข้า Strapi Admin (ไม่ล็อกอินซ้ำ)** — เสร็จแล้ว:
  → Console กับ Strapi admin คนละ origin (:8080 vs :1337) → ใช้ **bridge page** ที่ Strapi เสิร์ฟ: `GET /api/sso/bridge` + `/api/sso/bridge.js`
  → Console ส่ง admin token ทาง **URL fragment** (`#token=...&redirect=/admin`) — ไม่ขึ้น server log; bridge.js เขียน `localStorage['jwtToken']=JSON.stringify(token)` + `localStorage['isLoggedIn']='true'` (คีย์ที่ Strapi 5 admin ใช้) แล้ว `location.replace(redirect)`
  → **gotcha**: CSP ของ Strapi (helmet) = `script-src 'self'` บล็อก inline script → ต้องแยก logic เป็นไฟล์ JS **same-origin** (`/api/sso/bridge.js`) ไม่ใช่ inline; redirect จำกัดเฉพาะ `/admin*` กัน open-redirect
  → ไทล์ Content ใน Console สร้างลิงก์ผ่าน bridge อัตโนมัติ (`strapiAdmin()` ใน console.js) → คลิกแล้วเข้า content-manager โดยไม่ล็อกอินซ้ำ

## Group A — ปิด gap โมดูล TOR ที่ขาด (กำลังทำ)
หลักการ: **Strapi = backend เดียวเสมอ** (ทุก type มี tenant + SCOPED + backfill + perm + draft&publish); Console = ประตูหน้าเดียว; custom view เฉพาะที่ UX ต้องการ
- **กลุ่มแรก (เสร็จ + E2E ผ่าน):** Blog (#15) · e-catalog (#19) · Web Link (#23) · Top Graphic (#24)
  → content types: `blog`, `catalog`, `weblink`, `top-graphic` (+ seed dga) · public perm find/findOne · เพิ่มในวิว Content ของ Console (แก้ผ่าน Strapi via SSO)
  → หน้าแสดง: `blog.html` · `catalog.html` · `links.html` (Top Graphic strip) — ใช้ `assets/groupa.js` (ตัวเดียว, `body[data-ga-page]`) + `assets/groupa.css`
  → E2E (เบราว์เซอร์): blog 3 โพสต์, catalog 3 การ์ด, links 4 ลิงก์/3 กลุ่ม + top-graphic strip, ไม่มี console error, isolation pea=0
- **กลุ่มที่สอง (เสร็จ + E2E ผ่าน):** ปฏิทินกิจกรรม (#16) · Map (#27) · Sitemap manager (#25)
  → content types: `event`, `location`, `sitemap-node` (+ seed dga) · public perm find/findOne · เพิ่มในวิว Content ของ Console
  → หน้าแสดง: `calendar.html` (+`assets/calendar.js` มุมมองเดือน/สัปดาห์/วัน, คลิกดูรายละเอียด) · `map.html` (+`assets/map.js`, Leaflet+OSM, ปุ่มหาจุดใกล้สุด Geolocation+Haversine) · `sitemap.html` (groupa.js page=sitemap)
  → E2E: ปฏิทิน มิ.ย.2569 4 กิจกรรมวางถูกวัน + สลับวิว, แผนที่ 4 หมุด+12 tiles+รายการ, sitemap 4 กลุ่ม/12 ลิงก์, ไม่มี console error
  → **Group A ครบ 7/7 โมดูล** (Blog, e-catalog, Link, Top Graphic, ปฏิทิน, Map, Sitemap)

## Group B — หน้าแสดงผล + สถิติ (เสร็จ + E2E ผ่าน)
ปิด gap TOR: Photo Gallery (#6) · Video Gallery (#7) · Download (#21) · FAQ (#20) · News (#5)
- **Stat endpoint**: `POST /api/stat {type, documentId}` (`src/api/stat/`, public) → +1 ตัวนับ (gallery/faq เพิ่มฟิลด์ `views`; video.views, download.downloads มีอยู่แล้ว); อัปเดตเวอร์ชัน published
- **enrichGroupB seeder**: แนบรูปจริงให้ gallery (cover + 5–6 ภาพ) + thumbnail จริง + YouTube (วิดีโอโอเพนซอร์ส) ให้ video
- **หน้าแสดง**: `gallery.html` (lightbox) · `video.html` (modal + YouTube embed) · `download.html` (หมวด + ตัวนับดาวน์โหลด) · `faq.html` (accordion + ค้นหา + **FAQPage JSON-LD/AEO**) · `news.html` (กรองหมวด) — ใช้ `assets/groupb.js` (ตัวเดียว, `body[data-gb-page]`) + `assets/groupb.css`
- **E2E (เบราว์เซอร์)**: gallery 2 อัลบั้ม+lightbox, video 6+embed, download 4 หมวด, faq 6+accordion+ค้นหา+schema, news 10+10 ตัวกรอง · ไม่มี console error
- **Stat full-stack verified**: คลิกแล้วตัวนับขึ้นจริง (gallery/video/faq) · เพิ่ม gallery/video เข้าวิว Content ของ Console
- **นำทาง**: ลิงก์ Group B เข้า mega-menu + footer ทุกหน้า full-nav (video/gallery/download/faq/news)

## Template (no-code) + Watermark + Subtitle + Console Branding (เสร็จ + E2E)
ปิด gap TOR: เทมเพลต 3 แบบ (#3) · ลายน้ำคลังภาพ (#6.11) · ซับไตเติลวิดีโอ (#7.8)
- **Tenant config**: เพิ่มฟิลด์ `template {preset:'a'|'b'|'c', background}` + `watermark {enabled, text}`; video เพิ่ม `subtitles` (media .vtt); resolve คืน template/watermark
- **เทมเพลต 3 แบบ (no-code)**: `assets/templates.css` (A มาตรฐาน / B คม-กระชับ / C โค้งมน-โปร่ง) คุม style+layout ด้วย CSS ผ่าน `html[data-template]`; `tenant.js` ใส่ data-template + background ต่อ tenant
- **Console Branding view** (`console.js` viewBranding — ไทล์ "แบรนด์/เว็บไซต์" = live): เลือกเทมเพลต (พรีวิวย่อ 3 แบบ) + สีแบรนด์ + สีพื้นหลัง + ลายน้ำ (เปิด/ปิด+ข้อความ) → **บันทึก** `PUT /api/console/branding` (admin-only, super=?tenant, editor=ของตน)
- **Watermark**: `groupb.js` คลังภาพ → overlay ข้อความลายน้ำบนรูป+lightbox เมื่อ tenant เปิด (CSS `.gb-wm`)
- **Subtitle**: video modal — YouTube ใส่ `cc_load_policy=1` (เปิด captions); ไฟล์ตรง ใช้ `<video><track .vtt>`
- **E2E**: watermark 2 อัลบั้ม+lightbox "สพร. • DGA" · home ได้ data-template="a" · Console เลือก B→บันทึก→DB preset b→**หน้าแรกเปลี่ยนเป็นแบบ B ทันที** · ไม่มี console error · seed: dga=A, pea=B
- หมายเหตุ: 3.3 Drag&Drop จัดวาง = ส่งมอบผ่าน Landing/Splash no-code page builder (Dynamic Zone) ที่ทำไว้แล้ว

## Media processing — Image optimize + Video auto-resolution (เสร็จ + E2E)
- **Image auto-optimization** (TOR #6.3): `config/plugins.ts` → upload `{ sizeOptimization, responsiveDimensions, autoOrientation, breakpoints }`
  → อัปโหลดภาพ → sharp สร้าง thumbnail/small/medium/large + บีบอัดอัตโนมัติ (article-1.jpg 138KB → small 49KB ~-64%)
  → `media(m, size)` ใน groupa.js/groupb.js เลือกขนาดเหมาะ (gallery/video grid=small, news=medium, lightbox=เต็ม) — ลด LCP/แบนด์วิดท์ (ช่วยคะแนน Performance #4.1.6)
  → `enrichGroupB` re-upload ภาพ gallery ที่ยังไม่มี formats อัตโนมัติ · E2E: gallery โหลด `small_*.jpeg` 49KB จริง
- **Video auto-resolution** (TOR #7.11): วิดีโอเล่นผ่าน **YouTube embed = adaptive streaming เนทีฟ** (player ปรับความละเอียดอัตโนมัติตามแบนด์วิดท์ — ไม่ fix vq); ไฟล์ตรงใช้ `<video>` ปรับคุณภาพเนทีฟ + รองรับหลาย `<source>` ได้
  → (adaptive แท้สำหรับไฟล์โฮสต์เองต้องมี HLS/DASH transcoding pipeline — นอกขอบเขต config CMS)

## WebX Console — Users + Chat modules (เสร็จ + E2E) → Console ครบทุกโมดูล
- **Users** (`viewUsers` + `GET/PUT /api/console/users`): จัดผู้ดูแลเนื้อหาต่อ tenant ผ่าน `Tenant.adminEmails` (= per-tenant RBAC จริง)
  → ตารางบัญชี admin ทั้งหมด + ติ๊กเลือกผู้ดูแลของหน่วยงาน (Super Admin = "ทุกหน่วยงาน") → บันทึก
  → E2E: ติ๊ก 2 editors → DB `["dga-editor","pea-editor"]` → revert; super=?tenant, editor=ของตน
- **Chat** (`viewChat` + `PUT /api/console/branding {liveChat}`): จัดช่องทาง Live Chat (เพิ่ม/แก้/ลบ type+label+url)
  → E2E: เพิ่มช่องทาง X → บันทึก → DB 5 ช่องทาง → **ปุ่ม "แชตสด" หน้าเว็บแสดง X ทันที** (loop ปิดครบ)
- Console modules ครบ: Analytics · Content (SSO) · Branding · Users · Chat

## TOR ข้อ 4 (CMS core) — ครบ 4.1–4.4 (เสร็จ + E2E)
- **4.1 เพิ่ม/ลบ/แก้/เรียงลำดับ เนื้อหา + เมนูหลัก**: content CRUD+order ✅ + **เมนูหลักจาก CMS** (content type `menu-item` + `menu.js` สร้าง mega-menu จาก `/api/menu-items` ต่อ tenant)
- **4.2 Tag เพื่อค้นหา**: `article.tags`/`blog.tags` (json) → แสดงบนการ์ด+หน้าบทความ, กรอง `news.html?tag=`, ค้นใน Hybrid Search (เพิ่ม tags ใน kw + `status:'published'`)
- **4.3 Related Content**: `article.related` (self manyToMany) → `article.html` แสดง "ข่าวที่เกี่ยวข้อง"
- **4.4 WYSIWYG คล้าย Word**: ติดตั้ง **`@_sh/strapi-plugin-ckeditor` (CKEditor 5)** → `article.body`/`blog.body` เป็น customField `plugin::ckeditor5.CKEditor` (preset HTML: ใส่สี/แทรกตาราง/วางจาก Word/อัปรูป)
  → `article.js` `renderBody()` เรนเดอร์ HTML(CKEditor) หรือ Markdown(เดิม) อัตโนมัติ · E2E: หน้าบทความ render ตาราง+ข้อความสี+หัวข้อ
- ทั้งหมด verify E2E ในเบราว์เซอร์ · ไม่มี console error

## ยังไม่ได้ทำ (งวดถัดไป)
- Production: Docker/PostgreSQL/DR, SMTP จริง, .pptx full-text, form file upload (multipart)
- หน้าแสดง Download/E-book/Gallery, .pptx full-text, จำกัด relation picker ของ editor (UI), เมนู mega จาก CMS
- เนื้อหา `/en/` ครบทุก collection, รูปจริง PEA, อัปโหลดไฟล์แนบฟอร์ม, SMTP จริง, proxy SEO files ที่โดเมนจริง
