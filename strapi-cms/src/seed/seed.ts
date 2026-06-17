/* =====================================================================
   seed.ts — เติมเนื้อหาหน้าแรกลง CMS ครั้งแรก + ตั้ง locale ไทย + สิทธิ์ Public
   ทำงานแบบ idempotent: เนื้อหา seed เฉพาะเมื่อยังว่าง · สิทธิ์/locale ตั้งทุกครั้ง
   ===================================================================== */
import fs from "fs";
import path from "path";
import vm from "vm";
import {
  homeTH, homeEN, servicesTH, servicesEN, banners,
  news, articles, videos, awards, faqs,
} from "./data";

const IMG_DIR = path.resolve(process.cwd(), "..", "site", "DGA-Website", "assets", "image");

function mimeOf(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "image/jpeg";
}

export async function ensureThaiLocale(strapi: any) {
  const locales = strapi.plugin("i18n").service("locales");
  const existing = await locales.findByCode("th");
  if (!existing) {
    await locales.create({ code: "th", name: "ไทย (th)" });
    strapi.log.info("[seed] created locale th");
  }
  try {
    await locales.setDefaultLocale({ code: "th" });
  } catch (e) {
    strapi.log.warn("[seed] could not set default locale th: " + (e as Error).message);
  }
}

export async function ensurePublicPermissions(strapi: any) {
  const role = await strapi
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });
  if (!role) return;

  const map: Record<string, string[]> = {
    "api::home-page.home-page": ["find", "findOne"],
    "api::article.article": ["find", "findOne"],
    "api::service.service": ["find", "findOne"],
    "api::banner.banner": ["find", "findOne"],
    "api::video.video": ["find", "findOne"],
    "api::award.award": ["find", "findOne"],
    "api::faq.faq": ["find", "findOne"],
    "api::job.job": ["find", "findOne"],
    // ฟอร์มสาธารณะ: เปิดเฉพาะ create (ไม่เปิด find/findOne เพื่อกันข้อมูลรั่ว/PDPA)
    // การติดตามสถานะใช้ route /track/:ref แบบ auth:false แยกต่างหาก
    "api::complaint.complaint": ["create"],
    "api::application.application": ["create"],
    "api::registration.registration": ["create"],
    "api::consent-log.consent-log": ["create"],
  };

  for (const [uid, actions] of Object.entries(map)) {
    for (const action of actions) {
      const actionId = `${uid}.${action}`;
      const found = await strapi
        .query("plugin::users-permissions.permission")
        .findOne({ where: { action: actionId, role: role.id } });
      if (!found) {
        await strapi
          .query("plugin::users-permissions.permission")
          .create({ data: { action: actionId, role: role.id } });
      }
    }
  }
  strapi.log.info("[seed] public read permissions ensured");
}

