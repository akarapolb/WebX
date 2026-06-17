/* =====================================================================
   data.ts — เนื้อหา seed หน้าแรก DGA (สกัดจาก index.html ของจริง)
   ภาษาไทยเป็นค่าเริ่มต้น (TOR ข้อ 4) · อังกฤษเสริมบางรายการเพื่อสาธิต i18n
   ===================================================================== */

export const homeTH = {
  seoTitle: "สำนักงานพัฒนารัฐบาลดิจิทัล (สพร.) | DGA",
  seoDescription:
    "บริการรัฐบาลดิจิทัลเพื่อประชาชน มาตรฐานภาครัฐ และข้อมูลเปิด จากสำนักงานพัฒนารัฐบาลดิจิทัล (สพร.) — DGA",
  hero: {
    kicker: "บริการดิจิทัลภาครัฐที่เชื่อถือได้",
    headingLine1: "บริการรัฐบาลดิจิทัล",
    headingAccent: "เพื่อประชาชนทุกคน",
    lead: "ค้นหาบริการ เอกสาร และข้อมูลภาครัฐได้ในที่เดียว หรือถามผู้ช่วย AI เพื่อคำตอบที่ตรงจุด",
    searchPlaceholder: "ค้นหาบริการ เอกสาร หรือถาม AI…",
    typewriterPhrases: [
      "ทำบัตรประชาชนดิจิทัล (ThaID)",
      "ขอข้อมูลเปิดภาครัฐ",
      "มาตรฐาน EA ภาครัฐ",
      "ตรวจสอบสิทธิ์สวัสดิการ",
      "ถาม AI: เริ่มต้นธุรกิจอย่างไร",
    ],
    popularTags: [
      { label: "ThaID", url: "#" },
      { label: "ทางรัฐ", url: "#" },
      { label: "Open Data", url: "#" },
      { label: "มาตรฐานดิจิทัล", url: "#" },
    ],
    slideFiles: ["hero-1.png", "hero-2.png", "hero-3.png", "hero-4.png", "hero-5.png"],
  },
  stats: [
    { icon: "users", value: "30 ล้าน+", label: "ผู้ใช้บริการ" },
    { icon: "grid", value: "1,400+", label: "บริการดิจิทัล" },
    { icon: "shield", value: "99.9%", label: "ความพร้อมระบบ" },
    { icon: "clock", value: "24/7", label: "ศูนย์ช่วยเหลือ" },
  ],
  featuredPromo: {
    eyebrow: "ซูเปอร์แอปภาครัฐ",
    title: "แอป “ทางรัฐ” บริการรัฐครบ จบในแอปเดียว",
    description:
      "ตรวจสอบสิทธิ์ จ่ายบิล นัดหมาย และเข้าถึงเอกสารราชการได้ทุกที่ทุกเวลา ปลอดภัยด้วยการยืนยันตัวตน ThaID",
    items: [
      "ตรวจสอบสิทธิ์สวัสดิการ",
      "จ่ายบิล/ชำระค่าบริการรัฐ",
      "นัดหมายหน่วยงานรัฐ",
      "เอกสารราชการดิจิทัล",
    ],
    imageFile: "thangrath.png",
    primaryLabel: "ดาวน์โหลดแอป",
    primaryUrl: "#",
    secondaryLabel: "เรียนรู้เพิ่มเติม",
    secondaryUrl: "#",
  },
};

export const homeEN = {
  seoTitle: "Digital Government Development Agency (DGA)",
  seoDescription:
    "Digital government services for citizens, public-sector standards and open data — by the Digital Government Development Agency (DGA).",
  hero: {
    kicker: "Trusted digital government services",
    headingLine1: "Digital Government Services",
    headingAccent: "for Every Citizen",
    lead: "Find services, documents and government data in one place — or ask the AI assistant for a precise answer.",
    searchPlaceholder: "Search services, documents or ask AI…",
    typewriterPhrases: [
      "Get a digital ID (ThaID)",
      "Request open government data",
      "Government EA standards",
      "Check welfare entitlements",
      "Ask AI: how to start a business",
    ],
    popularTags: [
      { label: "ThaID", url: "#" },
      { label: "Thang Rath", url: "#" },
      { label: "Open Data", url: "#" },
      { label: "Digital Standards", url: "#" },
    ],
    slideFiles: ["hero-1.png", "hero-2.png", "hero-3.png", "hero-4.png", "hero-5.png"],
  },
  stats: [
    { icon: "users", value: "30M+", label: "Service users" },
    { icon: "grid", value: "1,400+", label: "Digital services" },
    { icon: "shield", value: "99.9%", label: "System uptime" },
    { icon: "clock", value: "24/7", label: "Help center" },
  ],
  featuredPromo: {
    eyebrow: "Government super-app",
    title: "“Thang Rath” — all government services in one app",
    description:
      "Check entitlements, pay bills, book appointments and access official documents anytime, anywhere — secured by ThaID identity verification.",
    items: [
      "Check welfare entitlements",
      "Pay government bills",
      "Book appointments with agencies",
      "Digital official documents",
    ],
    imageFile: "thangrath.png",
    primaryLabel: "Download the app",
    primaryUrl: "#",
    secondaryLabel: "Learn more",
    secondaryUrl: "#",
  },
};

