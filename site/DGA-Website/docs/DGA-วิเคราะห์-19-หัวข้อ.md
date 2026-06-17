# บทวิเคราะห์และข้อเสนอออกแบบ/พัฒนาเว็บไซต์ สพร. (DGA) — dga.or.th
อ้างอิง TOR งานจ้างออกแบบและพัฒนาระบบเว็บไซต์ สพร. (DGA-69-0177) · งบ 3,000,000 บาท · 365 วัน

> หลักการ: เสนอแบบ incremental ก่อน, ผูกทุกข้อกับเกณฑ์คะแนน, นำไปทำงานจริงได้, แยก HTML/CSS/JS ชัดเจน
> เกณฑ์คะแนนหลัก: **Design&UX/UI 50% · สาธิต 20% · ราคา 20% · Security 10%**

---

## 1) สรุปปัญหาหลักจากมุมมองผู้ใช้
1. **หาบริการไม่เจอใน 3 คลิก** — เว็บภาครัฐมักจัดเมนูตาม "โครงสร้างองค์กร" ไม่ใช่ "งานที่ประชาชนมาทำ" → ขัดเกณฑ์ 2.2 (3-Click Rule).
2. **ค้นหาอ่อน** — ค้นได้แค่หัวข้อข่าว ค้นในไฟล์ PDF/Word ไม่ได้ → ขัด TOR ภาคผนวกข้อ 8 (Full-text/Hybrid Search).
3. **ไม่พร้อมยุค AI Search** — ไม่มี Schema/Answer Block ทำให้ Chat AI/Generative Engine ดึงคำตอบไปแสดงไม่ได้ → ขัด TOR ข้อ 9–10 (GEO/AEO).
4. **Accessibility ไม่ถึง AA** — contrast ต่ำ, โฟกัสไม่ชัด, ฟอร์มไม่มี label, ใช้คีย์บอร์ดไม่ได้ → ขัดเกณฑ์ 2.3.
5. **Performance/Mobile** — รูปใหญ่ ฟอนต์หลาย weight สคริปต์บล็อก render → Lighthouse ต่ำ, ขัดข้อ 4.1.6.
6. **เนื้อห้าเก่า/ลิงก์เสีย** หลัง migrate ปี 2559 เป็นต้นมาถ้าไม่ทำ redirect → SEO/ความเชื่อถือพัง.

## 2) Pain Point แยกตามกลุ่มผู้ใช้
| กลุ่ม | Pain Point | สิ่งที่ต้องแก้ (ผูก TOR) |
|---|---|---|
| **ประชาชน** | ไม่รู้บริการอยู่ตรงไหน, ศัพท์ราชการเข้าใจยาก | เมนูตามภารกิจ + ช่องค้นหาเด่น + Answer Block (2.2, ผนวก 9–10) |
| **หน่วยงานรัฐ** | หามาตรฐาน/คู่มือ/แบบฟอร์ม/กฎหมายดิจิทัลไม่เจอ | ศูนย์ดาวน์โหลด + Full-text search ในไฟล์ (ผนวก 8, 21) |
| **ภาคธุรกิจ** | หา API/บริการเชื่อมต่อ/ประกาศจัดซื้อยาก | Developer/Service hub + Schema `GovernmentService` |
| **นักพัฒนา** | ไม่มี Design System/เอกสารให้ต่อยอด | ส่งมอบ Figma + Design Tokens/CSS (เกณฑ์ 2.1) |
| **ผู้พิการ** | Screen reader อ่านไม่รู้เรื่อง, คีย์บอร์ดใช้ไม่ได้ | WCAG 2.2 AA เต็มรูปแบบ + ทดสอบจริง (เกณฑ์ 2.3) |

