export type Locale = "th" | "en";

// Every string on the site, both languages, one shape. Thai is the default
// locale (the buyers are Thai government and state-enterprise teams); English
// lives under /en. Keep the two objects structurally identical — `en` is the
// type source of truth so a missing Thai key is a compile error.
const en = {
  meta: {
    title: "WebX — Multi-tenant CMS for Thai government websites",
    description:
      "One platform runs every site your organization manages: bilingual by default, with PDPA consent, WCAG 2.1 AA accessibility, review-before-publish and a full audit trail built in.",
    pricingTitle: "Pricing — WebX",
    pricingDescription: "Start free. Pro at ฿1,990/month. Enterprise with SSO, SLA and DR for government procurement.",
  },
  nav: {
    features: "Features",
    gov: "For government",
    engines: "Engines",
    pricing: "Pricing",
    signin: "Sign in",
    start: "Start free",
    lang: "ไทย",
    langAria: "Switch to Thai",
    menu: "Menu",
    close: "Close menu",
  },
  hero: {
    eyebrow: "Multi-tenant CMS for the public sector",
    h1: "Government websites, shipped compliant.",
    sub: "One platform runs every site your organization manages — bilingual by default, with PDPA consent, WCAG 2.1 AA accessibility, review-before-publish and a full audit trail designed in, not bolted on.",
    cta1: "Start free",
    cta2: "See how it works",
    note: "Free plan · no card · signed in immediately",
    shotAlt: "WebX Studio dashboard showing live content counts, system health and the review checklist",
    shotCap: "WebX Studio — the workspace dashboard",
  },
  stats: [
    { n: "2", l: "engines — Strapi or WordPress" },
    { n: "TH·EN", l: "bilingual content and routes" },
    { n: "AA", l: "WCAG 2.1 accessibility target" },
    { n: "90d", l: "minimum audit-log retention" },
  ],
  features: {
    eyebrow: "Everything an agency site needs",
    h2: "Built as one system, not a plugin pile.",
    sub: "Each capability below ships in WebX Studio today and was verified against real procurement requirements.",
    items: [
      { icon: "layout", t: "Visual Builder", d: "Compose pages from blocks with a live preview of the real site, device toggles, templates, and an approval gate before anything goes public." },
      { icon: "grid", t: "Multi-tenant workspaces", d: "Run many sites from one login. Every read and write is scoped to its workspace at the API layer; cross-tenant edits are blocked and logged." },
      { icon: "globe", t: "Thai and English, by default", d: "Parallel TH/EN routes, per-field translations that fall back to Thai instead of going blank, and one-click AI translation for editors." },
      { icon: "check", t: "Review, release, publish", d: "Draft → in review → approved → published. Group entries into scheduled releases, and push urgent notices live in seconds without a rebuild." },
      { icon: "spark", t: "AI where it helps", d: "Content audit for SEO, accessibility and PDPA gaps. Search that answers from your own published content, with sources. Agents can draft — only people publish." },
      { icon: "cookie", t: "PDPA and consent", d: "Granular cookie consent recorded as evidence, citizen PII encrypted at rest, and a forms inbox for complaints and applications with tracking references." },
      { icon: "shield", t: "Security and access", d: "SSO/OIDC, per-user MFA, custom roles with field-level access, and an audit log of who changed what — retained at least 90 days." },
      { icon: "chart", t: "Analytics and reporting", d: "First-party, privacy-first counts with no personal records, a monthly report as .xlsx, and optional GA4 metrics pulled into the dashboard." },
    ],
  },
  gov: {
    eyebrow: "For government and state enterprises",
    h2: "Written against real procurement TORs.",
    sub: "WebX was built while delivering national-agency websites under a 40-item terms of reference. The list below isn't a feature wishlist — it's what the platform was audited against.",
    items: [
      "Bilingual Thai/English public site and admin",
      "WCAG 2.1 AA accessibility — Lighthouse 100/100 on reference builds",
      "PDPA: consent register, PII encryption at rest, privacy-first analytics",
      "Breaking-news banner live within 30 seconds, no site rebuild",
      "E-forms with reference numbers: inquiries, complaints, job applications",
      "Event calendar with .ics export, RSS feeds, sitemap, robots and llms.txt",
      "Full-text search that reads inside PDF, DOCX and XLSX files",
      "Unlimited-depth menus and a centralized, tagged media library",
      "Daily backups with an automated restore drill",
      "Audit and access logs retained for 90 days or more",
      "Hardened WordPress engine: XML-RPC off, version hiding, SMTP mail",
      "Self-hosted fonts and WebP images for Core Web Vitals",
    ],
    cta: "Request the compliance dossier",
  },
  engines: {
    eyebrow: "Your engine, your choice",
    h2: "Strapi or WordPress underneath. The same Studio on top.",
    strapi: { t: "Strapi — headless, API-first", d: "Typed content models, drafts and releases, REST APIs, and a static export to any CDN. The natural fit for new builds and multi-site programs." },
    wp: { t: "WordPress — familiar for editors", d: "Keep the editor your team already knows. WebX adds tenant scoping, security hardening, PDPA forms and the same Studio workflows through must-use plugins — no theme lock-in." },
    note: "Choose per workspace. Editors sign in to one Studio either way.",
  },
  agents: {
    eyebrow: "Agent-ready",
    h2: "Let AI draft. Keep people in charge of publish.",
    p: "WebX ships an MCP server and a CLI so Claude, Cursor or your own scripts can read content, create drafts and submit them for review. There is deliberately no publish or delete tool — a person approves from the Reviews board before anything reaches the public site.",
    toolsLabel: "MCP tools an agent can call",
    tools: ["list_content_types", "search_content", "get_entry", "create_entry", "update_entry", "submit_for_review", "list_reviews"],
    denied: "publish · delete — not available to agents",
  },
  how: {
    eyebrow: "How it works",
    h2: "From zero to a live site in three steps.",
    steps: [
      { t: "Create a workspace", d: "Sign up free. Your organization gets its own isolated workspace and URL key immediately — no card, no sales call." },
      { t: "Brand and build", d: "Set your design tokens once and the whole public site follows. Compose pages in the Visual Builder or start from templates." },
      { t: "Review and publish", d: "Route changes through review, publish on a schedule, and let WebX export the site as static files to your CDN." },
    ],
  },
  pricingTeaser: {
    eyebrow: "Pricing",
    h2: "Start free. Upgrade when the site does.",
    compare: "Compare plans",
  },
  plans: {
    free: { name: "Free", price: "฿0", per: "forever", items: "50 content items", seats: "1 editor seat", cta: "Start free", features: ["Full CMS + media library", "Visual Builder", "PDPA cookie consent", "Community support"] },
    pro: { name: "Pro", price: "฿1,990", per: "per month", items: "1,000 content items", seats: "5 editor seats", cta: "Start with Pro", features: ["Everything in Free", "AI actions and content audit", "RAG search + MCP server", "Reviews and releases", "Priority support"] },
    enterprise: { name: "Enterprise", price: "Contact us", per: "annual agreement", items: "Unlimited content items", seats: "Unlimited seats", cta: "Talk to us", features: ["Everything in Pro", "SSO / SAML", "Uptime SLA", "DR site with agreed RTO/RPO", "Dedicated audit and onboarding"] },
    popular: "Most popular",
  },
  pricing: {
    h1: "Plans",
    sub: "Prices in Thai baht. Every plan includes WebX Studio, bilingual content and PDPA consent.",
    faqH2: "Common questions",
    faq: [
      { q: "Can we use WordPress instead of Strapi?", a: "Yes. The engine is chosen per workspace. Editors use the same WebX Studio either way, and WordPress workspaces get the same tenant scoping, hardening and PDPA forms through must-use plugins." },
      { q: "Where does our data live?", a: "WebX deploys on your own infrastructure or ours. Enterprise deployments include a disaster-recovery site with an agreed recovery time and recovery point objective." },
      { q: "What counts as a content item?", a: "Any entry you publish — a page, article, service, document, event or similar. Media files are not counted." },
      { q: "Can this be procured under government e-bidding?", a: "Yes. Enterprise engagements are delivered with TOR-aligned milestones and a compliance dossier that maps each requirement to how the platform meets it." },
    ],
  },
  cta: {
    h2: "Launch your organization's site on WebX.",
    p: "Free to start. Built for the standards you're evaluated on.",
    cta1: "Start free",
    cta2: "Talk to us",
  },
  footer: {
    tagline: "Multi-tenant CMS for Thai government and public-sector websites.",
    product: "Product",
    company: "Company",
    contact: "Contact",
    signin: "Sign in",
    rights: "WebX. All rights reserved.",
  },
};