export const servicesTH = [
  { title: "บัตรประชาชนดิจิทัล", description: "ยืนยันตัวตน ThaID ใช้แทนบัตรจริง", icon: "i-id", colorTheme: "orange", url: "#", order: 1 },
  { title: "แอปทางรัฐ", description: "รวมบริการภาครัฐในแอปเดียว", icon: "i-grid", colorTheme: "blue", url: "#", order: 2 },
  { title: "ข้อมูลเปิดภาครัฐ", description: "Open Government Data", icon: "i-data", colorTheme: "green", url: "#", order: 3 },
  { title: "BizPortal", description: "เริ่มต้นธุรกิจครบวงจร", icon: "i-build", colorTheme: "amber", url: "#", order: 4 },
  { title: "มาตรฐานดิจิทัล", description: "กรอบ EA และคู่มือภาครัฐ", icon: "i-doc", colorTheme: "purple", url: "#", order: 5 },
  { title: "ศูนย์ความรู้", description: "กฎหมายดิจิทัล & e-Book", icon: "i-book", colorTheme: "teal", url: "#", order: 6 },
];

export const servicesEN = [
  { title: "Digital ID Card", description: "ThaID identity — use instead of a physical card", order: 1 },
  { title: "Thang Rath App", description: "All government services in one app", order: 2 },
  { title: "Open Government Data", description: "Open Government Data", order: 3 },
  { title: "BizPortal", description: "Start a business, end to end", order: 4 },
  { title: "Digital Standards", description: "EA framework and public-sector guides", order: 5 },
  { title: "Knowledge Center", description: "Digital law & e-Books", order: 6 },
];

export const banners = [
  { file: "banner-1.png", label: "ไทยคว้าอันดับ 17 — WASEDA-IAC World Digital Government Ranking 2025", order: 1 },
  { file: "banner-2.png", label: "แบนเนอร์ประชาสัมพันธ์ 2", order: 2 },
  { file: "banner-3.png", label: "แบนเนอร์ประชาสัมพันธ์ 3", order: 3 },
  { file: "banner-4.png", label: "แบนเนอร์ประชาสัมพันธ์ 4", order: 4 },
  { file: "banner-5.png", label: "แบนเนอร์ประชาสัมพันธ์ 5", order: 5 },
  { file: "banner-6.png", label: "แบนเนอร์ประชาสัมพันธ์ 6", order: 6 },
  { file: "banner-7.png", label: "แบนเนอร์ประชาสัมพันธ์ 7", order: 7 },
  { file: "banner-8.png", label: "แบนเนอร์ประชาสัมพันธ์ 8", order: 8 },
  { file: "banner-9.png", label: "แบนเนอร์ประชาสัมพันธ์ 9", order: 9 },
  { file: "banner-10.png", label: "แบนเนอร์ประชาสัมพันธ์ 10", order: 10 },
  { file: "banner-11.png", label: "แบนเนอร์ประชาสัมพันธ์ 11", order: 11 },
  { file: "banner-12.png", label: "แบนเนอร์ประชาสัมพันธ์ 12", order: 12 },
];