## 3) ข้อเสนอ UX/UI ที่ตรงกับ TOR
- **เปลี่ยน IA เป็น task-based**: เมนูหลักจัดตาม "กลุ่มผู้ใช้ + ภารกิจ" ไม่ใช่ฝ่ายงาน → คุม 3-Click (2.2).
- **Hero + ช่องค้นหากลาง** บนหน้าแรก พร้อม "บริการยอดนิยม" 6–8 การ์ด (เข้าบริการใน 1 คลิกจากหน้าแรก).
- **Mega menu** จัดกลุ่มชัด, มี breadcrumb ทุกหน้า (ช่วยทั้ง UX และ AEO).
- **Pattern คงที่จาก Design System** ทุกหน้า → ลดภาระเรียนรู้ + ได้คะแนน 2.1.
- **2 ภาษา** สลับมุมขวาบน, ไทยเป็นค่าเริ่มต้น, คง URL ต่อภาษา (`/th/…`, `/en/…`).
- **Feedback ชัดเจน**: สถานะโหลด, error, empty state, success — ทุกอันมีข้อความ ไม่พึ่งสีอย่างเดียว.

## 4) Information Architecture & Sitemap
```
หน้าแรก (Home)
├─ บริการประชาชน        → e-Service, ตรวจสอบสิทธิ์, แอปภาครัฐ (ทางรัฐ), บัตรประชาชนดิจิทัล
├─ สำหรับหน่วยงานรัฐ     → มาตรฐาน/กรอบ EA, คู่มือ, แบบฟอร์ม, อบรม TDGA, ขอใช้บริการกลาง
├─ สำหรับนักพัฒนา/ธุรกิจ → API Gateway, Open Data, GovTech, จัดซื้อจัดจ้าง (e-GP)
├─ เกี่ยวกับ สพร.        → วิสัยทัศน์, โครงสร้าง, รายงานประจำปี, ITA, ติดต่อ
├─ ข่าว/กิจกรรม          → ข่าวประชาสัมพันธ์, บทความ, สื่อมัลติมีเดีย
├─ ศูนย์ความรู้/ดาวน์โหลด → กฎหมายดิจิทัล, มาตรฐาน, e-Book, FAQ
└─ ค้นหา (Hybrid Search) → Simple / Advanced / Full-text in files
ส่วนกลางทุกหน้า: ภาษา, ค้นหา, Cookie Consent, ติดต่อ/Live chat, Sitemap, แผนผังเว็บ
```
> ส่งมอบเป็น **Sitemap + User Flow** เพื่อพิสูจน์ 3-Click (เกณฑ์ 2.2 ได้ 20 เต็มต้องมี User Flow).

## 5) หน้าแรกเข้าถึงบริการหลักภายใน 3 คลิก
- **คลิก 0 (หน้าแรก)**: ช่องค้นหา + การ์ดบริการยอดนิยม (เข้าบริการตรงเลย = 1 คลิก).
- **คลิก 1**: เลือกกลุ่มผู้ใช้จาก mega menu → เห็นรายการบริการ.
- **คลิก 2**: เข้าหน้าบริการ (มี Answer Block + ขั้นตอน + ปุ่มเริ่มใช้บริการ).
- **คลิก 3**: เริ่มทำธุรกรรม/ดาวน์โหลด/ลิงก์ไปปลายทาง.
- เครื่องมือคุมระยะคลิก: เมนูคงที่, breadcrumb, "บริการยอดนิยม", ค้นหา global, footer sitemap.

## 6) Design System (สี/Typography/Icon/Button/Form/Card/Navigation)
> ไฟล์เริ่มต้น: `assets/design-system.css` (Design Tokens พร้อมใช้). ส่งมอบคู่ **Figma Component Library** เพื่อกินคะแนน 2.1 เต็ม 20.
- **Typography**: ไทย `Kanit` (300–700), อังกฤษ `Ubuntu` (300–700), line-height 1.6 (ไทยมีวรรณยุกต์), type scale 1.25.
- **สี**: Primary `#1351A6` (น้ำเงินภาครัฐ, contrast 6.4:1), Accent แดง, semantic success/warning/danger ที่ผ่าน AA, โฟกัส `#FFB000`.
- **Icon**: ชุดเดียวทั้งเว็บ (เช่น Material Symbols/Lucide), มี `aria-hidden` เมื่อเป็นไอคอนตกแต่ง.
- **Button**: primary/ghost, min-height 44px (tap target), สถานะ hover/disabled/focus.
- **Form**: label เสมอ, hint + error ผูก `aria-describedby`, `aria-invalid`.
- **Card / Navigation**: การ์ดบริการ, mega-menu, breadcrumb, pagination — สเปคใน CSS.