export async function seedContent(strapi: any) {
  const serviceCount = await strapi.documents("api::service.service").count();
  if (serviceCount > 0) {
    strapi.log.info("[seed] content already present — skipping");
    return;
  }
  strapi.log.info("[seed] seeding DGA home content…");

  // --- media upload helper (cached by filename) ---
  const cache = new Map<string, number | null>();
  async function upload(file?: string): Promise<number | null> {
    if (!file) return null;
    if (cache.has(file)) return cache.get(file)!;
    const filePath = path.join(IMG_DIR, file);
    if (!fs.existsSync(filePath)) {
      strapi.log.warn(`[seed] image not found: ${file}`);
      cache.set(file, null);
      return null;
    }
    const stats = fs.statSync(filePath);
    const [uploaded] = await strapi.plugin("upload").service("upload").upload({
      data: { fileInfo: { name: file, alternativeText: file } },
      files: {
        filepath: filePath,
        originalFileName: file,
        mimetype: mimeOf(file),
        size: stats.size,
      },
    });
    const id = uploaded?.id ?? null;
    cache.set(file, id);
    return id;
  }

  const P = { status: "published" as const };

  // ---------- Home Page (single type, th + en) ----------
  const heroSlides = (await Promise.all(homeTH.hero.slideFiles.map(upload))).filter(Boolean);
  const promoImg = await upload(homeTH.featuredPromo.imageFile);

  const heroBase = (h: typeof homeTH.hero) => ({
    kicker: h.kicker, headingLine1: h.headingLine1, headingAccent: h.headingAccent,
    lead: h.lead, searchPlaceholder: h.searchPlaceholder,
    typewriterPhrases: h.typewriterPhrases, popularTags: h.popularTags, slides: heroSlides,
  });
  const promoBase = (p: typeof homeTH.featuredPromo) => ({
    eyebrow: p.eyebrow, title: p.title, description: p.description, items: p.items,
    image: promoImg, primaryLabel: p.primaryLabel, primaryUrl: p.primaryUrl,
    secondaryLabel: p.secondaryLabel, secondaryUrl: p.secondaryUrl,
  });

  const home = await strapi.documents("api::home-page.home-page").create({
    locale: "th", ...P,
    data: {
      seoTitle: homeTH.seoTitle, seoDescription: homeTH.seoDescription,
      hero: heroBase(homeTH.hero), stats: homeTH.stats, featuredPromo: promoBase(homeTH.featuredPromo),
    },
  });
  await strapi.documents("api::home-page.home-page").update({
    documentId: home.documentId, locale: "en", ...P,
    data: {
      seoTitle: homeEN.seoTitle, seoDescription: homeEN.seoDescription,
      hero: heroBase(homeEN.hero), stats: homeEN.stats, featuredPromo: promoBase(homeEN.featuredPromo),
    },
  });

  // ---------- Services (th + en) ----------
  for (let i = 0; i < servicesTH.length; i++) {
    const s = servicesTH[i];
    const doc = await strapi.documents("api::service.service").create({ locale: "th", ...P, data: s });
    const en = servicesEN[i];
    await strapi.documents("api::service.service").update({
      documentId: doc.documentId, locale: "en", ...P,
      data: { title: en.title, description: en.description, icon: s.icon, colorTheme: s.colorTheme, url: s.url, order: en.order },
    });
  }

  // ---------- Banners ----------
  for (const b of banners) {
    await strapi.documents("api::banner.banner").create({
      locale: "th", ...P,
      data: { label: b.label, image: await upload(b.file), url: "#", order: b.order, active: true },
    });
  }

  // ---------- News + Articles ----------
  for (const a of [...news, ...articles]) {
    await strapi.documents("api::article.article").create({
      locale: "th", ...P,
      data: {
        title: a.title, kind: a.kind, categoryLabel: a.categoryLabel, excerpt: a.excerpt,
        coverImage: await upload(a.file), publishDate: a.publishDate, views: a.views,
        featured: (a as any).featured ?? false,
      },
    });
  }

  // ---------- Videos ----------
  for (const v of videos) {
    await strapi.documents("api::video.video").create({
      locale: "th", ...P,
      data: { title: v.title, thumbnail: await upload(v.file), duration: v.duration, categoryKey: v.categoryKey, date: v.date, views: v.views, videoUrl: "#" },
    });
  }

  // ---------- Awards ----------
  for (const w of awards) {
    await strapi.documents("api::award.award").create({
      locale: "th", ...P,
      data: { name: w.name, categoryText: w.categoryText, year: w.year, image: await upload(w.file), order: w.order },
    });
  }

  // ---------- FAQs ----------
  for (const f of faqs) {
    await strapi.documents("api::faq.faq").create({
      locale: "th", ...P,
      data: { question: f.question, answer: f.answer, order: f.order },
    });
  }

  strapi.log.info("[seed] DGA home content seeded successfully ✔");
}

