export type Locale = "th" | "en";

// Every string on the site, both languages, one shape. Thai is the default
// locale; English lives under /en. Keep the two objects structurally
// identical — `en` is the type source of truth so a missing Thai key is a
// compile error.
//
// Positioning: lead with what WebX IS (a multi-tenant CMS platform) and its
// strong points — one Studio for many sites, your choice of engine, the
// Visual Builder, review-before-publish, AI that drafts but never publishes,
// compliance-grade defaults. Government/TOR is a proof point, not the pitch.
const en = {
  meta: {
    title: "WebX — One Studio for every site you run",
    description:
      "WebX is a multi-tenant CMS: many sites, one login, strict isolation. Strapi or WordPress underneath, a Visual Builder, review-before-publish, AI that drafts but never publishes, and PDPA/WCAG compliance by default.",
    pricingTitle: "Pricing — WebX",
    pricingDescription: "Start free. Pro at ฿1,990/month. Enterprise with SSO, SLA and DR.",
  },
  nav: {
    features: "Features",
    engines: "Engines",
    compliance: "Compliance",
    pricing: "Pricing",
    signin: "Sign in",
    start: "Start free",
    lang: "ไทย",
    langAria: "Switch to Thai",
    menu: "Menu",
    close: "Close menu",
  },
  hero: {
    eyebrow: "Multi-tenant CMS platform",
    h1: "One Studio for every site you run.",
    sub: "WebX runs many sites from one login with strict isolation between them. Choose Strapi or WordPress underneath, compose pages visually, route every change through review, and let AI draft without ever letting it publish — with PDPA, WCAG 2.1 AA and audit trails on by default.",
    cta1: "Start free",
    cta2: "See how it works",
    note: "Free plan · no card · signed in immediately",
    shotAlt: "WebX Studio dashboard showing live content counts, system health and the onboarding checklist",
    shotCap: "WebX Studio — the workspace dashboard",
  },
  stats: [
    { n: "2", l: "engines to choose from — Strapi or WordPress" },
    { n: "1", l: "Studio for every workspace and site" },
    { n: "30s", l: "for an urgent notice to go live — no rebuild" },
    { n: "0", l: "publish or delete tools exposed to AI agents" },
  ],
  features: {
    eyebrow: "What you get",
    h2: "Built as one platform, not a plugin pile.",
    sub: "Every capability below ships in WebX Studio today and was verified on real multi-site deployments.",
    items: [
      { icon: "grid", t: "Many sites, one system", d: "Run every site from one login. Every read and write is scoped to its workspace at the API layer; cross-tenant edits are blocked and logged." },
      { icon: "layout", t: "Visual Builder", d: "Compose pages from blocks with a live preview of the real site, device toggles, templates, A/B tests and scheduling — with an approval gate before anything goes public." },
      { icon: "check", t: "Review, release, publish", d: "Draft → in review → approved → published. Group entries into scheduled releases, and push urgent notices live in seconds without a rebuild." },
      { icon: "spark", t: "AI that drafts, never publishes", d: "One-click TH↔EN translation, a content audit for SEO, accessibility and PDPA gaps, search that answers from your own content with sources — and an MCP server and CLI that let agents draft and submit for review, with no publish tool at all." },
      { icon: "globe", t: "Thai and English, by default", d: "Parallel TH/EN routes, per-field translations that fall back to Thai instead of going blank, and translation built into the editor." },
      { icon: "cookie", t: "Compliance-grade by default", d: "PDPA cookie consent recorded as evidence, PII encrypted at rest, WCAG 2.1 AA accessibility, and an audit log of who changed what — kept at least 90 days." },
      { icon: "shield", t: "Security and access", d: "SSO/OIDC, per-user MFA, custom roles with field-level access, and least-privilege API tokens for scripts and agents." },
      { icon: "chart", t: "Analytics and reporting", d: "First-party, privacy-first counts with no personal records, a monthly report as .xlsx, and optional GA4 metrics pulled into the dashboard." },
    ],
  },
  engines: {
    eyebrow: "Your engine, your choice",
    h2: "Strapi or WordPress underneath. The same Studio on top.",
    strapi: { t: "Strapi — headless, API-first", d: "Typed content models, drafts and releases, REST APIs, and a static export to any CDN. The natural fit for new builds and multi-site programs." },
    wp: { t: "WordPress — familiar for editors", d: "Keep the editor your team already knows. WebX adds tenant scoping, security hardening, PDPA forms and the same Studio workflows through must-use plugins — no theme lock-in." },
    note: "Choose per workspace. Editors sign in to one Studio either way.",
  },
  agents: {
    eyebrow: "Built-in AI agent",
    h2: "An agent that works inside Studio — never outside your rules.",
    p: "WebX Studio has its own AI agent: a chat panel on every screen, and a full workspace for longer jobs. A workspace admin sets exactly how far it can go. It plans its own work into a checklist you can watch, asks before anything it's unsure about, and checks its own results before calling a job done.",
    levelsLabel: "Autonomy an admin grants, one level at a time",
    levels: ["Off", "Read only", "Suggest", "Draft", "Draft + submit"],
    caps: [
      { icon: "check", t: "Plans, then works the plan", d: "Breaks a request into a visible checklist, ticks items off as it goes, and verifies its own results before calling a job done." },
      { icon: "bolt", t: "Runs in the background", d: "Bulk work — draft every service page, translate a whole section, audit for compliance gaps — keeps going after you close the tab, and resumes if it's interrupted." },
      { icon: "clock", t: "Or on a schedule", d: "A recurring job, like a weekly content audit, that starts itself — no one has to remember to run it." },
    ],
    mcpH3: "Prefer to automate it yourself?",
    mcpP: "The same rules apply over an MCP server and a CLI, for Claude, Cursor or your own scripts.",
    toolsLabel: "MCP tools an agent can call",
    tools: ["list_content_types", "search_content", "get_entry", "create_entry", "update_entry", "submit_for_review", "list_reviews"],
    denied: "publish · delete — not available to any agent",
  },
  compliance: {
    eyebrow: "Proven under audit",
    h2: "Compliance isn't a project. It's the default.",
    sub: "WebX was hardened while delivering multi-site national-agency programs under a 40-item terms of reference — the list below is what it was audited against. Ministry, state enterprise, university or regulated company: the audit is already answered.",
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
    h2: "Bring every site you run onto WebX.",
    p: "Free to start. Compliance-grade from day one.",
    cta1: "Start free",
    cta2: "Talk to us",
  },
  footer: {
    tagline: "The multi-tenant CMS platform — one Studio, your engine, compliance-grade by default.",
    product: "Product",
    company: "Company",
    contact: "Contact",
    signin: "Sign in",
    rights: "WebX. All rights reserved.",
  },
};