export const news = [
  {
    kind: "news", featured: true, categoryLabel: "บริการใหม่", file: "news-1.jpg",
    title: "DGA จัดประชุมติดตามผลการดำเนินงาน ภายใต้แผนงานบูรณาการรัฐบาลดิจิทัล ปี 2569 (Project Unlock Clinic)",
    publishDate: "2026-06-13", views: 25,
    excerpt: "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน) ในฐานะหน่วยงานเจ้าภาพแผนงานบูรณาการรัฐบาลดิจิทัล จัดประชุมติดตามผลการดำเนินงานของหน่วยรับงบประมาณ ประจำปีงบประมาณ พ.ศ. 2569…",
  },
  { kind: "news", categoryLabel: "MOU", file: "news-2.jpg", title: "ป.ป.ท. จับมือ DGA ลงนาม MOU ยกระดับการป้องกันและปราบปรามการทุจริต", publishDate: "2026-06-12", views: 25, excerpt: "" },
  { kind: "news", categoryLabel: "ข้อมูลเปิด", file: "news-3.jpg", title: "DGA จับมือ สำนักงานสถิติแห่งชาติ ชู “ข้อมูลเปิดภาครัฐ” กุญแจสำคัญ", publishDate: "2026-06-09", views: 78, excerpt: "" },
  { kind: "news", categoryLabel: "กิจกรรม", file: "news-4.jpg", title: "DGA ร่วมลงนามถวายพระพรชัยมงคล เนื่องในโอกาสพระราชพิธีมหามงคล", publishDate: "2026-06-03", views: 38, excerpt: "" },
  { kind: "news", categoryLabel: "ต่างประเทศ", file: "news-5.jpg", title: "DGA ต้อนรับคณะเจ้าหน้าที่ระดับสูงจากกระทรวงการคลัง ประเทศแทนซาเนีย", publishDate: "2026-06-02", views: 16, excerpt: "" },
];

export const articles = [
  {
    kind: "article", featured: true, categoryLabel: "บทความ", file: "article-1.jpg",
    title: "“ทางรัฐ” เคียงข้างคนพิการ ร่วมก้าวไปข้างหน้า ให้คนพิการเข้าถึงสิทธิและบริการอย่างเท่าเทียม",
    publishDate: "2025-07-29", views: 268,
    excerpt: "หลังจากเดือนมิถุนายนที่เป็นเดือนแห่งความหลากหลายทางเพศ (Pride Month) เดือนกรกฎาคมยังถือเป็นเดือนแห่ง “ความภาคภูมิใจของคนพิการ” (Disability Pride Month) ทั่วโลก…",
  },
  { kind: "article", categoryLabel: "Data", file: "article-2.jpg", title: "DIGI Data Camp: ปลุกพลัง “อัศวินข้อมูล” พลิกโฉมภาครัฐไทย", publishDate: "2025-07-18", views: 904, excerpt: "" },
  { kind: "article", categoryLabel: "ทางรัฐ", file: "article-3.jpg", title: "“ทางรัฐ” แอปฯ “ดี” ตอบโจทย์ทุกช่วงวัย ในแอปฯ เดียว", publishDate: "2025-06-17", views: 484, excerpt: "" },
  { kind: "article", categoryLabel: "CEO Wisdom", file: "article-4.jpg", title: "CEO WISDOM : สร้างมาตรฐานสากล ขับเคลื่อนเศรษฐกิจไทยด้วยระบบดิจิทัล", publishDate: "2024-02-21", views: 188, excerpt: "" },
  { kind: "article", categoryLabel: "CEO Wisdom", file: "article-5.jpg", title: "CEO WISDOM : สำนักงานกิจการยุติธรรมสู่โลกแห่งดิจิทัล", publishDate: "2023-11-09", views: 232, excerpt: "" },
];

export const videos = [
  { file: "channel-1.jpg", title: "DGA จัดประชุมสื่อสารโครงการสำรวจระดับความพร้อมรัฐบาลดิจิทัลหน่วยงานภาครัฐของประเทศไทย ประจำปี 2569 ครั้งที่ 1", date: "2026-04-01", views: 276, duration: "12:40", categoryKey: "event" },
  { file: "channel-2.jpg", title: "วีดิโองานประชาพิจารณ์ (ร่าง) มาตรฐาน สพร. ด้านมาตรฐานบริการดิจิทัลภาครัฐ", date: "2026-03-20", views: 156, duration: "08:15", categoryKey: "std" },
  { file: "channel-3.jpg", title: "DGA ขอเชิญรับฟังงานประชาพิจารณ์ (ร่าง) มาตรฐานรัฐบาลดิจิทัล (มรด.) ว่าด้วยหลักเกณฑ์การจัดระดับชั้นข้อมูลภาครัฐ เวอร์ชัน 1.0", date: "2026-03-03", views: 46, duration: "05:32", categoryKey: "std" },
  { file: "channel-4.jpg", title: "วีดิโองานประชาพิจารณ์ ร่าง มาตรฐานรัฐบาลดิจิทัล ว่าด้วยหลักเกณฑ์การจัดระดับชั้นข้อมูลภาครัฐ เวอร์ชัน 1.0", date: "2026-02-27", views: 3, duration: "03:50", categoryKey: "std" },
  { file: "channel-5.jpg", title: "DGA จัดงานประชุมรับฟังความคิดเห็น (Public Hearing) ต่อ (ร่าง) มาตรฐานรัฐบาลดิจิทัล (มรด.) ว่าด้วยมาตรฐานการเชื่อมโยงและแลกเปลี่ยนข้อมูล", date: "2026-02-24", views: 113, duration: "15:20", categoryKey: "std" },
  { file: "channel-6.jpg", title: "Digital Gov ไทย: รัฐบาลดิจิทัลไทย วันนี้ได้กี่คะแนน? กับ เอ็น ปานระพี", date: "2026-02-20", views: 80, duration: "22:10", categoryKey: "talk" },
];