/* ---------- Tenants (multi-tenant registry + ตั้งค่าแบรนด์/footer ต่อ tenant) ---------- */
export async function seedTenants(strapi: any) {
  const want = [
    {
      key: "dga", name: "สำนักงานพัฒนารัฐบาลดิจิทัล (สพร.)",
      domains: ["localhost", "127.0.0.1", "dga.localhost", "dga.or.th", "www.dga.or.th"],
      active: true,
      adminEmails: ["dga-editor@dga.local"],
      brand: { orgName: { th: "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)", en: "Digital Government Development Agency" }, primaryColor: "#1a4fa0", logoUrl: "/assets/image/logo-dga.webp" },
      contact: { phone: "0-2612-6000", address: { th: "อาคารสถาบันเพื่อการยุติธรรมแห่งประเทศไทย (TIJ) ชั้น 4 เลขที่ 999 ถนนแจ้งวัฒนะ แขวงทุ่งสองห้อง เขตหลักสี่ กรุงเทพฯ 10210", en: "TIJ Building, 4th Fl., 999 Chaeng Watthana Rd, Lak Si, Bangkok 10210" } },
      social: [{ label: "Facebook", url: "https://www.facebook.com/DGAThailand" }, { label: "YouTube", url: "https://www.youtube.com/@DGAThailand" }],
      footerColumns: [
        { heading: { th: "บริการ", en: "Services" }, links: [{ label: { th: "ThaID", en: "ThaID" }, url: "#" }, { label: { th: "ทางรัฐ", en: "Thang Rath" }, url: "#" }, { label: { th: "Open Data", en: "Open Data" }, url: "#" }, { label: { th: "API Gateway", en: "API Gateway" }, url: "#" }] },
        { heading: { th: "เกี่ยวกับ", en: "About" }, links: [{ label: { th: "วิสัยทัศน์", en: "Vision" }, url: "#" }, { label: { th: "ข่าวสาร", en: "News" }, url: "#" }, { label: { th: "ร่วมงานกับเรา", en: "Careers" }, url: "/careers.html" }, { label: { th: "ติดต่อเรา", en: "Contact" }, url: "#" }] },
        { heading: { th: "นโยบาย", en: "Policies" }, links: [{ label: { th: "นโยบายความเป็นส่วนตัว (PDPA)", en: "Privacy (PDPA)" }, url: "#" }, { label: { th: "นโยบายคุกกี้", en: "Cookie policy" }, url: "#" }, { label: { th: "การเข้าถึง (WCAG)", en: "Accessibility (WCAG)" }, url: "/accessibility" }, { label: { th: "แผนผังเว็บไซต์", en: "Sitemap" }, url: "#" }] },
      ],
    },
    {
      key: "pea", name: "การไฟฟ้าส่วนภูมิภาค (กฟภ.)",
      domains: ["pea.localhost", "pea.co.th", "www.pea.co.th"],
      active: true,
      adminEmails: ["pea-editor@pea.local"],
      brand: { orgName: { th: "การไฟฟ้าส่วนภูมิภาค", en: "Provincial Electricity Authority" }, primaryColor: "#6a2c91", logoUrl: "/assets/image/pea-logo.svg" },
      contact: { phone: "1129", address: { th: "200 ถนนงามวงศ์วาน แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900", en: "200 Ngamwongwan Rd, Chatuchak, Bangkok 10900" } },
      social: [{ label: "Facebook", url: "#" }],
      footerColumns: [
        { heading: { th: "บริการ", en: "Services" }, links: [{ label: { th: "ตรวจสอบค่าไฟ", en: "Check bill" }, url: "#" }, { label: { th: "ชำระค่าไฟ", en: "Pay bill" }, url: "#" }, { label: { th: "แจ้งไฟดับ", en: "Report outage" }, url: "#" }] },
        { heading: { th: "เกี่ยวกับ", en: "About" }, links: [{ label: { th: "เกี่ยวกับ กฟภ.", en: "About PEA" }, url: "#" }, { label: { th: "ติดต่อ", en: "Contact" }, url: "#" }] },
      ],
    },
  ];
  for (const t of want) {
    const exists = await strapi.documents("api::tenant.tenant").findMany({ filters: { key: t.key }, limit: 1 });
    if (!exists.length) {
      await strapi.documents("api::tenant.tenant").create({ data: t });
      strapi.log.info(`[seed] tenant '${t.key}' created`);
    }
  }
}

async function dgaTenantId(strapi: any): Promise<number | null> {
  const rows = await strapi.documents("api::tenant.tenant").findMany({ filters: { key: "dga" }, fields: ["key"], limit: 1 });
  return rows[0] ? rows[0].id : null;
}

/* ---------- Backfill: ผูกเนื้อหาเดิมที่ยังไม่มี tenant ให้เป็น 'dga' (idempotent) ---------- */
export async function backfillTenant(strapi: any) {
  const dgaId = await dgaTenantId(strapi);
  if (!dgaId) return;
  const uids = [
    "api::home-page.home-page",
    "api::article.article", "api::service.service", "api::faq.faq", "api::job.job",
    "api::banner.banner", "api::video.video", "api::award.award",
    "api::complaint.complaint", "api::application.application", "api::registration.registration",
  ];
  for (const uid of uids) {
    const rows = await strapi.db.query(uid).findMany({ where: { tenant: null }, select: ["id"], limit: 10000 });
    for (const r of rows) {
      await strapi.db.query(uid).update({ where: { id: r.id }, data: { tenant: dgaId } });
    }
    if (rows.length) strapi.log.info(`[seed] backfilled tenant=dga on ${rows.length} rows of ${uid}`);
  }
}