const th: typeof en = {
  meta: {
    title: "WebX — Studio เดียว ดูแลได้ทุกเว็บไซต์ที่คุณมี",
    description:
      "WebX คือ CMS แบบ multi-tenant — หลายเว็บไซต์ ล็อกอินเดียว แยกข้อมูลกันเด็ดขาด เลือก Strapi หรือ WordPress เป็นระบบเบื้องหลัง มี Visual Builder ตรวจทานก่อนเผยแพร่ AI ช่วยร่างแต่เผยแพร่ไม่ได้ และมาตรฐาน PDPA/WCAG เป็นค่าเริ่มต้น",
    pricingTitle: "ราคา — WebX",
    pricingDescription: "เริ่มต้นฟรี แพ็กเกจ Pro ฿1,990/เดือน และ Enterprise พร้อม SSO, SLA และ DR",
  },
  nav: {
    features: "ความสามารถ",
    engines: "ระบบเบื้องหลัง",
    compliance: "มาตรฐาน",
    pricing: "ราคา",
    signin: "เข้าสู่ระบบ",
    start: "เริ่มใช้ฟรี",
    lang: "EN",
    langAria: "Switch to English",
    menu: "เมนู",
    close: "ปิดเมนู",
  },
  hero: {
    eyebrow: "แพลตฟอร์ม CMS แบบหลายเว็บไซต์",
    h1: "Studio เดียว ดูแลได้ทุกเว็บไซต์ที่คุณมี",
    sub: "WebX ดูแลหลายเว็บไซต์จากการล็อกอินครั้งเดียว โดยแยกข้อมูลแต่ละเว็บไซต์ออกจากกันเด็ดขาด เลือก Strapi หรือ WordPress เป็นระบบเบื้องหลัง ประกอบหน้าเว็บด้วยเครื่องมือ visual ส่งทุกการเปลี่ยนแปลงผ่านการตรวจทาน และให้ AI ช่วยร่างโดยไม่มีสิทธิ์เผยแพร่ — พร้อม PDPA, WCAG 2.1 AA และบันทึกตรวจสอบเปิดใช้เป็นค่าเริ่มต้น",
    cta1: "เริ่มใช้ฟรี",
    cta2: "ดูวิธีการทำงาน",
    note: "แพ็กเกจฟรี · ไม่ต้องใช้บัตร · เข้าใช้งานได้ทันที",
    shotAlt: "หน้าแดชบอร์ด WebX Studio แสดงจำนวนเนื้อหา สถานะระบบ และรายการเริ่มต้นใช้งาน",
    shotCap: "WebX Studio — แดชบอร์ดของ workspace",
  },
  stats: [
    { n: "2", l: "ระบบเบื้องหลังให้เลือก — Strapi หรือ WordPress" },
    { n: "1", l: "Studio เดียวสำหรับทุก workspace และทุกเว็บไซต์" },
    { n: "30 วิ", l: "ประกาศด่วนขึ้นเว็บ — โดยไม่ต้อง rebuild" },
    { n: "0", l: "เครื่องมือเผยแพร่หรือลบที่เปิดให้ AI agent ใช้" },
  ],
  features: {
    eyebrow: "สิ่งที่คุณได้",
    h2: "ออกแบบเป็นแพลตฟอร์มเดียว ไม่ใช่กองปลั๊กอิน",
    sub: "ทุกความสามารถด้านล่างใช้งานได้จริงใน WebX Studio วันนี้ และผ่านการพิสูจน์บนระบบหลายเว็บไซต์ที่ใช้งานจริงแล้ว",
    items: [
      { icon: "grid", t: "หลายเว็บไซต์ ระบบเดียว", d: "ดูแลทุกเว็บไซต์จากการล็อกอินครั้งเดียว ทุกการอ่าน/เขียนถูกจำกัดขอบเขตตาม workspace ที่ชั้น API การแก้ไขข้ามหน่วยงานถูกบล็อกและบันทึกไว้" },
      { icon: "layout", t: "Visual Builder", d: "ประกอบหน้าเว็บจากบล็อก พร้อมพรีวิวสดของเว็บไซต์จริง สลับมุมมองอุปกรณ์ เทมเพลต A/B test และตั้งเวลา — โดยมีด่านอนุมัติก่อนเผยแพร่สู่สาธารณะ" },
      { icon: "check", t: "ตรวจทาน ปล่อยเป็นชุด เผยแพร่", d: "ร่าง → รอตรวจ → อนุมัติ → เผยแพร่ จัดกลุ่มเนื้อหาเป็นชุดเผยแพร่ตามกำหนดเวลา และดันประกาศด่วนขึ้นเว็บได้ในไม่กี่วินาทีโดยไม่ต้อง rebuild" },
      { icon: "spark", t: "AI ที่ร่างได้ แต่เผยแพร่ไม่ได้", d: "แปล TH↔EN ในคลิกเดียว ตรวจเนื้อหาหาช่องโหว่ SEO การเข้าถึง และ PDPA ค้นหาที่ตอบจากเนื้อหาของคุณเองพร้อมแหล่งอ้างอิง — และ MCP server กับ CLI ให้ agent ร่างและส่งตรวจได้ โดยไม่มีเครื่องมือเผยแพร่เลย" },
      { icon: "globe", t: "ไทยและอังกฤษ ในตัว", d: "เส้นทางคู่ขนาน TH/EN คำแปลรายฟิลด์ที่ถอยกลับไปใช้ภาษาไทยแทนการเว้นว่าง และเครื่องมือแปลอยู่ในตัวแก้ไขเลย" },
      { icon: "cookie", t: "ได้มาตรฐานตั้งแต่ค่าเริ่มต้น", d: "ความยินยอมคุกกี้ PDPA บันทึกเป็นหลักฐาน ข้อมูลส่วนบุคคลเข้ารหัสในที่จัดเก็บ การเข้าถึงระดับ WCAG 2.1 AA และบันทึกว่าใครแก้อะไร — เก็บไว้อย่างน้อย 90 วัน" },
      { icon: "shield", t: "ความปลอดภัยและสิทธิ์", d: "SSO/OIDC, MFA รายผู้ใช้, บทบาทกำหนดเองพร้อมสิทธิ์ระดับฟิลด์ และ API token แบบสิทธิ์น้อยที่สุดสำหรับสคริปต์และ agent" },
      { icon: "chart", t: "สถิติและรายงาน", d: "นับสถิติแบบ first-party ไม่เก็บข้อมูลส่วนบุคคล รายงานรายเดือนเป็น .xlsx และดึงตัวเลขจาก GA4 มาแสดงในแดชบอร์ดได้" },
    ],
  },
  engines: {
    eyebrow: "เลือกระบบเบื้องหลังได้เอง",
    h2: "ข้างล่างเป็น Strapi หรือ WordPress ข้างบนคือ Studio เดียวกัน",
    strapi: { t: "Strapi — headless, API-first", d: "โมเดลเนื้อหาแบบมีชนิดข้อมูล ร่างและชุดเผยแพร่ REST API และส่งออกเป็นไฟล์สถิตขึ้น CDN ใดก็ได้ เหมาะกับงานสร้างใหม่และโครงการหลายเว็บไซต์" },
    wp: { t: "WordPress — คุ้นมือสำหรับผู้ดูแลเนื้อหา", d: "ใช้ตัวแก้ไขที่ทีมคุ้นเคยอยู่แล้ว WebX เพิ่มการแยกขอบเขตหน่วยงาน การเสริมความปลอดภัย แบบฟอร์ม PDPA และเวิร์กโฟลว์ของ Studio ผ่าน must-use plugins — ไม่ผูกกับธีม" },
    note: "เลือกได้ต่อ workspace ผู้ดูแลเนื้อหาเข้าใช้ Studio เดียวกันทั้งสองแบบ",
  },
  agents: {
    eyebrow: "AI agent ในตัว Studio",
    h2: "Agent ที่ทำงานอยู่ในตัว Studio — ไม่มีวันหลุดกรอบสิทธิ์ที่ตั้งไว้",
    p: "WebX Studio มี AI agent ของตัวเอง — เป็นแผงแชทในทุกหน้าจอ และมีพื้นที่ทำงานเต็มรูปแบบสำหรับงานที่ใช้เวลานาน ผู้ดูแล workspace กำหนดได้เองว่า agent ทำอะไรได้แค่ไหน โดย agent จะวางแผนงานของตัวเองเป็นเช็คลิสต์ที่คุณดูได้ ถามก่อนทำสิ่งที่ไม่แน่ใจ และตรวจสอบผลลัพธ์ของตัวเองก่อนบอกว่างานเสร็จ",
    levelsLabel: "ระดับสิทธิ์ที่ผู้ดูแลกำหนดให้ทีละขั้น",
    levels: ["ปิด", "อ่านอย่างเดียว", "เสนอแนะ", "ร่างได้", "ร่างและส่งตรวจได้"],
    caps: [
      { icon: "check", t: "วางแผนแล้วลงมือทำตามแผน", d: "แตกคำสั่งเป็นเช็คลิสต์ที่มองเห็นได้ ติ๊กรายการที่ทำเสร็จไปเรื่อย ๆ และตรวจสอบผลลัพธ์ของตัวเองก่อนบอกว่างานเสร็จ" },
      { icon: "bolt", t: "ทำงานเบื้องหลังได้", d: "งานปริมาณมาก เช่น ร่างหน้าบริการทุกหน้า แปลทั้งหมวด ตรวจสอบช่องโหว่ด้านมาตรฐาน — ทำต่อได้แม้ปิดแท็บ และทำต่อจากจุดเดิมได้หากถูกขัดจังหวะ" },
      { icon: "clock", t: "หรือตั้งเวลาให้ทำงานเอง", d: "งานที่ทำซ้ำ เช่น ตรวจสอบเนื้อหาประจำสัปดาห์ ที่เริ่มทำงานเองได้ — ไม่ต้องมีใครคอยจำว่าต้องสั่งรัน" },
    ],
    mcpH3: "อยากต่อเชื่อมเอง?",
    mcpP: "กติกาเดียวกันนี้ใช้ได้ผ่าน MCP server และ CLI สำหรับ Claude, Cursor หรือสคริปต์ของคุณเอง",
    toolsLabel: "เครื่องมือ MCP ที่ agent เรียกใช้ได้",
    tools: ["list_content_types", "search_content", "get_entry", "create_entry", "update_entry", "submit_for_review", "list_reviews"],
    denied: "publish · delete — ไม่เปิดให้ agent ใช้ ไม่ว่าจะแบบใด",
  },
  compliance: {
    eyebrow: "ผ่านการตรวจสอบมาแล้ว",
    h2: "มาตรฐานไม่ใช่โครงการที่ต้องทำเพิ่ม แต่เป็นค่าเริ่มต้น",
    sub: "WebX ถูกเสริมความแข็งแกร่งระหว่างส่งมอบโครงการหลายเว็บไซต์ของหน่วยงานระดับชาติภายใต้ขอบเขตงาน 40 ข้อ — รายการด้านล่างคือสิ่งที่แพลตฟอร์มผ่านการตรวจสอบมาแล้ว ไม่ว่าจะเป็นกระทรวง รัฐวิสาหกิจ มหาวิทยาลัย หรือองค์กรภายใต้การกำกับดูแล คำตอบสำหรับการตรวจสอบพร้อมอยู่แล้ว",
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
    h2: "รวมทุกเว็บไซต์ที่คุณดูแลไว้บน WebX",
    p: "เริ่มต้นฟรี ได้มาตรฐานตั้งแต่วันแรก",
    cta1: "เริ่มใช้ฟรี",
    cta2: "คุยกับเรา",
  },
  footer: {
    tagline: "แพลตฟอร์ม CMS แบบหลายเว็บไซต์ — Studio เดียว เลือกระบบเบื้องหลังได้ ได้มาตรฐานเป็นค่าเริ่มต้น",
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