const th: typeof en = {
  meta: {
    title: "WebX — CMS แบบหลายหน่วยงานสำหรับเว็บไซต์ภาครัฐไทย",
    description:
      "แพลตฟอร์มเดียวดูแลได้ทุกเว็บไซต์ในองค์กร รองรับสองภาษาในตัว พร้อม PDPA, WCAG 2.1 AA, ระบบตรวจทานก่อนเผยแพร่ และบันทึกตรวจสอบย้อนหลังครบถ้วน",
    pricingTitle: "ราคา — WebX",
    pricingDescription: "เริ่มต้นฟรี แพ็กเกจ Pro ฿1,990/เดือน และ Enterprise พร้อม SSO, SLA และ DR สำหรับการจัดซื้อจัดจ้างภาครัฐ",
  },
  nav: {
    features: "ความสามารถ",
    gov: "สำหรับภาครัฐ",
    engines: "ระบบเบื้องหลัง",
    pricing: "ราคา",
    signin: "เข้าสู่ระบบ",
    start: "เริ่มใช้ฟรี",
    lang: "EN",
    langAria: "Switch to English",
    menu: "เมนู",
    close: "ปิดเมนู",
  },
  hero: {
    eyebrow: "CMS แบบหลายหน่วยงานสำหรับภาครัฐ",
    h1: "เว็บไซต์หน่วยงานรัฐ ที่พร้อมตรวจรับตั้งแต่วันแรก",
    sub: "แพลตฟอร์มเดียวดูแลได้ทุกเว็บไซต์ในองค์กร — รองรับไทย/อังกฤษในตัว พร้อมระบบความยินยอมตาม PDPA, การเข้าถึงระดับ WCAG 2.1 AA, การตรวจทานก่อนเผยแพร่ และบันทึกตรวจสอบย้อนหลัง ที่ออกแบบมาในระบบ ไม่ใช่ติดตั้งเพิ่มภายหลัง",
    cta1: "เริ่มใช้ฟรี",
    cta2: "ดูวิธีการทำงาน",
    note: "แพ็กเกจฟรี · ไม่ต้องใช้บัตร · เข้าใช้งานได้ทันที",
    shotAlt: "หน้าแดชบอร์ด WebX Studio แสดงจำนวนเนื้อหา สถานะระบบ และรายการตรวจสอบ",
    shotCap: "WebX Studio — แดชบอร์ดของ workspace",
  },
  stats: [
    { n: "2", l: "ระบบเบื้องหลังให้เลือก — Strapi หรือ WordPress" },
    { n: "ไทย·EN", l: "เนื้อหาและเส้นทางสองภาษา" },
    { n: "AA", l: "เป้าหมายการเข้าถึง WCAG 2.1" },
    { n: "90 วัน", l: "เก็บบันทึกตรวจสอบขั้นต่ำ" },
  ],
  features: {
    eyebrow: "ทุกอย่างที่เว็บไซต์หน่วยงานต้องมี",
    h2: "ออกแบบเป็นระบบเดียว ไม่ใช่กองปลั๊กอิน",
    sub: "ทุกความสามารถด้านล่างใช้งานได้จริงใน WebX Studio วันนี้ และผ่านการตรวจสอบกับข้อกำหนดการจัดซื้อจัดจ้างจริงแล้ว",
    items: [
      { icon: "layout", t: "Visual Builder", d: "ประกอบหน้าเว็บจากบล็อก พร้อมพรีวิวสดของเว็บไซต์จริง สลับมุมมองอุปกรณ์ ใช้เทมเพลต และมีด่านอนุมัติก่อนเผยแพร่สู่สาธารณะ" },
      { icon: "grid", t: "หลายหน่วยงานในระบบเดียว", d: "ดูแลหลายเว็บไซต์จากการเข้าระบบครั้งเดียว ทุกการอ่าน/เขียนถูกจำกัดขอบเขตตาม workspace ที่ชั้น API การแก้ไขข้ามหน่วยงานถูกบล็อกและบันทึกไว้" },
      { icon: "globe", t: "ไทยและอังกฤษ ในตัว", d: "เส้นทางคู่ขนาน TH/EN คำแปลรายฟิลด์ที่ถอยกลับไปใช้ภาษาไทยแทนการเว้นว่าง และแปลด้วย AI ได้ในคลิกเดียว" },
      { icon: "check", t: "ตรวจทาน ปล่อยเป็นชุด เผยแพร่", d: "ร่าง → รอตรวจ → อนุมัติ → เผยแพร่ จัดกลุ่มเนื้อหาเป็นชุดเผยแพร่ตามกำหนดเวลา และดันประกาศด่วนขึ้นเว็บได้ในไม่กี่วินาทีโดยไม่ต้อง rebuild" },
      { icon: "spark", t: "AI ในจุดที่ช่วยได้จริง", d: "ตรวจเนื้อหาหาช่องโหว่ด้าน SEO การเข้าถึง และ PDPA ค้นหาที่ตอบจากเนื้อหาที่เผยแพร่ของคุณเองพร้อมแหล่งอ้างอิง AI ร่างได้ — แต่คนเท่านั้นที่เผยแพร่" },
      { icon: "cookie", t: "PDPA และความยินยอม", d: "ความยินยอมคุกกี้แบบแยกหมวด บันทึกเป็นหลักฐาน ข้อมูลส่วนบุคคลของประชาชนเข้ารหัสในที่จัดเก็บ และกล่องรับแบบฟอร์มร้องเรียน/สมัครงานพร้อมเลขอ้างอิง" },
      { icon: "shield", t: "ความปลอดภัยและสิทธิ์", d: "SSO/OIDC, MFA รายผู้ใช้, บทบาทกำหนดเองพร้อมสิทธิ์ระดับฟิลด์ และบันทึกว่าใครแก้อะไรเมื่อไร — เก็บไว้อย่างน้อย 90 วัน" },
      { icon: "chart", t: "สถิติและรายงาน", d: "นับสถิติแบบ first-party ไม่เก็บข้อมูลส่วนบุคคล รายงานรายเดือนเป็น .xlsx และดึงตัวเลขจาก GA4 มาแสดงในแดชบอร์ดได้" },
    ],
  },
  gov: {
    eyebrow: "สำหรับหน่วยงานรัฐและรัฐวิสาหกิจ",
    h2: "ออกแบบตาม TOR การจัดซื้อจัดจ้างจริง",
    sub: "WebX ถูกพัฒนาขึ้นระหว่างการส่งมอบเว็บไซต์หน่วยงานระดับชาติภายใต้ขอบเขตงาน 40 ข้อ รายการด้านล่างไม่ใช่ฟีเจอร์ในฝัน — แต่คือสิ่งที่แพลตฟอร์มผ่านการตรวจสอบมาแล้ว",
    items: [
      "เว็บไซต์และระบบหลังบ้านสองภาษา ไทย/อังกฤษ",
      "การเข้าถึงระดับ WCAG 2.1 AA — Lighthouse 100/100 บนเว็บไซต์อ้างอิง",
      "PDPA: ทะเบียนความยินยอม เข้ารหัสข้อมูลส่วนบุคคล สถิติแบบไม่ระบุตัวตน",
      "แถบข่าวด่วนขึ้นเว็บภายใน 30 วินาที โดยไม่ต้อง rebuild",
      "แบบฟอร์มออนไลน์พร้อมเลขอ้างอิง: สอบถาม ร้องเรียน สมัครงาน",
      "ปฏิทินกิจกรรมส่งออก .ics, ฟีด RSS, sitemap, robots และ llms.txt",
      "ค้นหาแบบเต็มข้อความ อ่านเข้าไปในไฟล์ PDF, DOCX และ XLSX",
      "เมนูลึกไม่จำกัดชั้น และคลังสื่อกลางพร้อมแท็ก",
      "สำรองข้อมูลรายวัน พร้อมการซ้อมกู้คืนอัตโนมัติ",
      "เก็บบันทึกตรวจสอบและบันทึกการเข้าถึงไม่น้อยกว่า 90 วัน",
      "WordPress ที่เสริมความปลอดภัย: ปิด XML-RPC ซ่อนเวอร์ชัน ส่งเมลผ่าน SMTP",
      "ฟอนต์โฮสต์เอง และรูป WebP เพื่อ Core Web Vitals",
    ],
    cta: "ขอเอกสารการปฏิบัติตามข้อกำหนด",
  },
  engines: {
    eyebrow: "เลือกระบบเบื้องหลังได้เอง",
    h2: "ข้างล่างเป็น Strapi หรือ WordPress ข้างบนคือ Studio เดียวกัน",
    strapi: { t: "Strapi — headless, API-first", d: "โมเดลเนื้อหาแบบมีชนิดข้อมูล ร่างและชุดเผยแพร่ REST API และส่งออกเป็นไฟล์สถิตขึ้น CDN ใดก็ได้ เหมาะกับงานสร้างใหม่และโครงการหลายเว็บไซต์" },
    wp: { t: "WordPress — คุ้นมือสำหรับผู้ดูแลเนื้อหา", d: "ใช้ตัวแก้ไขที่ทีมคุ้นเคยอยู่แล้ว WebX เพิ่มการแยกขอบเขตหน่วยงาน การเสริมความปลอดภัย แบบฟอร์ม PDPA และเวิร์กโฟลว์ของ Studio ผ่าน must-use plugins — ไม่ผูกกับธีม" },
    note: "เลือกได้ต่อ workspace ผู้ดูแลเนื้อหาเข้าใช้ Studio เดียวกันทั้งสองแบบ",
  },
  agents: {
    eyebrow: "พร้อมสำหรับ AI agent",
    h2: "ให้ AI ร่าง แต่ให้คนเป็นผู้เผยแพร่",
    p: "WebX มาพร้อม MCP server และ CLI ให้ Claude, Cursor หรือสคริปต์ของคุณอ่านเนื้อหา สร้างฉบับร่าง และส่งเข้าคิวตรวจทานได้ — แต่จงใจไม่มีเครื่องมือเผยแพร่หรือลบ คนต้องอนุมัติจากบอร์ด Reviews ก่อนที่อะไรจะไปถึงเว็บไซต์สาธารณะ",
    toolsLabel: "เครื่องมือ MCP ที่ agent เรียกใช้ได้",
    tools: ["list_content_types", "search_content", "get_entry", "create_entry", "update_entry", "submit_for_review", "list_reviews"],
    denied: "publish · delete — ไม่เปิดให้ agent ใช้",
  },
  how: {
    eyebrow: "วิธีการทำงาน",
    h2: "จากศูนย์ถึงเว็บไซต์ออนไลน์ ใน 3 ขั้นตอน",
    steps: [
      { t: "สร้าง workspace", d: "สมัครฟรี องค์กรของคุณได้ workspace แยกเป็นของตัวเองพร้อม URL key ทันที — ไม่ต้องใช้บัตร ไม่ต้องนัดฝ่ายขาย" },
      { t: "กำหนดแบรนด์และสร้างหน้า", d: "ตั้งค่า design token ครั้งเดียว ทั้งเว็บไซต์เปลี่ยนตาม ประกอบหน้าใน Visual Builder หรือเริ่มจากเทมเพลต" },
      { t: "ตรวจทานและเผยแพร่", d: "ส่งการเปลี่ยนแปลงผ่านการตรวจทาน กำหนดเวลาเผยแพร่ แล้วให้ WebX ส่งออกเว็บไซต์เป็นไฟล์สถิตขึ้น CDN ของคุณ" },
    ],
  },
  pricingTeaser: {
    eyebrow: "ราคา",
    h2: "เริ่มฟรี อัปเกรดเมื่อเว็บไซต์เติบโต",
    compare: "เปรียบเทียบแพ็กเกจ",
  },
  plans: {
    free: { name: "Free", price: "฿0", per: "ตลอดไป", items: "เนื้อหา 50 รายการ", seats: "ผู้ดูแล 1 ที่นั่ง", cta: "เริ่มใช้ฟรี", features: ["CMS + คลังสื่อครบ", "Visual Builder", "คุกกี้ความยินยอม PDPA", "ซัพพอร์ตชุมชน"] },
    pro: { name: "Pro", price: "฿1,990", per: "ต่อเดือน", items: "เนื้อหา 1,000 รายการ", seats: "ผู้ดูแล 5 ที่นั่ง", cta: "เริ่มด้วย Pro", features: ["ทุกอย่างใน Free", "AI และการตรวจเนื้อหา", "ค้นหา RAG + MCP server", "Reviews และ releases", "ซัพพอร์ตด่วน"] },
    enterprise: { name: "Enterprise", price: "ติดต่อเรา", per: "สัญญารายปี", items: "เนื้อหาไม่จำกัด", seats: "ที่นั่งไม่จำกัด", cta: "คุยกับเรา", features: ["ทุกอย่างใน Pro", "SSO / SAML", "SLA ความพร้อมใช้งาน", "DR site พร้อม RTO/RPO ตามตกลง", "ตรวจสอบและ onboarding เฉพาะ"] },
    popular: "ยอดนิยม",
  },
  pricing: {
    h1: "แพ็กเกจ",
    sub: "ราคาเป็นเงินบาท ทุกแพ็กเกจรวม WebX Studio เนื้อหาสองภาษา และความยินยอม PDPA",
    faqH2: "คำถามที่พบบ่อย",
    faq: [
      { q: "ใช้ WordPress แทน Strapi ได้ไหม", a: "ได้ เลือกระบบเบื้องหลังได้ต่อ workspace ผู้ดูแลเนื้อหาใช้ WebX Studio เดียวกันทั้งสองแบบ และ workspace แบบ WordPress ได้การแยกขอบเขตหน่วยงาน การเสริมความปลอดภัย และแบบฟอร์ม PDPA เหมือนกันผ่าน must-use plugins" },
      { q: "ข้อมูลของเราเก็บอยู่ที่ไหน", a: "WebX ติดตั้งได้ทั้งบนโครงสร้างพื้นฐานของคุณเองหรือของเรา แพ็กเกจ Enterprise รวม DR site พร้อมเป้าหมายเวลากู้คืน (RTO) และจุดกู้คืน (RPO) ตามที่ตกลง" },
      { q: "อะไรนับเป็นเนื้อหาหนึ่งรายการ", a: "ทุกรายการที่คุณเผยแพร่ — หน้าเว็บ บทความ บริการ เอกสาร กิจกรรม หรือประเภทคล้ายกัน ไฟล์สื่อไม่ถูกนับ" },
      { q: "จัดซื้อผ่าน e-bidding ภาครัฐได้ไหม", a: "ได้ โครงการระดับ Enterprise ส่งมอบตามงวดงานที่สอดคล้องกับ TOR พร้อมเอกสารการปฏิบัติตามข้อกำหนดที่แจงว่าแพลตฟอร์มตอบแต่ละข้ออย่างไร" },
    ],
  },
  cta: {
    h2: "เปิดตัวเว็บไซต์หน่วยงานของคุณบน WebX",
    p: "เริ่มต้นฟรี สร้างมาเพื่อมาตรฐานที่คุณถูกประเมิน",
    cta1: "เริ่มใช้ฟรี",
    cta2: "คุยกับเรา",
  },
  footer: {
    tagline: "CMS แบบหลายหน่วยงาน สำหรับเว็บไซต์ภาครัฐและหน่วยงานสาธารณะของไทย",
    product: "ผลิตภัณฑ์",
    company: "บริษัท",
    contact: "ติดต่อ",
    signin: "เข้าสู่ระบบ",
    rights: "WebX สงวนลิขสิทธิ์",
  },
};

export const DICT: Record<Locale, typeof en> = { en, th };
export const t = (locale: Locale) => DICT[locale];

// Path helpers — Thai is the root, English lives under /en.
export const localePath = (locale: Locale, path: string) => (locale === "en" ? `/en${path === "/" ? "" : path}` : path) || "/";
export const otherLocale = (locale: Locale): Locale => (locale === "en" ? "th" : "en");