/* ---------- เนื้อหาของ tenant ที่ 2 (pea) เพื่อพิสูจน์ data isolation ของ Search ---------- */
export async function seedTenantBContent(strapi: any) {
  const pea = (await strapi.documents("api::tenant.tenant").findMany({ filters: { key: "pea" }, fields: ["key"], limit: 1 }))[0];
  if (!pea) return;
  const existing = await strapi.db.query("api::service.service").findMany({ where: { tenant: pea.id }, select: ["id"], limit: 1 });
  if (existing.length) return; // seed แล้ว
  const P = { status: "published" as const };

  const services = [
    { title: "ตรวจสอบค่าไฟฟ้า", description: "เช็กยอดค่าไฟและประวัติการใช้", icon: "i-data", colorTheme: "purple", url: "#", order: 1 },
    { title: "ชำระค่าไฟออนไลน์", description: "จ่ายบิลผ่านช่องทางดิจิทัล", icon: "i-build", colorTheme: "amber", url: "#", order: 2 },
    { title: "แจ้งไฟฟ้าขัดข้อง", description: "แจ้งเหตุไฟดับและติดตามสถานะ", icon: "i-shield", colorTheme: "blue", url: "#", order: 3 },
  ];
  for (const s of services) await strapi.documents("api::service.service").create({ locale: "th", ...P, data: { ...s, tenant: pea.id } });

  const faqs = [
    { order: 1, question: "ตรวจสอบค่าไฟฟ้าออนไลน์ได้อย่างไร?", answer: "เข้าสู่ระบบบริการ PEA Smart Plus หรือเว็บไซต์ กฟภ. กรอกหมายเลขผู้ใช้ไฟฟ้า เพื่อดูยอดค่าไฟและประวัติการใช้ย้อนหลังได้ทันที" },
    { order: 2, question: "แจ้งไฟฟ้าดับต้องทำอย่างไร?", answer: "โทร 1129 PEA Contact Center ตลอด 24 ชั่วโมง หรือแจ้งผ่านแอป PEA Smart Plus พร้อมระบุพื้นที่และหมายเลขผู้ใช้ไฟฟ้า" },
    { order: 3, question: "ชำระค่าไฟผ่านช่องทางใดได้บ้าง?", answer: "ชำระได้ผ่านแอป PEA Smart Plus, Mobile Banking, เคาน์เตอร์เซอร์วิส, ที่ทำการ กฟภ. ทุกสาขา และตู้รับชำระอัตโนมัติ" },
  ];
  for (const f of faqs) await strapi.documents("api::faq.faq").create({ locale: "th", ...P, data: { ...f, tenant: pea.id } });

  const articles = [
    { kind: "news", categoryLabel: "ประชาสัมพันธ์", title: "กฟภ. เปิดบริการชำระค่าไฟผ่าน PEA Smart Plus", publishDate: "2026-06-10", views: 1280, excerpt: "การไฟฟ้าส่วนภูมิภาคยกระดับบริการดิจิทัล เปิดให้ผู้ใช้ไฟฟ้าชำระค่าไฟและตรวจสอบยอดผ่านแอปได้ทุกที่ทุกเวลา…", featured: true },
    { kind: "news", categoryLabel: "บริการ", title: "กฟภ. ขยายจุดให้บริการแจ้งไฟดับออนไลน์ทั่วประเทศ", publishDate: "2026-06-05", views: 940, excerpt: "" },
    { kind: "news", categoryLabel: "พลังงานสะอาด", title: "กฟภ. ส่งเสริมติดตั้งโซลาร์รูฟท็อปสำหรับครัวเรือน", publishDate: "2026-06-01", views: 612, excerpt: "" },
    { kind: "news", categoryLabel: "กิจกรรม", title: "กฟภ. จัดอบรมการใช้พลังงานอย่างมีประสิทธิภาพให้ชุมชน", publishDate: "2026-05-28", views: 333, excerpt: "" },
    { kind: "news", categoryLabel: "ความปลอดภัย", title: "กฟภ. รณรงค์ความปลอดภัยการใช้ไฟฟ้าในฤดูฝน", publishDate: "2026-05-20", views: 488, excerpt: "" },
  ];
  for (const a of articles) await strapi.documents("api::article.article").create({ locale: "th", ...P, data: { ...a, tenant: pea.id } });

  const peaJobs = [
    { jobId: "pea-elec-eng", deptKey: "tech", typeKey: "fulltime", openings: 3, title: "วิศวกรไฟฟ้า", dept: "ฝ่ายวิศวกรรมระบบจำหน่าย", type: "พนักงานประจำ", location: "ทั่วประเทศ", salary: "30,000–55,000 บาท/เดือน", deadline: "31 ส.ค. 2569", summary: "ออกแบบ ดูแล และพัฒนาระบบจำหน่ายไฟฟ้าให้มั่นคงและปลอดภัย", responsibilities: ["ออกแบบและปรับปรุงระบบจำหน่ายไฟฟ้า", "ดูแลบำรุงรักษาอุปกรณ์ในพื้นที่", "วิเคราะห์และแก้ไขเหตุขัดข้อง"], qualifications: ["ปริญญาตรีวิศวกรรมไฟฟ้า", "มีใบประกอบวิชาชีพ (กว.)", "ปฏิบัติงานต่างจังหวัดได้"], benefits: ["ประกันสุขภาพและชีวิต", "ที่พักสวัสดิการ", "กองทุนสำรองเลี้ยงชีพ"] },
    { jobId: "pea-data-analyst", deptKey: "data", typeKey: "fulltime", openings: 1, title: "นักวิเคราะห์ข้อมูลการใช้ไฟฟ้า", dept: "ฝ่ายข้อมูลและสารสนเทศ", type: "พนักงานประจำ", location: "กรุงเทพฯ", salary: "35,000–60,000 บาท/เดือน", deadline: "15 ก.ย. 2569", summary: "วิเคราะห์ข้อมูลการใช้ไฟฟ้าเพื่อวางแผนและพยากรณ์ความต้องการ", responsibilities: ["วิเคราะห์ข้อมูลการใช้ไฟฟ้า", "จัดทำรายงานและ dashboard", "พยากรณ์ความต้องการพลังงาน"], qualifications: ["ปริญญาตรีสถิติ/วิทยาการข้อมูล", "ใช้ SQL และ Python ได้", "ประสบการณ์อย่างน้อย 2 ปี"], benefits: ["ประกันสุขภาพและชีวิต", "ทำงานแบบไฮบริด", "กองทุนสำรองเลี้ยงชีพ"] },
  ];
  for (const j of peaJobs) await strapi.documents("api::job.job").create({ locale: "th", ...P, data: { ...j, tenant: pea.id } });

  // หน้าแรกของ pea (พิสูจน์ Home แบบ per-tenant)
  await strapi.documents("api::home-page.home-page").create({
    locale: "th", ...P,
    data: {
      tenant: pea.id,
      seoTitle: "การไฟฟ้าส่วนภูมิภาค (กฟภ.)",
      seoDescription: "บริการดิจิทัลของการไฟฟ้าส่วนภูมิภาค — ตรวจสอบค่าไฟ ชำระเงิน แจ้งไฟดับ",
      hero: {
        kicker: "บริการไฟฟ้าดิจิทัล", headingLine1: "การไฟฟ้าส่วนภูมิภาค", headingAccent: "บริการครบ จบในที่เดียว",
        lead: "ตรวจสอบค่าไฟ ชำระเงิน และแจ้งไฟฟ้าขัดข้องออนไลน์ได้ตลอด 24 ชั่วโมง",
        searchPlaceholder: "ค้นหาบริการ กฟภ.…", typewriterPhrases: ["ตรวจสอบค่าไฟ", "ชำระค่าไฟ", "แจ้งไฟดับ"],
        popularTags: [{ label: "ค่าไฟ", url: "#" }, { label: "ชำระเงิน", url: "#" }, { label: "แจ้งไฟดับ", url: "#" }], slides: [],
      },
      stats: [
        { icon: "users", value: "20 ล้าน+", label: "ผู้ใช้ไฟฟ้า" },
        { icon: "shield", value: "99.9%", label: "ความเสถียรของระบบ" },
        { icon: "clock", value: "1129", label: "ศูนย์บริการ 24 ชม." },
      ],
      featuredPromo: {
        eyebrow: "แอป PEA Smart Plus", title: "จัดการค่าไฟครบ จบในแอปเดียว",
        description: "ตรวจสอบยอด ชำระเงิน และแจ้งเหตุไฟฟ้าขัดข้องได้ทุกที่ทุกเวลา",
        items: ["ตรวจสอบค่าไฟ", "ชำระค่าไฟออนไลน์", "แจ้งไฟฟ้าขัดข้อง"],
        primaryLabel: "ดาวน์โหลดแอป", primaryUrl: "#", secondaryLabel: "เรียนรู้เพิ่มเติม", secondaryUrl: "#",
      },
    },
  });

  strapi.log.info("[seed] tenant 'pea' demo content created (home/services/faqs/articles) ✔");
}

