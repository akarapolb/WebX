---
name: dga-website
description: ผู้เชี่ยวชาญออกแบบ/พัฒนาเว็บไซต์ภาครัฐไทยตาม TOR DGA-69-0177 (สพร./DGA, dga.or.th). ใช้เมื่อทำงานออกแบบ UX/UI, Information Architecture, Design System, WCAG 2.2 AA, GEO/AEO, Schema.org, Chat AI/Smart Search, Web CMS, PDPA/Cookie Consent หรือเตรียมข้อเสนอ/Mockup/Prototype เพื่อยื่นประมูลงานนี้. ครอบคลุมเกณฑ์ให้คะแนนและงวดงานตาม TOR.
---

# Skill: เว็บไซต์ภาครัฐไทย — DGA (สพร.) ตาม TOR DGA-69-0177

ใช้ skill นี้เมื่อทำงานเกี่ยวกับโครงการ "ออกแบบและพัฒนาระบบเว็บไซต์ สพร. (dga.or.th)" — ทั้งช่วงเตรียมข้อเสนอประมูล (bid) และช่วงพัฒนาจริงหลังได้งาน.

## หลักการตัดสินใจ (อ่านก่อนเสมอ)
1. **ทุกข้อเสนอต้องผูกกับเกณฑ์คะแนน** ด้านล่าง และอ้าง TOR ข้อที่เกี่ยวข้อง. ห้ามตอบกว้าง ๆ — ต้องนำไปใช้ทำงานจริงได้.
2. **เสนอแบบ incremental** ก่อน ไม่รื้อระบบถ้าไม่จำเป็น.
3. ถ้าแก้โค้ด **แยก HTML / CSS / JS ชัดเจน** และใส่ comment ให้ทีมพัฒนาเข้าใจ.
4. **ภาษาไทยเป็นค่าเริ่มต้น**, มีอังกฤษคู่. ฟอนต์: ไทย = `Kanit`, อังกฤษ = `Ubuntu`.
5. ตอบโต้ตอบกับผู้ใช้ **เป็นภาษาไทย**.

## เกณฑ์ให้คะแนน (TOR ข้อ 6.1 — เต็ม 100, ผ่านต้อง ≥ 80 ในข้อเทคนิค)
| หมวด | น้ำหนัก | ตัวชี้วัดย่อย (แต่ละตัว ~20/100) |
|---|---|---|
| **Design & UX/UI** | **50** | 2.1 Design System+Typography (Figma/CSS Framework) · 2.2 เข้าถึงใน ≤3 คลิก (ต้องมี Sitemap+User Flow) · 2.3 WCAG 2.1/2.2 AA (Contrast, Screen Reader, Testing Tools) · 2.4 Responsive 3 อุปกรณ์ · 2.5 Mockup+Wireframe 3 อุปกรณ์ 5 หน้า |
| การนำเสนอ/สาธิต | 20 | สาธิตหน้าเว็บ **ทำงานจริง 2 หน้า** ได้ 100; 1 หน้า = 80 |
| ราคา | 20 | Price Performance |
| Security | 10 | MFA + session/idle timeout + **DR site (RTO/RPO)** = 100; ไม่มี DR = 80 |

**สรุปกลยุทธ์ชนะ:** Design&UX/UI คือ 50% — ทุ่มที่ Design System + 3-Click + WCAG + Responsive + Mockup. สาธิต 2 หน้าทำงานจริงเก็บอีก 20%. มี DR site เก็บ Security เต็ม 10%.

## งบและงวดงาน (TOR ข้อ 7–8)
- งบ **3,000,000 บาท**, ระยะเวลา **365 วัน**.
- งวด 1 (10%, ภายใน 30 วัน): Project Plan, Requirement Analysis Report, System Architecture, Server Specs.
- งวด 2 (40%, ภายใน 60 วัน): Design Concept, **Sitemap, Mockup, Prototype, User Flow, UI Design (3 layout)**, โครงสร้าง CMS.
- งวด 3 (30%, ภายใน 180 วัน): Source Code, Test Script, **UAT**, User Manual, Backup.
- งวด 4 (20%, ภายใน 365 วัน): Warranty/Monitoring, อบรม Admin, **Penetration Test Report**, ส่งมอบ Source Code+License+Admin Accounts.
- รับประกัน 1 ปี, SLA 4 ระดับ (Critical แก้ใน 15 นาที).