## 7) GEO สำหรับ AI Search (Generative Engine Optimization)
ให้ AI (ChatGPT/Gemini/Perplexity/Copilot) ดึงและอ้างอิงเนื้อหา DGA ได้ถูกต้อง:
1. **โครงสร้างเนื้อหาชัด**: H1 เดียว, heading ไล่ลำดับ, ย่อหน้าแรกสรุปคำตอบ, ใช้ตาราง/บูลเล็ต.
2. **Schema.org ครบ** (ดูข้อ 16): `GovernmentOrganization`, `GovernmentService`, `Article`, `FAQPage`, `Dataset`.
3. **`/llms.txt`** สรุปโครงสร้างเว็บ + ลิงก์หน้าสำคัญให้ LLM, **sitemap.xml** สด, robots อนุญาต crawler ที่ต้องการ.
4. **ระบุแหล่งและเวลา**: ผู้เผยแพร่ = สพร., `dateModified`, อ้างกฎหมาย/มาตรฐาน → เพิ่ม trust ของคำตอบ AI.
5. **Canonical + ไม่มี duplicate**, ภาษากำกับ `hreflang` ไทย/อังกฤษ.
6. **เนื้อหา machine-readable**: เปิด Open Data/`Dataset` ให้ AI ใช้อ้างได้.

## 8) AEO สำหรับ Answer Engine
ตอบคำถามตรงให้ Answer Engine หยิบไปแสดงเป็นคำตอบเดียว:
- ทุกหน้าบริการมี **Answer Block**: คำถามจริงของประชาชน → คำตอบสั้น 40–60 คำ ไว้บนสุด.
- ใส่ **`FAQPage`** (คำถาม-คำตอบ) และ **`HowTo`** (ขั้นตอนบริการ) เป็น JSON-LD.
- ใช้ **`speakable`** สำหรับส่วนที่ผู้ช่วยเสียงอ่านได้.
- **Breadcrumb + heading คำถาม** ("ทำบัตรประชาชนดิจิทัลอย่างไร?") ตรงกับ query ของผู้ใช้.
- มี **หน้า FAQ รวม** + FAQ ย่อยในแต่ละบริการ (ผนวกข้อ 20).

## 9) Chat AI / AI Smart Search (TOR ผนวก 9)
สถาปัตยกรรมแนะนำ — **RAG (Retrieval-Augmented Generation)** ตอบจากเนื้อหาเว็บจริง ลด hallucination:
```
ผู้ใช้ถาม → Chat UI → Orchestrator
   → ค้น (Hybrid: keyword + vector) จากดัชนีเนื้อหา+ไฟล์ (pdf/docx/xlsx/pptx)
   → ส่ง context ให้ LLM (เช่น Claude) สรุปคำตอบ + อ้างอิงหน้า/เอกสารต้นทาง
   → แสดงคำตอบ + ลิงก์แหล่ง + ปุ่ม "ไม่พบคำตอบ → ติดต่อเจ้าหน้าที่"
```
- **Index**: ดึงเนื้อหา CMS + แตกข้อความจากไฟล์แนบ → embedding → vector store; sync อัตโนมัติเมื่อเผยแพร่.
- **Guardrail**: ตอบเฉพาะขอบเขต DGA, แสดงแหล่งอ้างอิงเสมอ, log คำถามเพื่อปรับปรุง (ระวัง PDPA — ไม่เก็บ PII).
- **Fallback**: ถ้าไม่มั่นใจ → เสนอผลค้นหา/ช่องทางติดต่อ ไม่เดา.
- ใช้ **Hybrid Search เดียวกัน** กับช่องค้นหาปกติ (ผนวก 8) เพื่อ reuse โครงสร้าง.