/* ---------- ตั้งค่า analytics ตัวอย่างให้ tenant (ถ้ายังว่าง) — idempotent ----------
   ใช้ค่า demo (ไม่ส่งข้อมูลจริง) ผู้ดูแลเปลี่ยนเป็น GA4/Clarity ID จริงได้ในหลังบ้าน */
export async function ensureTenantAnalytics(strapi: any) {
  const demo: Record<string, any> = {
    dga: { ga4: "G-DEMO-DGA", clarity: "demoDGA", enabled: true },
    pea: { ga4: "G-DEMO-PEA", clarity: "demoPEA", enabled: true },
  };
  const tenants = await strapi.db.query("api::tenant.tenant").findMany({ select: ["id", "key", "analytics"], limit: 500 });
  for (const t of tenants) {
    if (t.analytics == null && demo[t.key]) {
      await strapi.db.query("api::tenant.tenant").update({ where: { id: t.id }, data: { analytics: demo[t.key] } });
      strapi.log.info(`[seed] set demo analytics for tenant ${t.key}`);
    }
  }
}

/* ---------- ให้สิทธิ์ทุก locale แก่ role editor/author ---------- */
/* locale ที่สร้างทีหลัง (เช่น th) จะไม่ถูกผูกให้ role เดิมอัตโนมัติ → content-manager
   จะ filter locale:{$in:[]} ทำให้ editor มองไม่เห็นเนื้อหาเลย ต้องเติม locales ให้ permission */