## ข้อกำหนดเทคนิคหลัก (TOR ข้อ 4 + ภาคผนวก 1–29)
- **CMS** จัดการเนื้อหาหลายฝ่าย, สิทธิ์ผู้ใช้, WYSIWYG (วางจาก Word), แก้ HTML, แนบไฟล์ docx/xls/ppt/pdf/zip, สถานะเผยแพร่, แชร์ Social (FB/TikTok/IG/YouTube/X/LINE).
- **2 ภาษา** ไทย(ดีฟอลต์)/อังกฤษ. **Responsive** Desktop/Tablet/Mobile.
- **Browser**: Chrome, Edge, Firefox, Safari + Mobile (Android Chrome, iOS Safari).
- **WCAG 2.1/2.2 ระดับ AA** อย่างน้อย.
- **Hybrid Search**: Simple + Advanced (keyword) + **Full-text ในไฟล์ pdf/docx/xlsx/pptx**.
- **Government AI Smart Search** (Chat AI ตอบจากเนื้อหาเว็บ).
- **Schema Markup (Schema.org)** เพื่อ **GEO + AEO + AI**.
- **Page Speed / Lighthouse** Performance audit.
- โมดูล CMS 29 รายการ: Home(hero/video), Template(3 แบบ), Content, News, Photo/Video Gallery, Hybrid Search, AI Smart Search, Schema, Contact, Live chat, Form+auto email, Vote, Blog, e-book, Banner, e-catalog, FAQ, Download, Popup, Link, Top Graphic, Sitemap, **Landing/Splash (no-code)**, Map, **Web Analytics+Heatmap (GA + Clarity/Hotjar)**, **Cookie Consent (granular, opt-in/out, default off, consent log, 2 ภาษา)**.
- **ความปลอดภัย**: Data Validation, CAPTCHA, SSL/TLS(HTTPS), Log File, **PDPA**, Vulnerability Scan, **MFA สำหรับ Back-Office**, Encryption.
- **Migrate** เนื้อหาตั้งแต่ปี 2559 เป็นต้นมา (รักษา URL/redirect).

## Design System (ตอบเกณฑ์ 2.1 — ทำก่อน ห้ามเลื่อน)
ต้องมีครบ: **Typography, Color Palette, Iconography, UI Components (Buttons, Form Inputs)** ส่งมอบเป็น **Figma Component + CSS Framework/Design Tokens**.
- ฟอนต์: `--font-th: 'Kanit'`, `--font-en: 'Ubuntu'`. โหลด weight เท่าที่ใช้ (300/400/500/600/700) ลด CLS/LCP.
- สีต้องผ่าน **contrast AA**: ข้อความปกติ ≥ 4.5:1, ข้อความใหญ่ ≥ 3:1, UI/โฟกัส ≥ 3:1.
- ไฟล์ token เริ่มต้นโครงการอยู่ที่ `assets/design-system.css`.

## GEO / AEO — แนวทางมาตรฐาน
- **GEO** (ให้ AI/Generative engine อ้างอิงเว็บได้): เนื้อหามีโครงสร้างชัด, heading ลำดับถูก, สรุปคำตอบต้น ๆ ของหน้า, ตาราง/รายการ, วันที่อัปเดต, ผู้เผยแพร่/หน่วยงาน, `llms.txt`, sitemap.xml, robots อนุญาต AI crawler ที่ต้องการ, Schema ครบ.
- **AEO** (ตอบคำถามตรง): ทุกหน้าบริการมี **Answer Block** (คำถาม→คำตอบสั้น 40–60 คำ) + `FAQPage` schema + `HowTo` สำหรับขั้นตอนบริการ + breadcrumb.
- Schema ที่ใช้บ่อย: `GovernmentOrganization`, `GovernmentService`, `WebSite`+`SearchAction`, `BreadcrumbList`, `FAQPage`, `HowTo`, `Article`/`NewsArticle`, `Dataset`, `Speakable`.

## WCAG 2.2 AA — เช็คเร็ว
Landmark/heading ถูกลำดับ · alt ครบ · contrast AA · โฟกัสมองเห็น (2.4.11) · keyboard เข้าถึงทุกอย่าง · target ≥ 24px (2.5.8) · ฟอร์มมี label+error+aria-describedby · ภาษา `lang="th"`/`lang="en"` · ไม่พึ่งสีอย่างเดียว · prefers-reduced-motion.
**ตรวจด้วย**: axe DevTools, Lighthouse, WAVE, keyboard-only, NVDA/VoiceOver, contrast checker.

## รูปแบบโค้ดที่ใช้ซ้ำ
- Skip link, landmark `<header><nav><main><footer>`, `:focus-visible` ชัด.
- Schema JSON-LD วางใน `<head>` ต่อหน้า.
- Responsive: mobile-first, breakpoint Tablet ~768px, Desktop ~1024px/1280px.
- เมนูหลัก: mega-menu จัดกลุ่มตามกลุ่มผู้ใช้ (ประชาชน/หน่วยงานรัฐ/ธุรกิจ/นักพัฒนา) เพื่อคุม 3-Click Rule.

## ไฟล์อ้างอิงในโปรเจกต์
- `docs/DGA-วิเคราะห์-19-หัวข้อ.md` — บทวิเคราะห์เต็ม 19 หัวข้อ + โค้ด + schema + checklist.
- `assets/design-system.css` — Design Tokens เริ่มต้น (Kanit/Ubuntu, สี, ปุ่ม, ฟอร์ม).
- `tor.txt` — ข้อความ TOR ที่สกัดแล้ว (อ้างอิงเลขข้อ).