## 10) WCAG 2.2 AA + วิธีตรวจสอบ (เกณฑ์ 2.3 — ต้องมี Contrast, Screen Reader, Testing Tools)
| เกณฑ์ | สิ่งที่ทำ | วิธีตรวจ |
|---|---|---|
| 1.1.1 ข้อความแทนภาพ | `alt` ทุกภาพสื่อความหมาย, ไอคอนตกแต่ง `aria-hidden` | axe, ตรวจ manual |
| 1.4.3 Contrast | ข้อความ ≥4.5:1, ใหญ่ ≥3:1 | TPGi Contrast Checker |
| 1.4.11 Non-text Contrast | ขอบ input/ปุ่ม/โฟกัส ≥3:1 | Contrast Checker |
| 2.1.1 Keyboard | ทุกฟังก์ชันใช้คีย์บอร์ดได้ | ทดสอบ Tab/Enter/Esc |
| 2.4.7/2.4.11 Focus | `:focus-visible` ชัด ไม่ถูกบัง | keyboard-only |
| 2.5.8 Target Size | ปุ่ม/ลิงก์ ≥24px (เราใช้ 44px) | วัด DOM |
| 3.3.1/3.3.3 Error | ฟอร์มมี label+error+`aria-describedby` | NVDA/VoiceOver |
| 4.1.2 Name/Role/Value | ใช้ semantic HTML + ARIA ถูก | axe |
**เครื่องมือส่งมอบเป็นหลักฐาน**: axe DevTools, Lighthouse Accessibility, WAVE, NVDA (Win)/VoiceOver (mac), keyboard-only test → แนบรายงานในข้อเสนอ.

## 11) Responsive Design (เกณฑ์ 2.4 — 3 อุปกรณ์ + 5 องค์ประกอบ)
- **Mobile-first**, breakpoint: Mobile <768, Tablet ≥768, Desktop ≥1024/≥1280.
- ครอบคลุม 5 องค์ประกอบที่เกณฑ์ระบุ: **เมนู/นำทาง, ตาราง, ฟอร์ม, รูปภาพ/สื่อ, ค้นหา**.
  - เมนู → hamburger + off-canvas บนมือถือ.
  - ตาราง → scroll แนวนอน/การ์ดสรุปบนจอเล็ก.
  - ฟอร์ม → 1 คอลัมน์, input เต็มความกว้าง, ปุ่มแตะง่าย.
  - รูป/วิดีโอ → `srcset`/`<picture>`, aspect-ratio กัน CLS.
  - ค้นหา → ปุ่มค้นหาเด่นบนมือถือ ขยายเต็มจอเมื่อกด.
- ทดสอบบน Chrome/Edge/Firefox/Safari + Android Chrome/iOS Safari (TOR 4.1.1–4.1.2).

## 12) จุดที่ควรแก้ใน HTML
1. ใช้ **landmark** จริง: `<header> <nav> <main id="main"> <footer>` + **skip link**.
2. heading **ลำดับถูก** (H1 เดียว/หน้า, ไม่ข้ามระดับ).
3. ทุก `<img>` มี `alt`; ไอคอนตกแต่งใส่ `aria-hidden="true"`.
4. ฟอร์ม: `<label for>` คู่ทุก input, error ผูก `aria-describedby`, `aria-invalid`.
5. ปุ่มที่ไม่ใช่ลิงก์ใช้ `<button>` (ไม่ใช่ `<div onclick>`).
6. `<html lang="th">`, ส่วนภาษาอังกฤษกำกับ `lang="en"`.
7. ใส่ **JSON-LD Schema** ใน `<head>` ของแต่ละหน้า (ดูข้อ 16).
8. `<meta name="viewport">`, `<title>`/`<meta description>` ต่อหน้า, canonical + hreflang.

## 13) จุดที่ควรแก้ใน CSS
1. ใช้ **Design Tokens** (`assets/design-system.css`) แทนค่าสี/ขนาดกระจัดกระจาย.
2. **อย่าลบ `outline`** — ใช้ `:focus-visible` ที่ contrast สูง.
3. หน่วย **rem/em** + `clamp()` สำหรับ type ที่ยืดหยุ่น (ไม่ fix px ที่ขยายไม่ได้ — WCAG 1.4.4).
4. `prefers-reduced-motion` ลด animation.
5. รูป: `aspect-ratio` + `object-fit` กัน Layout Shift (LCP/CLS).
6. โหลดฟอนต์เท่าที่ใช้ + `font-display: swap` + (production) self-host + `preload`.
7. ตารางตอบสนอง: overflow-x หรือ pattern การ์ดบนจอเล็ก.