export const awards = [
  { file: "award-1.png", name: "Prime Minister Award", categoryText: "Thailand Cybersecurity Excellence — Public Service", year: "2022", order: 1 },
  { file: "award-2.png", name: "Prime Minister Award", categoryText: "Cybersecurity Excellence — CSR", year: "2022", order: 2 },
  { file: "award-3.png", name: "รางวัลเลิศรัฐ", categoryText: "สาขาบริการภาครัฐยอดเยี่ยม", year: "2566", order: 3 },
  { file: "award-4.png", name: "Digital Transformation Award", categoryText: "Service Excellence — อันดับ 1", year: "2566", order: 4 },
];

export const faqs = [
  { order: 1, question: "DGA (สพร.) คือใคร ทำหน้าที่อะไร?", answer: "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน) หรือ สพร./DGA เป็นหน่วยงานกลางที่พัฒนา เชื่อมโยง และยกระดับบริการภาครัฐให้เป็นดิจิทัล เช่น แอป “ทางรัฐ” ระบบยืนยันตัวตน และโครงสร้างพื้นฐานข้อมูลกลางของรัฐ เพื่อให้ประชาชนเข้าถึงบริการได้สะดวก รวดเร็ว และปลอดภัย" },
  { order: 2, question: "แอป “ทางรัฐ” ใช้ทำอะไรได้บ้าง และดาวน์โหลดอย่างไร?", answer: "แอป “ทางรัฐ” รวมบริการรัฐไว้ในที่เดียว เช่น ตรวจสอบสิทธิ์สวัสดิการ จ่ายบิล/ชำระค่าบริการรัฐ นัดหมายหน่วยงาน และเรียกดูเอกสารราชการดิจิทัล ดาวน์โหลดได้ฟรีทั้งระบบ iOS และ Android หรือใช้งานผ่านเว็บไซต์ โดยยืนยันตัวตนด้วย ThaID" },
  { order: 3, question: "ThaID คืออะไร และยืนยันตัวตนอย่างไร?", answer: "ThaID คือระบบพิสูจน์และยืนยันตัวตนทางดิจิทัลของภาครัฐ ใช้แทนการแสดงบัตรประชาชนเพื่อเข้าถึงบริการออนไลน์อย่างปลอดภัย ลงทะเบียนได้ผ่านแอป ThaID ด้วยตนเอง หรือยืนยันตัวตน ณ ที่ว่าการอำเภอ/สำนักงานเขต" },
  { order: 4, question: "หน่วยงานรัฐขอเชื่อมต่อระบบ/แลกเปลี่ยนข้อมูลกับ DGA ได้อย่างไร?", answer: "หน่วยงานสามารถเชื่อมต่อบริการผ่านแพลตฟอร์มแลกเปลี่ยนข้อมูลกลาง (GDX) และ Open API ของ DGA โดยยื่นคำขอผ่านช่องทางสำหรับหน่วยงานภาครัฐ ทีมงานจะประสานเรื่องสิทธิ์การเข้าถึง มาตรฐานข้อมูล และความปลอดภัยตามกรอบ PDPA" },
  { order: 5, question: "เว็บไซต์รองรับผู้พิการและผู้สูงอายุหรือไม่?", answer: "รองรับครับ เว็บไซต์ออกแบบตามมาตรฐาน WCAG 2.2 ระดับ AA ใช้งานด้วยคีย์บอร์ดได้ครบ รองรับโปรแกรมอ่านหน้าจอ มีโหมดความคมชัดสูง ปรับขนาดตัวอักษร และโหมดมืด เพื่อให้ทุกคนเข้าถึงบริการได้อย่างเท่าเทียม" },
  { order: 6, question: "ติดต่อ DGA หรือศูนย์บริการได้ที่ไหน เวลาใด?", answer: "ติดต่อศูนย์บริการ DGA Contact Center โทร 0-2612-6000 ให้บริการตลอด 24 ชั่วโมง หรือกดปุ่ม DGA Guide มุมขวาล่างของหน้าจอ เพื่อสอบถามผู้ช่วยอัจฉริยะได้ทันที" },
];