export async function grantLocalesToEditorRoles(strapi: any) {
  let locales: string[] = [];
  try {
    const list = await strapi.plugin("i18n").service("locales").find();
    locales = (list || []).map((l: any) => l.code);
  } catch (e) { return; }
  if (!locales.length) return;

  // content type ที่เปิด i18n (ต้องมี dimension locale ใน permission)
  const I18N_SUBJECTS = new Set([
    "api::home-page.home-page", "api::article.article", "api::service.service", "api::faq.faq",
    "api::job.job", "api::banner.banner", "api::video.video", "api::award.award",
  ]);
  const roles = await strapi.db.query("admin::role").findMany({ where: { code: { $in: ["strapi-editor", "strapi-author"] } } });
  for (const role of roles) {
    const perms = await strapi.db.query("admin::permission").findMany({ where: { role: role.id } });
    let changed = 0;
    for (const p of perms) {
      const isCM = typeof p.action === "string" && p.action.startsWith("plugin::content-manager.explorer");
      if (!isCM || !I18N_SUBJECTS.has(p.subject)) continue;
      const props = p.properties || {};
      const cur: string[] = Array.isArray(props.locales) ? props.locales : [];
      const merged = Array.from(new Set([...cur, ...locales]));
      if (merged.length !== cur.length) {
        await strapi.db.query("admin::permission").update({ where: { id: p.id }, data: { properties: { ...props, locales: merged } } });
        changed++;
      }
    }
    if (changed) strapi.log.info(`[seed] granted locales [${locales.join(",")}] to role ${role.code} (${changed} perms)`);
  }
}

/* ---------- Admin editors ผูกกับ tenant (per-tenant RBAC) ---------- */
export async function seedEditors(strapi: any) {
  const role = await strapi.db.query("admin::role").findOne({ where: { code: "strapi-editor" } });
  if (!role) {
    strapi.log.warn("[seed] editor role (strapi-editor) not found — skip editor seeding");
    return;
  }
  const editors = [
    { email: "dga-editor@dga.local", firstname: "DGA", lastname: "Editor", password: "DgaEd@2569" },
    { email: "pea-editor@pea.local", firstname: "PEA", lastname: "Editor", password: "PeaEd@2569" },
  ];
  for (const e of editors) {
    const existing = await strapi.db.query("admin::user").findOne({ where: { email: e.email } });
    if (existing) continue;
    try {
      await strapi.service("admin::user").create({
        email: e.email, firstname: e.firstname, lastname: e.lastname,
        password: e.password, roles: [role.id], isActive: true,
      });
      strapi.log.info(`[seed] admin editor ${e.email} created (role=Editor)`);
    } catch (err: any) {
      strapi.log.warn(`[seed] could not create editor ${e.email}: ${err.message}`);
    }
  }
}