## 14) จุดที่ควรแก้ใน JavaScript
1. **Progressive enhancement** — เนื้อหาหลักใช้งานได้แม้ JS ไม่ทำงาน.
2. เมนู/Modal/Accordion ต้อง **เข้าถึงด้วยคีย์บอร์ด** (Esc ปิด, focus trap, `aria-expanded`).
3. **Lazy-load** รูป/วิดีโอ/แผนที่ + `loading="lazy"`; แยก bundle, defer สคริปต์ที่ไม่จำเป็น (Page Speed).
4. **Debounce** ช่องค้นหา/auto-suggest; ยกเลิก request เก่า.
5. Cookie Consent ต้อง **บล็อกสคริปต์ tracking จนกว่าจะ opt-in** (PDPA, ผนวก 29).
6. ฟอร์ม: validate ฝั่ง client + แจ้ง error แบบ accessible (`aria-live`), แต่ **validate ฝั่ง server เสมอ** (ข้อ 4.7.1) + CAPTCHA (4.7.2).
7. ประกาศการเปลี่ยนหน้า/ผลค้นหาแบบ SPA ด้วย `aria-live` ให้ screen reader รับรู้.

## 15) ตัวอย่างโค้ดที่นำไปใช้จริงได้
ดูไฟล์ `assets/design-system.css` (Tokens/ปุ่ม/ฟอร์ม/การ์ด). โครง HTML หน้าแรกที่ accessible:
```html
<!-- HTML: โครงหน้าแรก (มี skip link, landmark, ค้นหา, การ์ดบริการ) -->
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>สำนักงานพัฒนารัฐบาลดิจิทัล (สพร.) | DGA</title>
  <meta name="description" content="บริการดิจิทัลภาครัฐ มาตรฐาน และข้อมูลเปิด จาก สพร. (DGA)">
  <link rel="stylesheet" href="/assets/design-system.css">
  <!-- JSON-LD ใส่ที่นี่ (ดูข้อ 16) -->
</head>
<body>
  <a class="skip-link" href="#main">ข้ามไปยังเนื้อหาหลัก</a>
  <header>
    <nav class="container" aria-label="เมนูหลัก"><!-- โลโก้ + mega menu + ภาษา + ค้นหา --></nav>
  </header>

  <main id="main">
    <section class="container" aria-labelledby="hero-h">
      <h1 id="hero-h">บริการรัฐบาลดิจิทัล ในที่เดียว</h1>
      <!-- ค้นหากลาง: เข้าถึงทุกเนื้อหา/ไฟล์ (Hybrid Search) -->
      <form role="search" action="/search" method="get">
        <label for="q" class="visually-hidden">ค้นหาบริการหรือเอกสาร</label>
        <input class="input" id="q" name="q" type="search"
               placeholder="ค้นหาบริการ เอกสาร หรือถาม AI…" autocomplete="off">
        <button class="btn btn--primary" type="submit">ค้นหา</button>
      </form>
    </section>

    <!-- บริการยอดนิยม: เข้าบริการได้ใน 1 คลิกจากหน้าแรก (เกณฑ์ 3-Click) -->
    <section class="container" aria-labelledby="svc-h">
      <h2 id="svc-h">บริการยอดนิยม</h2>
      <ul class="grid grid--3" style="list-style:none;padding:0">
        <li><a class="card" href="/service/tang-rath">
          <h3 class="card__title">แอปทางรัฐ</h3>
          <p>รวมบริการภาครัฐในแอปเดียว</p></a></li>
        <!-- ...การ์ดอื่น ๆ... -->
      </ul>
    </section>
  </main>

  <footer><!-- sitemap, ติดต่อ, นโยบาย, Cookie settings --></footer>
</body>
</html>
```
```js
/* JS: ปุ่มสลับ mega-menu แบบเข้าถึงได้ด้วยคีย์บอร์ด (ใส่ comment ให้ทีม) */
const toggle = document.querySelector('[data-menu-toggle]');
const panel  = document.querySelector('#mega-menu');
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!open)); // แจ้งสถานะให้ screen reader
  panel.hidden = open;
});
document.addEventListener('keydown', e => {            // Esc ปิดเมนู (WCAG keyboard)
  if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
    toggle.setAttribute('aria-expanded', 'false'); panel.hidden = true; toggle.focus();
  }
});
```

## 16) ตัวอย่าง Schema Markup / JSON-LD (ผนวกข้อ 10 — GEO/AEO)
```html
<!-- 1) หน่วยงาน + ค้นหา (ใส่ในหน้าแรก) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "GovernmentOrganization",
  "name": "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)",
  "alternateName": ["สพร.", "DGA"],
  "url": "https://www.dga.or.th",
  "logo": "https://www.dga.or.th/assets/logo.png",
  "sameAs": ["https://www.facebook.com/DGAThailand","https://www.youtube.com/@DGAThailand"],
  "contactPoint": {"@type":"ContactPoint","telephone":"+66-2612-6000","contactType":"customer service","areaServed":"TH","availableLanguage":["th","en"]}
}
</script>
<!-- WebSite + SearchAction (ให้ Google/AI รู้จักช่องค้นหาในเว็บ) -->
<script type="application/ld+json">
{
  "@context":"https://schema.org","@type":"WebSite","url":"https://www.dga.or.th",
  "potentialAction":{"@type":"SearchAction","target":"https://www.dga.or.th/search?q={query}","query-input":"required name=query"}
}
</script>
<!-- 2) หน้าบริการ: GovernmentService + HowTo (AEO) -->
<script type="application/ld+json">
{
  "@context":"https://schema.org","@type":"GovernmentService",
  "name":"บัตรประจำตัวประชาชนดิจิทัล (ThaID)",
  "serviceType":"การยืนยันตัวตนดิจิทัล",
  "provider":{"@type":"GovernmentOrganization","name":"สพร. (DGA)"},
  "areaServed":{"@type":"Country","name":"ประเทศไทย"},
  "availableChannel":{"@type":"ServiceChannel","serviceUrl":"https://www.dga.or.th/service/thaid"}
}
</script>
<!-- 3) FAQ (AEO — Answer Engine หยิบไปตอบได้) -->
<script type="application/ld+json">
{
  "@context":"https://schema.org","@type":"FAQPage",
  "mainEntity":[{
    "@type":"Question","name":"สพร. (DGA) คือหน่วยงานอะไร?",
    "acceptedAnswer":{"@type":"Answer","text":"สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน) เป็นหน่วยงานกลางด้านรัฐบาลดิจิทัลของไทย ทำหน้าที่พัฒนามาตรฐาน แพลตฟอร์ม และบริการดิจิทัลภาครัฐ เช่น แอปทางรัฐ และ API Gateway"}
  }]
}
</script>
```
> เพิ่ม `BreadcrumbList` ทุกหน้า, `Article`/`NewsArticle` หน้าข่าว, `Dataset` หน้า Open Data, `speakable` ส่วนคำตอบหลัก.