/* ---------- Jobs (อ่านจาก jobs-data.js ของจริงเพื่อความตรงกัน th+en) ---------- */
export async function seedJobs(strapi: any) {
  const count = await strapi.documents("api::job.job").count();
  if (count > 0) {
    strapi.log.info("[seed] jobs already present — skipping");
    return;
  }
  const jobsFile = path.resolve(process.cwd(), "..", "site", "DGA-Website", "assets", "jobs-data.js");
  if (!fs.existsSync(jobsFile)) {
    strapi.log.warn("[seed] jobs-data.js not found — skipping jobs");
    return;
  }
  const sandbox: any = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(jobsFile, "utf8"), sandbox);
  const jobs = sandbox.window.DGA_JOBS || [];
  const P = { status: "published" as const };

  for (const j of jobs) {
    const shared = { jobId: j.id, deptKey: j.deptKey, typeKey: j.typeKey, openings: j.openings };
    const loc = (lng: "th" | "en") => ({
      ...shared,
      title: j.title?.[lng], dept: j.dept?.[lng], type: j.type?.[lng],
      location: j.location?.[lng], salary: j.salary?.[lng], deadline: j.deadline?.[lng],
      summary: j.summary?.[lng],
      responsibilities: j.responsibilities?.[lng] || [],
      qualifications: j.qualifications?.[lng] || [],
      benefits: j.benefits?.[lng] || [],
    });
    const doc = await strapi.documents("api::job.job").create({ locale: "th", ...P, data: loc("th") });
    await strapi.documents("api::job.job").update({ documentId: doc.documentId, locale: "en", ...P, data: loc("en") });
  }
  strapi.log.info(`[seed] seeded ${jobs.length} jobs (th+en) ✔`);
}

/* ---------- รายการสาธิตสำหรับหน้า "ติดตามสถานะ" (ให้ปุ่มตัวอย่างทำงานกับ API) ---------- */
export async function seedDemos(strapi: any) {
  if ((await strapi.documents("api::complaint.complaint").count()) === 0) {
    await strapi.documents("api::complaint.complaint").create({
      data: {
        ref: "DGA-CMP-2569-100001",
        type: "ปัญหาระบบ/เว็บไซต์/แอป",
        subject: "ตัวอย่าง: เข้าสู่ระบบ ThaID ไม่ได้",
        detail: "รายการตัวอย่างสำหรับสาธิตการติดตามสถานะเรื่องร้องเรียน",
        anonymous: false, name: "ผู้ยื่นตัวอย่าง", email: "", phone: "",
        date: "10 มิ.ย. 2569", stage: 2,
        steps: [
          { t: "รับเรื่องแล้ว", time: "10 มิ.ย. 2569", d: "ระบบได้รับเรื่องร้องเรียนของท่าน" },
          { t: "มอบหมายผู้รับผิดชอบ", time: "11 มิ.ย. 2569", d: "ส่งต่อให้หน่วยงานที่เกี่ยวข้อง" },
          { t: "กำลังดำเนินการ", time: "12 มิ.ย. 2569", d: "อยู่ระหว่างตรวจสอบและแก้ไข" },
          { t: "ดำเนินการเสร็จสิ้น", time: "—", d: "" },
        ],
      },
    });
    strapi.log.info("[seed] demo complaint DGA-CMP-2569-100001 created");
  }
  if ((await strapi.documents("api::application.application").count()) === 0) {
    await strapi.documents("api::application.application").create({
      data: {
        ref: "DGA-JOB-2569-100001", jobId: "fullstack-dev",
        position: "นักพัฒนาระบบ (Full-stack Developer)",
        name: "ผู้สมัครตัวอย่าง", email: "", phone: "",
        date: "10 มิ.ย. 2569", stage: 2,
      },
    });
    strapi.log.info("[seed] demo application DGA-JOB-2569-100001 created");
  }
}