## 17) ตัวอย่าง FAQ และ Answer Block
```html
<!-- Answer Block: วางบนสุดของหน้าบริการ — ตอบตรงคำถามผู้ใช้ใน 40–60 คำ (AEO) -->
<section class="card" aria-labelledby="ans-h">
  <h2 id="ans-h">ทำบัตรประชาชนดิจิทัล (ThaID) อย่างไร?</h2>
  <p><strong>คำตอบโดยสรุป:</strong> ดาวน์โหลดแอป ThaID ลงทะเบียนด้วยเลขบัตรประชาชน
  ถ่ายรูปใบหน้าเพื่อยืนยันตัวตน หรือยืนยันที่สำนักงานเขต/อำเภอ เมื่อสำเร็จจะใช้บัตรดิจิทัล
  แสดงตน และเข้าใช้บริการภาครัฐออนไลน์ได้ทันที</p>
  <a class="btn btn--primary" href="/service/thaid">เริ่มใช้บริการ</a>
</section>
<!-- FAQ accordion (เข้าถึงได้ + มี FAQPage schema คู่กัน) -->
<section aria-labelledby="faq-h">
  <h2 id="faq-h">คำถามที่พบบ่อย</h2>
  <details><summary>ThaID ใช้แทนบัตรประชาชนตัวจริงได้ไหม?</summary>
    <p>ใช้แสดงตนกับหน่วยงานที่รองรับได้ตามที่กฎหมายกำหนด…</p></details>
  <details><summary>ลืมรหัส PIN ต้องทำอย่างไร?</summary>
    <p>เลือก "ลืมรหัส" ในแอปแล้วยืนยันตัวตนใหม่…</p></details>
</section>
```

## 18) Checklist ทดสอบก่อนส่งงาน
**Accessibility (เกณฑ์ 2.3)**
- [ ] axe/WAVE = 0 critical · Lighthouse A11y ≥ 95
- [ ] ใช้คีย์บอร์ดได้ทั้งเว็บ, โฟกัสมองเห็นทุกจุด
- [ ] ทดสอบ NVDA + VoiceOver อ่านเมนู/ฟอร์ม/ตารางได้
- [ ] contrast ผ่าน AA ทุกองค์ประกอบ

**Performance (TOR 4.1.6)**
- [ ] Lighthouse Performance ≥ 90 (mobile), LCP < 2.5s, CLS < 0.1
- [ ] รูป webp + lazy-load, ฟอนต์ self-host + preload

**Responsive (2.4)**
- [ ] ผ่าน Desktop/Tablet/Mobile บน Chrome/Edge/Firefox/Safari + Android/iOS
- [ ] เมนู/ตาราง/ฟอร์ม/รูป/ค้นหา ใช้งานได้ทุกขนาด

**SEO/GEO/AEO (ผนวก 10)**
- [ ] JSON-LD ผ่าน Rich Results Test · sitemap.xml + hreflang + canonical
- [ ] ทุกหน้าบริการมี Answer Block + FAQ + HowTo

**ฟังก์ชัน/ความปลอดภัย (ข้อ 4.7, ผนวก 8–9, 29)**
- [ ] Hybrid + Full-text search ในไฟล์ pdf/docx/xlsx/pptx
- [ ] AI Smart Search ตอบพร้อมอ้างอิงแหล่ง + fallback
- [ ] Cookie Consent: default off, granular, consent log, 2 ภาษา
- [ ] MFA back-office, CAPTCHA, HTTPS, Log, Vulnerability/Pen-test, PDPA
- [ ] 3-Click ทุกบริการหลัก (มี Sitemap + User Flow ประกอบ)

## 19) สรุปข้อเสนอสำหรับสไลด์ผู้บริหาร
1. **ยกระดับ dga.or.th เป็นเว็บภาครัฐยุค AI Search** — พร้อมให้ Chat AI/Generative/Answer Engine อ้างอิงได้ (GEO/AEO + Schema).
2. **เข้าถึงทุกบริการใน ≤3 คลิก** ผ่าน IA แบบ task-based + ค้นหา Hybrid ที่ค้นในไฟล์ได้.
3. **มาตรฐานสูงสุด**: WCAG 2.2 AA เต็มรูปแบบ + Design System (Figma+Tokens) เป็นแบบอย่างภาครัฐ.
4. **ปลอดภัยและถูกกฎหมาย**: PDPA, Cookie Consent, MFA, SSL/TLS, Pen-test, DR site (RTO/RPO).
5. **ส่งมอบครบ 4 งวด ใน 365 วัน** พร้อมรับประกัน 1 ปีและ SLA — ความเสี่ยงต่ำ ทีมต่อยอดได้.
> จุดขายชนะประมูล: ทุ่มหมวด Design&UX/UI (50%) + สาธิต 2 หน้าทำงานจริง (20%) + DR เก็บ Security เต็ม (10%).
