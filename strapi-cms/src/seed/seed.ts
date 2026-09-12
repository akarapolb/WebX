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
    "api::contact-message.contact-message": ["create"],
    "api::download.download": ["find", "findOne"],
    "api::ebook.ebook": ["find", "findOne"],
    "api::gallery.gallery": ["find", "findOne"],
    "api::popup.popup": ["find", "findOne"],
    "api::poll.poll": ["find", "findOne"],
    "api::landing.landing": ["find", "findOne"],
    "api::page.page": ["find", "findOne"],
    "api::block-type.block-type": ["find", "findOne"],
    "api::icon.icon": ["find", "findOne"],
    "api::ab-event.ab-event": ["create"],
    "api::blog.blog": ["find", "findOne"],
    "api::catalog.catalog": ["find", "findOne"],
    "api::weblink.weblink": ["find", "findOne"],
    "api::top-graphic.top-graphic": ["find", "findOne"],
    "api::event.event": ["find", "findOne"],
    "api::location.location": ["find", "findOne"],
    "api::sitemap-node.sitemap-node": ["find", "findOne"],
    "api::menu-item.menu-item": ["find", "findOne"],
    // Breaking-news banner — fetched live by the browser (not baked into
    // static build output), so this is the ONE thing on the public site
    // that needs no build/rebuild to go live; see components/
    // BreakingNewsBanner.tsx.
    "api::breaking-news.breaking-news": ["find", "findOne"],
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
    "api::download.download", "api::ebook.ebook", "api::gallery.gallery", "api::popup.popup", "api::poll.poll",
    "api::landing.landing",
    "api::blog.blog", "api::catalog.catalog", "api::weblink.weblink", "api::top-graphic.top-graphic",
    "api::event.event", "api::location.location", "api::sitemap-node.sitemap-node",
    "api::menu-item.menu-item", "api::contact-message.contact-message",
  ];
  for (const uid of uids) {
    const rows = await strapi.db.query(uid).findMany({ where: { tenant: null }, select: ["id"], limit: 10000 });
    for (const r of rows) {
      await strapi.db.query(uid).update({ where: { id: r.id }, data: { tenant: dgaId } });
    }
    if (rows.length) strapi.log.info(`[seed] backfilled tenant=dga on ${rows.length} rows of ${uid}`);
  }
}

/* ---------- ตัวอย่างหน้า Landing (no-code page builder) ของ dga ---------- */
export async function seedLanding(strapi: any) {
  const dgaId = await dgaTenantId(strapi);
  if (!dgaId) return;
  const existing = await strapi.db.query("api::landing.landing").findMany({ where: { slug: "thaid" }, select: ["id"], limit: 1 });
  if (existing.length) return; // seed แล้ว
  await strapi.documents("api::landing.landing").create({
    status: "published",
    data: {
      title: "ThaID — พิสูจน์และยืนยันตัวตนดิจิทัล",
      slug: "thaid",
      active: true,
      seoDescription: "บริการพิสูจน์และยืนยันตัวตนทางดิจิทัลของภาครัฐ สมัครครั้งเดียว ใช้ได้กับบริการรัฐทั่วประเทศ",
      tenant: dgaId,
      blocks: [
        {
          __component: "block.hero",
          kicker: "Digital ID",
          heading: "ThaID — ดิจิทัลไอดีของคนไทย",
          subheading: "พิสูจน์และยืนยันตัวตนทางดิจิทัลครั้งเดียว ใช้บริการภาครัฐได้ทุกที่ ทุกเวลา ปลอดภัยตามมาตรฐาน",
          ctaLabel: "เริ่มลงทะเบียน",
          ctaUrl: "register.html",
          align: "center",
        },
        {
          __component: "block.feature-grid",
          heading: "ทำไมต้อง ThaID",
          columns: "3",
          items: [
            { icon: "i-id", title: "ยืนยันตัวตนครั้งเดียว", text: "สมัครครั้งเดียวใช้ได้กับบริการภาครัฐที่รองรับทั่วประเทศ" },
            { icon: "i-shield", title: "ปลอดภัยมาตรฐานสูง", text: "เข้ารหัสข้อมูลและยืนยันตัวตนหลายชั้นตามมาตรฐานสากล" },
            { icon: "i-check", title: "สะดวก รวดเร็ว", text: "ลดการเดินทางและการใช้เอกสารกระดาษ ทำธุรกรรมได้จากมือถือ" },
          ],
        },
        {
          __component: "block.richtext",
          body: "## ขั้นตอนการลงทะเบียน\n\n1. ดาวน์โหลดแอป ThaID\n2. ถ่ายรูปบัตรประชาชนและยืนยันใบหน้า\n3. ตั้งรหัส PIN เพื่อใช้งาน\n\nเมื่อลงทะเบียนเสร็จ ท่านสามารถใช้ ThaID เข้าสู่ระบบบริการภาครัฐที่รองรับได้ทันที",
        },
        {
          __component: "block.cta-banner",
          heading: "พร้อมเริ่มใช้งานแล้วหรือยัง?",
          text: "ลงทะเบียน ThaID วันนี้ เพื่อเข้าถึงบริการดิจิทัลภาครัฐได้อย่างสะดวกปลอดภัย",
          buttonLabel: "ลงทะเบียนเลย",
          buttonUrl: "register.html",
          theme: "primary",
        },
      ],
    },
  });
  strapi.log.info("[seed] demo landing 'thaid' created for dga");
}

/* ---------- Group A: Blog / e-catalog / Web Link / Top Graphic (ปิด gap TOR ภาคผนวก ก) ---------- */
export async function seedGroupA(strapi: any) {
  const dgaId = await dgaTenantId(strapi);
  if (!dgaId) return;
  const P = { status: "published" as const };

  if ((await strapi.db.query("api::blog.blog").count()) === 0) {
    const blogs = [
      { title: "เปิดมุมมอง: รัฐบาลดิจิทัลกับชีวิตประจำวัน", category: "บทความ", author: "ทีมบรรณาธิการ สพร.", publishDate: "2026-06-10", views: 420, excerpt: "บริการดิจิทัลภาครัฐเปลี่ยนวิธีที่ประชาชนติดต่อราชการอย่างไร", body: "## รัฐบาลดิจิทัลใกล้ตัวกว่าที่คิด\n\nตั้งแต่การยืนยันตัวตนด้วย ThaID ไปจนถึงการรับบริการผ่านแอป “ทางรัฐ” เทคโนโลยีดิจิทัลช่วยลดเวลาและเอกสารกระดาษ" },
      { title: "เบื้องหลังการออกแบบบริการที่ยึดประชาชนเป็นศูนย์กลาง", category: "ดีไซน์", author: "ทีม UX สพร.", publishDate: "2026-06-04", views: 268, excerpt: "หลักคิด Human-Centered Design ในบริการภาครัฐ", body: "## ออกแบบจากความต้องการจริง\n\nการวิจัยผู้ใช้และการทดสอบกับประชาชนคือหัวใจของบริการที่ดี" },
      { title: "ความมั่นคงปลอดภัยไซเบอร์ที่ทุกคนควรรู้", category: "ความปลอดภัย", author: "ทีมความมั่นคงปลอดภัย", publishDate: "2026-05-29", views: 173, excerpt: "เคล็ดลับป้องกันภัยไซเบอร์เบื้องต้นสำหรับประชาชน", body: "## ตั้งรหัสผ่านให้แข็งแรง\n\nใช้รหัสผ่านที่ไม่ซ้ำกันและเปิด MFA ทุกครั้งที่ทำได้" },
    ];
    for (const b of blogs) await strapi.documents("api::blog.blog").create({ ...P, data: { ...b, tenant: dgaId } });
    strapi.log.info("[seed] blogs created (dga)");
  }

  if ((await strapi.db.query("api::catalog.catalog").count()) === 0) {
    const cats = [
      { title: "คู่มือบริการดิจิทัลภาครัฐ 2569", description: "รวมบริการดิจิทัลที่ประชาชนใช้ได้จริง พร้อมขั้นตอน", category: "คู่มือ", order: 1 },
      { title: "แคตตาล็อกมาตรฐานข้อมูลภาครัฐ", description: "มาตรฐานและแนวทางการเชื่อมโยงข้อมูลระหว่างหน่วยงาน", category: "มาตรฐาน", order: 2 },
      { title: "บริการ API ของ สพร.", description: "รายการ API กลางสำหรับนักพัฒนาภาครัฐ", category: "นักพัฒนา", order: 3 },
    ];
    for (const c of cats) await strapi.documents("api::catalog.catalog").create({ ...P, data: { ...c, tenant: dgaId } });
    strapi.log.info("[seed] catalogs created (dga)");
  }

  if ((await strapi.db.query("api::weblink.weblink").count()) === 0) {
    const links = [
      { title: "ระบบ e-Service ภาครัฐ", url: "https://www.egov.go.th", description: "ศูนย์รวมบริการอิเล็กทรอนิกส์ภาครัฐ", displayType: "button", openNewTab: true, category: "บริการ", order: 1 },
      { title: "พอร์ทัลข้อมูลเปิดภาครัฐ", url: "https://data.go.th", description: "Open Government Data ของประเทศไทย", displayType: "button", openNewTab: true, category: "ข้อมูลเปิด", order: 2 },
      { title: "แอปพลิเคชัน ทางรัฐ", url: "https://www.dga.or.th", description: "บริการภาครัฐในแอปเดียว", displayType: "button", openNewTab: true, category: "บริการ", order: 3 },
      { title: "ศูนย์เทคโนโลยีสารสนเทศภาครัฐ", url: "https://www.dga.or.th", description: "ความรู้และมาตรฐานดิจิทัลภาครัฐ", displayType: "button", openNewTab: true, category: "ความรู้", order: 4 },
    ];
    for (const l of links) await strapi.documents("api::weblink.weblink").create({ ...P, data: { ...l, tenant: dgaId } });
    strapi.log.info("[seed] weblinks created (dga)");
  }

  if ((await strapi.db.query("api::top-graphic.top-graphic").count()) === 0) {
    const tops = [
      { title: "ประกาศ: ยกระดับบริการดิจิทัลภาครัฐ 2569", linkUrl: "landing.html?slug=thaid", transition: "fade", order: 1 },
      { title: "เปิดรับฟังความคิดเห็นแผนพัฒนารัฐบาลดิจิทัล", linkUrl: "#", transition: "slide", order: 2 },
    ];
    for (const t of tops) await strapi.documents("api::top-graphic.top-graphic").create({ ...P, data: { ...t, tenant: dgaId } });
    strapi.log.info("[seed] top-graphics created (dga)");
  }

  if ((await strapi.db.query("api::event.event").count()) === 0) {
    const events = [
      { title: "เปิดรับฟังความคิดเห็นแผนพัฒนารัฐบาลดิจิทัล", start: "2026-06-12T00:00:00.000Z", allDay: true, category: "ประชาพิจารณ์", color: "green", location: "ออนไลน์", description: "ร่วมแสดงความคิดเห็นต่อร่างแผนพัฒนารัฐบาลดิจิทัล" },
      { title: "อบรมการใช้งาน ThaID สำหรับเจ้าหน้าที่", start: "2026-06-20T02:00:00.000Z", end: "2026-06-20T06:00:00.000Z", category: "อบรม", color: "blue", location: "สพร. ชั้น 17", description: "อบรมเชิงปฏิบัติการการพิสูจน์และยืนยันตัวตนดิจิทัล" },
      { title: "สัมมนารัฐบาลดิจิทัล 2569", start: "2026-06-25T06:00:00.000Z", end: "2026-06-25T09:00:00.000Z", category: "สัมมนา", color: "amber", location: "ศูนย์ประชุมแห่งชาติสิริกิติ์", description: "ทิศทางรัฐบาลดิจิทัลและบริการภาครัฐยุคใหม่" },
      { title: "Workshop: Open Government Data", start: "2026-06-28T03:00:00.000Z", end: "2026-06-28T08:00:00.000Z", category: "เวิร์กช็อป", color: "purple", location: "DGA Academy", description: "ปฏิบัติการการเปิดเผยและใช้ประโยชน์ข้อมูลภาครัฐ" },
    ];
    for (const e of events) await strapi.documents("api::event.event").create({ ...P, data: { ...e, tenant: dgaId } });
    strapi.log.info("[seed] events created (dga)");
  }

  if ((await strapi.db.query("api::location.location").count()) === 0) {
    const locs = [
      { name: "สพร. (สำนักงานใหญ่) อาคาร TIJ", lat: 13.8869, lng: 100.561, address: "ชั้น 4 อาคาร TIJ เลขที่ 999 ถนนแจ้งวัฒนะ แขวงทุ่งสองห้อง เขตหลักสี่ กรุงเทพฯ 10210", phone: "0-2612-6000", category: "สำนักงาน" },
      { name: "ศูนย์ราชการเฉลิมพระเกียรติ แจ้งวัฒนะ", lat: 13.8896, lng: 100.565, address: "ถนนแจ้งวัฒนะ เขตหลักสี่ กรุงเทพฯ", phone: "0-2142-1234", category: "จุดบริการ" },
      { name: "DGA Academy (อาคารบางกอกไทยทาวเวอร์)", lat: 13.7563, lng: 100.5388, address: "ถนนรางน้ำ เขตราชเทวี กรุงเทพฯ", phone: "0-2612-6060", category: "ฝึกอบรม" },
      { name: "จุดบริการ ทางรัฐ (สยาม)", lat: 13.746, lng: 100.534, address: "สยามสแควร์ เขตปทุมวัน กรุงเทพฯ", phone: "1111", category: "จุดบริการ" },
    ];
    for (const l of locs) await strapi.documents("api::location.location").create({ ...P, data: { ...l, tenant: dgaId } });
    strapi.log.info("[seed] locations created (dga)");
  }

  if ((await strapi.db.query("api::sitemap-node.sitemap-node").count()) === 0) {
    const nodes = [
      { group: "บริการประชาชน", label: "ลงทะเบียน ThaID", url: "register.html", order: 1 },
      { group: "บริการประชาชน", label: "ตรวจสอบสถานะ", url: "application-status.html", order: 2 },
      { group: "บริการประชาชน", label: "รับเรื่องร้องเรียน", url: "complaint.html", order: 3 },
      { group: "ข้อมูลและข่าวสาร", label: "ข่าวประชาสัมพันธ์", url: "index.html", order: 1 },
      { group: "ข้อมูลและข่าวสาร", label: "บล็อก", url: "blog.html", order: 2 },
      { group: "ข้อมูลและข่าวสาร", label: "แคตตาล็อก (e-catalog)", url: "catalog.html", order: 3 },
      { group: "ข้อมูลและข่าวสาร", label: "ปฏิทินกิจกรรม", url: "calendar.html", order: 4 },
      { group: "เกี่ยวกับเรา", label: "หน้าแรก", url: "index.html", order: 1 },
      { group: "เกี่ยวกับเรา", label: "ลิงก์ที่เกี่ยวข้อง", url: "links.html", order: 2 },
      { group: "เกี่ยวกับเรา", label: "แผนที่ที่ตั้ง", url: "map.html", order: 3 },
      { group: "เกี่ยวกับเรา", label: "ค้นหา", url: "search.html", order: 4 },
      { group: "ร่วมงานกับเรา", label: "ตำแหน่งงาน", url: "careers.html", order: 1 },
    ];
    for (const n of nodes) await strapi.documents("api::sitemap-node.sitemap-node").create({ ...P, data: { ...n, tenant: dgaId } });
    strapi.log.info("[seed] sitemap-nodes created (dga)");
  }
}

/* ---------- TOR ข้อ 4: เมนูหลักจาก CMS + tags + related content ---------- */
export async function seedCmsCore(strapi: any) {
  const dgaId = await dgaTenantId(strapi);
  if (!dgaId) return;
  const P = { status: "published" as const };

  // 4.1 เมนูหลัก (mega-menu) จาก CMS
  if ((await strapi.db.query("api::menu-item.menu-item").count()) === 0) {
    const items = [
      { menu: "service", column: "สำหรับประชาชน", label: "บัตรประชาชนดิจิทัล (ThaID)", url: "landing.html?slug=thaid", order: 1 },
      { menu: "service", column: "สำหรับประชาชน", label: "แอปทางรัฐ", url: "#", order: 2 },
      { menu: "service", column: "สำหรับหน่วยงานรัฐ", label: "GDX ศูนย์แลกเปลี่ยนข้อมูล", url: "#", order: 1 },
      { menu: "service", column: "นักพัฒนา/ธุรกิจ", label: "ข้อมูลเปิดภาครัฐ (Open Data)", url: "links.html", order: 1 },
      { menu: "news", column: "ข่าว & ประกาศ", label: "ข่าวประชาสัมพันธ์", url: "news.html", order: 1 },
      { menu: "news", column: "บทความ & ความรู้", label: "บทความ & บล็อก", url: "blog.html", order: 1 },
      { menu: "news", column: "บทความ & ความรู้", label: "แคตตาล็อก (e-catalog)", url: "catalog.html", order: 2 },
      { menu: "news", column: "สื่อ & กิจกรรม", label: "คลังวิดีโอ (DGA Channel)", url: "video.html", order: 1 },
      { menu: "news", column: "สื่อ & กิจกรรม", label: "คลังภาพ", url: "gallery.html", order: 2 },
      { menu: "news", column: "สื่อ & กิจกรรม", label: "ปฏิทินกิจกรรม", url: "calendar.html", order: 3 },
      { menu: "eservice", column: "ลงทะเบียน & สมัครงาน", label: "ลงทะเบียนผู้ใช้งานระบบ", url: "register.html", order: 1 },
      { menu: "eservice", column: "ลงทะเบียน & สมัครงาน", label: "ระบบรับสมัครงาน", url: "careers.html", order: 2 },
      { menu: "eservice", column: "ร้องเรียน & ข้อเสนอแนะ", label: "ระบบรับเรื่องร้องเรียน", url: "complaint.html", order: 1 },
      { menu: "eservice", column: "บริการช่วยเหลือ", label: "ดาวน์โหลดเอกสาร", url: "download.html", order: 1 },
      { menu: "eservice", column: "บริการช่วยเหลือ", label: "คำถามที่พบบ่อย (FAQ)", url: "faq.html", order: 2 },
      { menu: "eservice", column: "บริการช่วยเหลือ", label: "ติดต่อสอบถาม", url: "contact.html", order: 3 },
      { menu: "about", column: "องค์กร", label: "วิสัยทัศน์ & บทบาท", url: "#", order: 1 },
      { menu: "about", column: "เผยแพร่", label: "แผนที่ & ติดต่อ", url: "map.html", order: 1 },
      { menu: "about", column: "ธรรมาภิบาล & ลิงก์", label: "ลิงก์ที่เกี่ยวข้อง", url: "links.html", order: 1 },
      { menu: "about", column: "ธรรมาภิบาล & ลิงก์", label: "แผนผังเว็บไซต์", url: "sitemap.html", order: 2 },
    ];
    for (const it of items) await strapi.documents("api::menu-item.menu-item").create({ ...P, data: { ...it, tenant: dgaId } });
    strapi.log.info(`[seed] menu-items created (${items.length})`);
  }

  // backfill slug (บทความเดิม seed มาไม่มี slug) + 4.2 Tags
  const arts = await strapi.db.query("api::article.article")
    .findMany({ where: { tenant: dgaId, publishedAt: { $notNull: true } }, select: ["id", "documentId", "title", "categoryLabel", "tags", "slug"], orderBy: { id: "asc" }, limit: 30 });
  const slugify = (s: string, id: number) => {
    const base = String(s || "").trim().toLowerCase().replace(/[^\w฀-๿]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
    return base ? base + "-" + id : "article-" + id;
  };
  const pool = ["ThaID", "บริการดิจิทัล", "ทางรัฐ", "ข้อมูลเปิด", "รัฐบาลดิจิทัล", "นวัตกรรม", "ความปลอดภัย", "AI"];
  let ti = 0, si = 0;
  for (const a of arts) {
    const patch: any = {};
    if (!a.slug) { patch.slug = slugify(a.title, a.id); si++; }
    if (!a.tags || !a.tags.length) { patch.tags = Array.from(new Set([a.categoryLabel, pool[ti % pool.length], pool[(ti + 1) % pool.length]].filter(Boolean))); ti++; }
    if (Object.keys(patch).length) await strapi.db.query("api::article.article").update({ where: { id: a.id }, data: patch });
  }
  if (si) strapi.log.info(`[seed] slugs backfilled on ${si} articles`);
  if (ti) strapi.log.info(`[seed] tags added to ${ti} articles`);

  // same gap as articles had (seedGroupA's blogs never got an explicit
  // slug either) — surfaced by Collection Page needing a real, non-null
  // identifier to link a blog card to its own detail page.
  const blogsNoSlug = await strapi.db.query("api::blog.blog")
    .findMany({ where: { tenant: dgaId, publishedAt: { $notNull: true }, slug: null }, select: ["id", "title"], limit: 100 });
  for (const b of blogsNoSlug) await strapi.db.query("api::blog.blog").update({ where: { id: b.id }, data: { slug: slugify(b.title, b.id) } });
  if (blogsNoSlug.length) strapi.log.info(`[seed] slugs backfilled on ${blogsNoSlug.length} blogs`);

  if (arts.length >= 3) {
    const first = await strapi.db.query("api::article.article").findOne({ where: { id: arts[0].id }, populate: { related: true } });
    if (!first?.related || !first.related.length) {
      await strapi.documents("api::article.article").update({ documentId: arts[0].documentId, data: { related: [arts[1].documentId, arts[2].documentId] } });
      await strapi.documents("api::article.article").publish({ documentId: arts[0].documentId });
      await strapi.documents("api::article.article").update({ documentId: arts[1].documentId, data: { related: [arts[0].documentId, arts[2].documentId] } });
      await strapi.documents("api::article.article").publish({ documentId: arts[1].documentId });
      strapi.log.info("[seed] related articles linked");
    }
  }
}

/* ---------- Enrich Group B: แนบรูปให้ gallery + thumbnail/YouTube ให้ video (เดโมจริง) ---------- */
export async function enrichGroupB(strapi: any) {
  const cache = new Map<string, number | null>();
  async function up(file: string): Promise<number | null> {
    if (cache.has(file)) return cache.get(file)!;
    const fp = path.join(IMG_DIR, file);
    if (!fs.existsSync(fp)) { cache.set(file, null); return null; }
    const st = fs.statSync(fp);
    const [u] = await strapi.plugin("upload").service("upload").upload({
      data: { fileInfo: { name: file, alternativeText: file } },
      files: { filepath: fp, originalFileName: file, mimetype: mimeOf(file), size: st.size },
    });
    const id = u?.id ?? null; cache.set(file, id); return id;
  }

  // galleries: แนบ cover + images ถ้ายังว่าง
  const gals = await strapi.documents("api::gallery.gallery").findMany({ populate: ["images"], limit: 50 });
  const poolA = ["article-1.jpg", "article-2.jpg", "article-3.jpg", "article-4.jpg", "article-5.jpg"];
  const poolB = ["banner-1.png", "banner-2.png", "banner-3.png", "banner-4.png", "banner-5.png", "banner-6.png"];
  let gi = 0;
  for (const g of gals) {
    const imgs = g.images || [];
    // re-upload ถ้ายังไม่มีภาพ หรือภาพเดิมยังไม่ถูก optimize (ไม่มี formats) → ได้ responsive/บีบอัด
    const optimized = imgs.length && imgs[0] && imgs[0].formats;
    if (optimized) continue;
    const pool = gi % 2 === 0 ? poolA : poolB; gi++;
    const ids = (await Promise.all(pool.map(up))).filter(Boolean) as number[];
    if (!ids.length) continue;
    await strapi.documents("api::gallery.gallery").update({ documentId: g.documentId, data: { coverImage: ids[0], images: ids } });
    await strapi.documents("api::gallery.gallery").publish({ documentId: g.documentId });
  }
  if (gi) strapi.log.info(`[seed] (re)optimized images on ${gi} galleries`);

  // videos: ใส่ thumbnail จริง + YouTube (วิดีโอโอเพนซอร์ส เป็นตัวอย่างที่ปลอดภัย) ถ้า url ยังเป็น '#'
  const vids = await strapi.documents("api::video.video").findMany({ limit: 50 });
  const yt = ["aqz-KE-bpKQ", "eRsGyueVLvQ", "R6MlUcmOul8"]; // Big Buck Bunny / Sintel / Tears of Steel (open content)
  const vthumb = ["article-1.jpg", "article-2.jpg", "article-3.jpg", "article-4.jpg", "article-5.jpg", "banner-7.png"];
  let vi = 0;
  for (const v of vids) {
    if (v.videoUrl && v.videoUrl !== "#") continue;
    const tid = await up(vthumb[vi % vthumb.length]);
    await strapi.documents("api::video.video").update({ documentId: v.documentId, data: { videoUrl: "https://www.youtube.com/watch?v=" + yt[vi % yt.length], thumbnail: tid || undefined } });
    await strapi.documents("api::video.video").publish({ documentId: v.documentId });
    vi++;
  }
  if (vi) strapi.log.info(`[seed] enriched ${vi} videos with thumbnail+url`);

  // ค่าเริ่มต้น template/watermark ต่อ tenant (no-code theme + ลายน้ำ)
  const tdefs: Record<string, any> = {
    dga: { template: { preset: "a", background: "" }, watermark: { enabled: true, text: "สพร. • DGA" } },
    pea: { template: { preset: "b", background: "" }, watermark: { enabled: true, text: "กฟภ. • PEA" } },
  };
  for (const [key, def] of Object.entries(tdefs)) {
    const t = await strapi.db.query("api::tenant.tenant").findOne({ where: { key }, select: ["id", "template", "watermark"] });
    if (t && !t.template) await strapi.db.query("api::tenant.tenant").update({ where: { id: t.id }, data: def });
  }
  strapi.log.info("[seed] tenant template/watermark defaults ensured");
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

/** ปิดช่องโหว่: content type ที่เปิด i18n (I18N_SUBJECTS ด้านบน) ไม่เคยได้รับสิทธิ์
 * publish (Editor) / delete (Editor, Author) มาตั้งแต่แรก — ต่างจาก content type
 * อื่นที่มีสิทธิ์เต็มทุกตัว (พบตอนทดสอบ publish ของ Phase 6 ที่ dga-editor แก้ไข/สร้าง
 * ได้ปกติแต่ publish ไม่ได้เลย, 403 จาก Strapi เอง ไม่ใช่จาก governance.ts). Needs
 * properties.locales populated same as create/read/update — an i18n-enabled
 * subject's permission with no locales key means an EMPTY allow-list (deny
 * all), not "unrestricted"; confirmed by testing: an empty-properties row
 * still 403'd until locales were added here too. */
export async function ensureEditorPublishPermissions(strapi: any) {
  let locales: string[] = [];
  try {
    const list = await strapi.plugin("i18n").service("locales").find();
    locales = (list || []).map((l: any) => l.code);
  } catch (e) { /* no i18n plugin / no locales yet — fall back to no locale restriction below */ }

  const I18N_SUBJECTS = [
    "api::home-page.home-page", "api::article.article", "api::service.service", "api::faq.faq",
    "api::job.job", "api::banner.banner", "api::video.video", "api::award.award",
  ];
  const WANT: Record<string, string[]> = {
    "strapi-editor": ["delete", "publish"],
    "strapi-author": ["delete"],
  };
  const roles = await strapi.db.query("admin::role").findMany({ where: { code: { $in: Object.keys(WANT) } } });
  for (const role of roles) {
    const existing = await strapi.db.query("admin::permission").findMany({ where: { role: role.id } });
    const have = new Set(existing.map((p: any) => p.action + "|" + p.subject));
    let created = 0;
    for (const subject of I18N_SUBJECTS) {
      for (const action of WANT[role.code]) {
        const key = `plugin::content-manager.explorer.${action}|${subject}`;
        if (have.has(key)) continue;
        await strapi.db.query("admin::permission").create({
          data: {
            action: `plugin::content-manager.explorer.${action}`, actionParameters: {}, subject,
            properties: locales.length ? { locales } : {}, conditions: [], role: role.id,
          },
        });
        created++;
      }
    }
    if (created) strapi.log.info(`[seed] granted ${created} missing delete/publish perms to role ${role.code}`);
  }
}

/** ปิดช่องโหว่อีกจุด: api::page.page และ api::landing.landing (หน้า Visual
 * Builder no-code) ไม่เคยได้รับสิทธิ์ Editor เลยสักตัว (create/read/update/
 * delete/publish) — ต่างจาก api::home-page.home-page ที่มีสิทธิ์เต็มมาตั้งแต่
 * seed แรก. คาดว่าเป็นเพราะสองตัวนี้ถูกเพิ่มเข้ามาทีหลัง หลัง Strapi sync
 * default permission ให้ role Editor ไปแล้วครั้งเดียวตอน bootstrap แรกสุด —
 * content type ใหม่ที่เพิ่มมาทีหลังไม่ได้ sync ย้อนหลังให้อัตโนมัติ. พบตอน
 * ทดสอบ dga-editor สร้างหน้าใหม่ใน Visual Builder ไม่ได้เลย (403 ตั้งแต่ create). */
export async function ensurePageBuilderEditorPermissions(strapi: any) {
  // api::page-template.page-template joins this list for exactly the same
  // reason the two above are here: it was added long after the one-time
  // bootstrap sync, so an Editor would get a silent 403 the first time they
  // opened the Builder's Templates tab or hit "Save as template". Authors
  // are deliberately NOT granted — templates are a page-building action, and
  // widening this function's role coverage would also silently hand authors
  // page/landing rights they don't have today.
  // api::icon.icon is here for the same reason, found by stress-testing the
  // Builder as a seeded Editor: the Icon Manager's own content-manager fetch
  // (webx-studio's loadIcons) returned 403 for every non-super-admin, so the
  // icon picker silently showed nothing. api::icon.icon HAD been granted to
  // the PUBLIC role (ensurePublicPermissions' find/findOne, for the public
  // REST API) — but never to the admin Editor role, which is what the
  // content-manager endpoint actually checks.
  const SUBJECTS = ["api::page.page", "api::landing.landing", "api::page-template.page-template", "api::icon.icon"];
  const ACTIONS = ["create", "read", "update", "delete", "publish"];
  const role = await strapi.db.query("admin::role").findOne({ where: { code: "strapi-editor" } });
  if (!role) return;
  const existing = await strapi.db.query("admin::permission").findMany({ where: { role: role.id } });
  const have = new Set(existing.map((p: any) => p.action + "|" + p.subject));
  let created = 0;
  for (const subject of SUBJECTS) {
    for (const action of ACTIONS) {
      const key = `plugin::content-manager.explorer.${action}|${subject}`;
      if (have.has(key)) continue;
      await strapi.db.query("admin::permission").create({
        data: { action: `plugin::content-manager.explorer.${action}`, actionParameters: {}, subject, properties: {}, conditions: [], role: role.id },
      });
      created++;
    }
  }
  if (created) strapi.log.info(`[seed] granted ${created} missing page-builder perms (page/landing) to role ${role.code}`);
}

/** ปิดช่องโหว่อีกจุด: create/read/update ของ api::block-type.block-type สำหรับ
 * role Editor/Author ถูก seed ไว้ตั้งแต่แรกด้วย properties.fields แบบ allowlist
 * ตายตัว (["key","name","icon","fieldsSchema","template","tenant"]) — เมื่อเพิ่ม
 * attribute ใหม่ (visualElements, ใช้กับ Visual-mode composer ของ
 * BlockTypeEditor.tsx) เข้าไปใน schema.json แล้ว role strapi-super-admin เอง
 * sync fields list ให้อัตโนมัติทุกครั้งที่ Strapi boot (ผ่าน content-manager
 * plugin's syncConfigurations) แต่ role ที่กำหนด properties.fields เองแบบนี้
 * (Editor/Author) ไม่ถูก sync ตามไปด้วย — เขียน/อ่านฟิลด์ใหม่ผ่าน role เหล่านี้
 * จึงถูก Strapi เงียบ ๆ ตัดทิ้งทั้งขาเขียนและขาอ่าน (ไม่ error, แค่หายไป) พบตอน
 * ทดสอบบันทึก block type ที่สร้างด้วย Visual-mode composer — fieldsSchema/
 * template บันทึกได้ปกติ (อยู่ใน allowlist เดิม) แต่ visualElements หายทุกครั้ง
 * ไม่ว่าจะ restart Strapi กี่รอบก็ตาม เพราะ allowlist ไม่เคยถูกอัปเดต ไม่ใช่
 * ปัญหา cache/timing */
export async function ensureBlockTypeFieldPermissions(strapi: any) {
  const SUBJECT = "api::block-type.block-type";
  const ACTIONS = new Set(["plugin::content-manager.explorer.create", "plugin::content-manager.explorer.read", "plugin::content-manager.explorer.update"]);
  const ADD_FIELD = "visualElements";
  const roles = await strapi.db.query("admin::role").findMany({ where: { code: { $in: ["strapi-editor", "strapi-author"] } } });
  for (const role of roles) {
    const perms = await strapi.db.query("admin::permission").findMany({ where: { role: role.id, subject: SUBJECT } });
    let changed = 0;
    for (const p of perms) {
      if (!ACTIONS.has(p.action)) continue;
      const props = p.properties || {};
      const cur: string[] = Array.isArray(props.fields) ? props.fields : [];
      if (cur.includes(ADD_FIELD)) continue;
      await strapi.db.query("admin::permission").update({ where: { id: p.id }, data: { properties: { ...props, fields: [...cur, ADD_FIELD] } } });
      changed++;
    }
    if (changed) strapi.log.info(`[seed] added ${ADD_FIELD} to ${changed} block-type field allowlists for role ${role.code}`);
  }
}

/* ---------- Admin editors ผูกกับ tenant (per-tenant RBAC) ----------
 * Demo accounts for the two bundled reference tenants (dga/pea) — used by
 * this repo's own e2e suite and by local dev/demo sessions. Same public-repo
 * problem seedScheduler() below already solves for its own account (env
 * override, `docker-compose.yml`'s `:?set ...` enforcing it in production):
 * until a full-codebase audit (2026-09-12) these two ran unconditionally,
 * including in production, with a hardcoded password and NO override at
 * all — a public, well-known credential with standing Editor access on any
 * real self-hosted deploy that left seeding on. Now matches seedScheduler's
 * own pattern exactly: env override, same hardcoded value only as the dev
 * fallback. */
export async function seedEditors(strapi: any) {
  const role = await strapi.db.query("admin::role").findOne({ where: { code: "strapi-editor" } });
  if (!role) {
    strapi.log.warn("[seed] editor role (strapi-editor) not found — skip editor seeding");
    return;
  }
  const editors = [
    { email: "dga-editor@dga.local", firstname: "DGA", lastname: "Editor", password: process.env.DGA_EDITOR_PASSWORD || "DgaEd@2569" },
    { email: "pea-editor@pea.local", firstname: "PEA", lastname: "Editor", password: process.env.PEA_EDITOR_PASSWORD || "PeaEd@2569" },
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

/* ---------- Scheduler service account (Phase 5) ----------
 * webx-studio's release scheduler (lib/cms/governance.ts's
 * processDueReleases, triggered via POST /api/internal/releases/process-due)
 * runs with no browser session to read a token from, so it logs in as this
 * dedicated account instead. Needs Super Admin so effectiveTenant() resolves
 * it as unscoped (sees/publishes across every tenant) — the same "unscoped
 * system caller" convention this file's own effectiveTenant() already uses
 * for seeding. Set STRAPI_SCHEDULER_EMAIL/PASSWORD in webx-studio's env to
 * match whatever this seeds. The password falls back to a fixed dev value
 * only when STRAPI_SCHEDULER_PASSWORD isn't set — a production deploy (see
 * docker-compose.yml's `strapi` service) must set it to something real, or
 * every self-hosted instance would otherwise ship the same well-known
 * super-admin credential (this repo is public). */
export async function seedScheduler(strapi: any) {
  const email = 'scheduler@webx.local';
  const password = process.env.STRAPI_SCHEDULER_PASSWORD || 'WebxSched@2569';
  const existing = await strapi.db.query('admin::user').findOne({ where: { email } });
  if (existing) return;
  const role = await strapi.db.query('admin::role').findOne({ where: { code: 'strapi-super-admin' } });
  if (!role) {
    strapi.log.warn('[seed] super-admin role not found — skip scheduler account seeding');
    return;
  }
  try {
    await strapi.service('admin::user').create({
      email, firstname: 'Release', lastname: 'Scheduler', password, roles: [role.id], isActive: true,
    });
    strapi.log.info(`[seed] scheduler service account ${email} created (role=Super Admin)`);
  } catch (err: any) {
    strapi.log.warn(`[seed] could not create scheduler account: ${err.message}`);
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

/* ---------- ORST / RoyalSociety tenant records (fresh-clone gap) —
   these two WordPress-engine tenants only ever existed in this project's
   own dev database; seedTenants() above's own `want` list has only ever
   had dga/pea, so a genuinely fresh clone's Strapi never created either
   tenant record at all. That silently broke everything downstream for a
   new environment: seedOrstRoyalSocietyJobs() below just logs "tenant not
   found" and skips both, public-site's own /api/tenants/keys and
   /api/tenants/resolve have nothing to serve, and the WordPress side has
   no wtenant term to create in the first place (see
   wordpress/seed-tenants.mjs, which must run before any other WordPress
   seed script). Field values below are this project's own real tenant
   records, queried directly from the running instance — not reconstructed
   from memory — so `domains: null` and ORST's empty `adminEmails` are the
   genuine current values, not an oversight in this seed. */
export async function seedOrstRoyalSocietyTenants(strapi: any) {
  const want = [
    {
      key: "orst", name: "สำนักงานราชบัณฑิตยสภา",
      active: true, engine: "wordpress", publicTemplate: "orst",
      // A dev/demo seed placeholder, matching royalsociety/nbtc's own
      // convention right below — not a real person. Left empty before
      // (see git history), which meant no account could ever resolve as
      // "the ORST admin": Billing/Compliance/Content Audit/AI Search/
      // Content Browse/Onboarding all treat an unresolved tenant as
      // unscoped, and a real deployment should replace this with whoever
      // actually administers orst.go.th before go-live.
      adminEmails: ["orst-editor@orst.local"],
      plan: "enterprise", seats: 3, subscriptionStatus: "active",
      brand: { primaryColor: "#073b34", orgName: { th: "สำนักงานราชบัณฑิตยสภา", en: "Office of the Royal Society of Thailand" } },
      contact: { phone: "0 2141 1728", email: "saraban@orst.go.th", address: { th: "ศูนย์ราชการเฉลิมพระเกียรติฯ อาคารซี ถนนแจ้งวัฒนะ เขตหลักสี่ กรุงเทพมหานคร 10210" } },
      template: { preset: "a", background: "#fbf7ef" },
      footerColumns: [
        { heading: { th: "บริการหลัก" }, links: [{ label: { th: "พจนานุกรม" }, url: "/orst/dictionary" }, { label: { th: "ศัพท์บัญญัติ" }, url: "#" }, { label: { th: "คำทับศัพท์" }, url: "#" }, { label: { th: "ราชาศัพท์" }, url: "#" }] },
        { heading: { th: "องค์ความรู้" }, links: [{ label: { th: "คลังองค์ความรู้" }, url: "/orst/knowledge" }, { label: { th: "E-Book และสิ่งพิมพ์" }, url: "/orst/publications" }, { label: { th: "วารสาร" }, url: "#" }, { label: { th: "สื่อมัลติมีเดีย" }, url: "#" }] },
        { heading: { th: "ข่าวและบริการ" }, links: [{ label: { th: "ข่าวและประกาศ" }, url: "/orst/news" }, { label: { th: "บริการออนไลน์" }, url: "/orst/services" }, { label: { th: "แบบฟอร์มออนไลน์" }, url: "#" }, { label: { th: "คำถามที่พบบ่อย" }, url: "#" }] },
      ],
    },
    {
      key: "royalsociety", name: "ราชบัณฑิตยสภา",
      active: true, engine: "wordpress", publicTemplate: "royalsociety",
      adminEmails: ["royalsociety-editor@royalsociety.local"],
      plan: "enterprise", seats: 3, subscriptionStatus: "active",
      brand: { primaryColor: "#06473f", orgName: { th: "ราชบัณฑิตยสภา", en: "Royal Society of Thailand" } },
      contact: { phone: "0 2481 0347", email: "saraban@royalsociety.go.th", officeHours: "จันทร์ - ศุกร์ 08:30 - 16:30 น.", address: { th: "เลขที่ ๑๒๐ หมู่ ๓ ศูนย์ราชการเฉลิมพระเกียรติ ๘๐ พรรษา ๕ ธันวาคม ๒๕๕๐ อาคารซี แขวงทุ่งสองห้อง เขตหลักสี่ กรุงเทพมหานคร ๑๐๒๑๐" } },
      social: [{ label: "Facebook", url: "#" }, { label: "YouTube", url: "#" }, { label: "Instagram", url: "#" }, { label: "X", url: "#" }],
      template: { preset: "a", background: "#fbf7ef" },
      footerColumns: [
        { heading: { th: "ลิงก์ด่วน" }, links: [{ label: { th: "เกี่ยวกับราชบัณฑิตยสภา" }, url: "/royalsociety/about" }, { label: { th: "คลังองค์ความรู้" }, url: "/royalsociety/knowledge" }, { label: { th: "สิ่งพิมพ์" }, url: "/royalsociety/publications" }, { label: { th: "แผนผังเว็บไซต์" }, url: "#" }] },
        { heading: { th: "บริการยอดนิยม" }, links: [{ label: { th: "สืบค้นพจนานุกรม" }, url: "#" }, { label: { th: "ดาวน์โหลดแบบฟอร์ม" }, url: "#" }, { label: { th: "ส่งคำถาม / ข้อเสนอแนะ" }, url: "#" }, { label: { th: "บริการออนไลน์" }, url: "/royalsociety/services" }] },
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

/* ---------- ตำแหน่งงานว่าง ORST/RoyalSociety (TOR gap audit — "e-forms
   สำหรับสมัครงาน" ไม่เคยมีอยู่จริงสำหรับสอง tenant นี้เลย ทั้งที่ backend
   api::job.job / api::application.application มีอยู่แล้วและเปิด public
   create ให้ application อยู่แล้ว — แค่ไม่มีตำแหน่งงานจริงผูกกับ tenant นี้
   ไว้เลย). ตำแหน่งงานเป็นหมวดทั่วไปตามภารกิจจริงของหน่วยงาน ไม่ใช่ชื่อ
   บุคคลจริง จึงไม่มีความเสี่ยงแบบราชบัณฑิต/ภาคีสมาชิกที่เจอในฟีเจอร์ทำเนียบ
   สมาชิกก่อนหน้านี้. แยก idempotency check ต่อ tenant (ไม่ใช้เงื่อนไข "มี
   job อยู่แล้วข้ามทั้งหมด" แบบ seedJobs เดิม เพราะ DGA jobs ที่ seed ไปก่อน
   จะทำให้ฟังก์ชันนี้ไม่ทำงานเลยถ้าใช้เงื่อนไขเดียวกัน). */
export async function seedOrstRoyalSocietyJobs(strapi: any) {
  const P = { status: "published" as const };
  const TENANTS: { key: string; jobs: any[] }[] = [
    {
      key: "orst",
      jobs: [
        { jobId: "orst-thai-lang-officer", deptKey: "corporate", typeKey: "fulltime", openings: 1, title: "นักวิชาการภาษาไทย", dept: "สำนักงานราชบัณฑิตยสภา", type: "พนักงานราชการ", location: "กรุงเทพมหานคร", salary: "18,000–25,000 บาท/เดือน", deadline: "30 ก.ย. 2569", summary: "ปฏิบัติงานด้านการบัญญัติศัพท์ ตรวจสอบและจัดทำพจนานุกรม และสนับสนุนงานวิชาการด้านภาษาไทย", responsibilities: ["จัดทำและปรับปรุงพจนานุกรมและศัพท์บัญญัติ", "ตอบข้อซักถามด้านภาษาไทยจากประชาชนและหน่วยงาน", "สนับสนุนงานประชุมวิชาการของราชบัณฑิตยสภา"], qualifications: ["ปริญญาตรีสาขาภาษาไทยหรือที่เกี่ยวข้อง", "มีความรู้ด้านหลักภาษาไทยเป็นอย่างดี", "สามารถทำงานเอกสารวิชาการได้"], benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนพิเศษตามระเบียบราชการ", "วันลาตามสิทธิราชการ"] },
        { jobId: "orst-it-officer", deptKey: "tech", typeKey: "fulltime", openings: 1, title: "นักวิชาการคอมพิวเตอร์", dept: "ฝ่ายเทคโนโลยีสารสนเทศ", type: "พนักงานราชการ", location: "กรุงเทพมหานคร", salary: "19,500–27,000 บาท/เดือน", deadline: "30 ก.ย. 2569", summary: "ดูแลระบบสารสนเทศและเว็บไซต์ของสำนักงาน สนับสนุนการให้บริการดิจิทัลแก่ประชาชน", responsibilities: ["ดูแลและพัฒนาระบบสารสนเทศของสำนักงาน", "สนับสนุนการให้บริการออนไลน์แก่ประชาชน", "ประสานงานด้านความมั่นคงปลอดภัยไซเบอร์"], qualifications: ["ปริญญาตรีด้านคอมพิวเตอร์หรือที่เกี่ยวข้อง", "มีความรู้ด้านเว็บและฐานข้อมูล", "สามารถทำงานเป็นทีมได้"], benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนพิเศษตามระเบียบราชการ", "วันลาตามสิทธิราชการ"] },
      ],
    },
    {
      key: "royalsociety",
      jobs: [
        { jobId: "rs-editorial-officer", deptKey: "corporate", typeKey: "fulltime", openings: 1, title: "เจ้าหน้าที่บรรณาธิการ", dept: "ฝ่ายเผยแพร่และสิ่งพิมพ์", type: "พนักงานราชการ", location: "กรุงเทพมหานคร", salary: "18,000–25,000 บาท/เดือน", deadline: "30 ก.ย. 2569", summary: "ตรวจทาน เรียบเรียง และจัดทำต้นฉบับสิ่งพิมพ์และวารสารวิชาการของราชบัณฑิตยสภา", responsibilities: ["ตรวจทานและเรียบเรียงต้นฉบับก่อนเผยแพร่", "ประสานงานกับผู้ทรงคุณวุฒิด้านเนื้อหา", "จัดทำสิ่งพิมพ์และวารสารตามกำหนดการ"], qualifications: ["ปริญญาตรีทุกสาขา", "มีทักษะการเขียนและตรวจทานภาษาไทยที่ดี", "ละเอียดรอบคอบ"], benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนพิเศษตามระเบียบราชการ", "วันลาตามสิทธิราชการ"] },
        { jobId: "rs-research-assistant", deptKey: "corporate", typeKey: "contract", openings: 2, title: "ผู้ช่วยนักวิจัย", dept: "สำนักวิชาการ", type: "จ้างเหมาบริการ", location: "กรุงเทพมหานคร", salary: "16,000–20,000 บาท/เดือน", deadline: "30 ก.ย. 2569", summary: "สนับสนุนงานค้นคว้าและรวบรวมข้อมูลวิชาการให้แก่ราชบัณฑิตและภาคีสมาชิก", responsibilities: ["สืบค้นและรวบรวมข้อมูลวิชาการ", "จัดเตรียมเอกสารประกอบการประชุมวิชาการ", "สนับสนุนงานธุรการของสำนักวิชาการ"], qualifications: ["ปริญญาตรีทุกสาขา", "สามารถค้นคว้าข้อมูลอย่างเป็นระบบ", "ใช้โปรแกรมสำนักงานได้ดี"], benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนตามสัญญาจ้าง"] },
      ],
    },
  ];

  for (const { key, jobs } of TENANTS) {
    const tenant = (await strapi.documents("api::tenant.tenant").findMany({ filters: { key }, fields: ["key"], limit: 1 }))[0];
    if (!tenant) { strapi.log.warn(`[seed] tenant "${key}" not found — skipping its job postings`); continue; }
    const existing = await strapi.db.query("api::job.job").findMany({ where: { tenant: tenant.id }, select: ["id"], limit: 1 });
    if (existing.length) { strapi.log.info(`[seed] ${key} job postings already present — skipping`); continue; }
    for (const j of jobs) await strapi.documents("api::job.job").create({ locale: "th", ...P, data: { ...j, tenant: tenant.id } });
    strapi.log.info(`[seed] seeded ${jobs.length} job posting(s) for ${key} ✔`);
  }
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

/* ---------- โมดูลเนื้อหา (#3): Download / E-book / Gallery / Popup / Poll ---------- */
export async function seedModules(strapi: any) {
  const dga = (await strapi.documents("api::tenant.tenant").findMany({ filters: { key: "dga" }, fields: ["key"], limit: 1 }))[0];
  const pea = (await strapi.documents("api::tenant.tenant").findMany({ filters: { key: "pea" }, fields: ["key"], limit: 1 }))[0];
  if (!dga) return;
  const P = { status: "published" as const };

  if ((await strapi.documents("api::download.download").count()) === 0) {
    // อัปโหลดไฟล์ TOR จริง → lifecycle สกัด full-text อัตโนมัติ (สาธิต TOR 8.3)
    let torFileId: number | null = null;
    try {
      const torPath = path.resolve(process.cwd(), "..", "site", "DGA-Website", "(TOR) DGA-69-0177 1.pdf");
      if (fs.existsSync(torPath)) {
        const stats = fs.statSync(torPath);
        const [up] = await strapi.plugin("upload").service("upload").upload({
          data: { fileInfo: { name: "TOR-DGA-69-0177.pdf", alternativeText: "TOR DGA-69-0177" } },
          files: { filepath: torPath, originalFileName: "TOR-DGA-69-0177.pdf", mimetype: "application/pdf", size: stats.size },
        });
        torFileId = up?.id ?? null;
      }
    } catch (e: any) { strapi.log.warn("[seed] TOR upload failed: " + e.message); }

    const items: any[] = [
      { title: "เอกสาร TOR DGA-69-0177 (ขอบเขตงาน)", description: "ขอบเขตของงานจ้างพัฒนาระบบเว็บไซต์ สพร.", category: "จัดซื้อจัดจ้าง", fileType: "PDF", order: 1, file: torFileId },
      { title: "แบบฟอร์มขอเชื่อมต่อระบบ (GDX)", description: "คำขอเชื่อมต่อแลกเปลี่ยนข้อมูลภาครัฐ", category: "แบบฟอร์ม", fileType: "PDF", fileSize: "240 KB", order: 2 },
      { title: "คู่มือการใช้งานแอปทางรัฐ", description: "คู่มือสำหรับประชาชน", category: "คู่มือ", fileType: "PDF", fileSize: "1.8 MB", order: 3 },
    ];
    for (const d of items) await strapi.documents("api::download.download").create({ ...P, data: { ...d, tenant: dga.id } });
  }
  if ((await strapi.documents("api::ebook.ebook").count()) === 0) {
    const items = [
      { title: "กรอบการพัฒนารัฐบาลดิจิทัล (EA)", author: "สพร.", year: "2567", description: "แนวทางสถาปัตยกรรมองค์กรภาครัฐ", order: 1 },
      { title: "มาตรฐานบริการดิจิทัลภาครัฐ", author: "สพร.", year: "2568", description: "หลักเกณฑ์มาตรฐานบริการดิจิทัล", order: 2 },
    ];
    for (const e of items) await strapi.documents("api::ebook.ebook").create({ ...P, data: { ...e, tenant: dga.id } });
  }
  if ((await strapi.documents("api::gallery.gallery").count()) === 0) {
    const items = [
      { title: "งานสัมมนารัฐบาลดิจิทัล 2568", description: "ภาพบรรยากาศงานสัมมนา", date: "2025-08-15", order: 1 },
      { title: "พิธีลงนาม MOU หน่วยงานพันธมิตร", description: "ความร่วมมือภาครัฐ", date: "2025-06-10", order: 2 },
    ];
    for (const g of items) await strapi.documents("api::gallery.gallery").create({ ...P, data: { ...g, tenant: dga.id } });
  }
  if ((await strapi.documents("api::popup.popup").count()) === 0) {
    await strapi.documents("api::popup.popup").create({ ...P, data: { tenant: dga.id, title: "เริ่มใช้ ThaID วันนี้", body: "ยืนยันตัวตนดิจิทัล ใช้แทนบัตรประชาชนกับบริการภาครัฐทั่วประเทศ ลงทะเบียนฟรีผ่านแอป ThaID", linkUrl: "#", linkLabel: "เริ่มใช้งาน", active: true, priority: 1 } });
    if (pea) await strapi.documents("api::popup.popup").create({ ...P, data: { tenant: pea.id, title: "ชำระค่าไฟผ่าน PEA Smart Plus", body: "สะดวก ทุกที่ทุกเวลา ตรวจสอบยอดและชำระค่าไฟผ่านแอปเดียว", linkUrl: "#", linkLabel: "ดาวน์โหลดแอป", active: true, priority: 1 } });
  }
  if ((await strapi.documents("api::poll.poll").count()) === 0) {
    await strapi.documents("api::poll.poll").create({ ...P, data: { tenant: dga.id, question: "บริการดิจิทัลภาครัฐใดที่คุณใช้บ่อยที่สุด?", options: [{ label: "ThaID", votes: 42 }, { label: "ทางรัฐ", votes: 35 }, { label: "ข้อมูลเปิดภาครัฐ", votes: 12 }, { label: "BizPortal", votes: 8 }], active: true, totalVotes: 97 } });
    if (pea) await strapi.documents("api::poll.poll").create({ ...P, data: { tenant: pea.id, question: "ช่องทางใดที่คุณใช้ชำระค่าไฟบ่อยที่สุด?", options: [{ label: "PEA Smart Plus", votes: 28 }, { label: "Mobile Banking", votes: 31 }, { label: "เคาน์เตอร์เซอร์วิส", votes: 15 }], active: true, totalVotes: 74 } });
  }
  strapi.log.info("[seed] content modules seeded (download/ebook/gallery/popup/poll) ✔");
}

/* ---------- Full-text demo (TOR 8.3): อัปโหลด TOR จริง → สกัดข้อความ → ค้นได้ ---------- */
export async function seedFulltextDemo(strapi: any) {
  const dga = (await strapi.documents("api::tenant.tenant").findMany({ filters: { key: "dga" }, fields: ["key"], limit: 1 }))[0];
  if (!dga) return;
  const indexed = await strapi.db.query("api::download.download").findMany({ where: { contentText: { $notNull: true } }, select: ["id"], limit: 1 });
  if (indexed.length) return; // มีเอกสารที่ index แล้ว
  let torFileId: number | null = null;
  try {
    const torPath = path.resolve(process.cwd(), "..", "site", "DGA-Website", "(TOR) DGA-69-0177 1.pdf");
    if (!fs.existsSync(torPath)) { strapi.log.warn("[seed] TOR pdf not found — skip full-text demo"); return; }
    const stats = fs.statSync(torPath);
    const [up] = await strapi.plugin("upload").service("upload").upload({
      data: { fileInfo: { name: "TOR-DGA-69-0177.pdf", alternativeText: "TOR DGA-69-0177" } },
      files: { filepath: torPath, originalFileName: "TOR-DGA-69-0177.pdf", mimetype: "application/pdf", size: stats.size },
    });
    torFileId = up?.id ?? null;
  } catch (e: any) { strapi.log.warn("[seed] TOR upload failed: " + e.message); return; }
  if (!torFileId) return;
  await strapi.documents("api::download.download").create({
    status: "published",
    data: { tenant: dga.id, title: "เอกสาร TOR DGA-69-0177 (ขอบเขตงาน)", description: "ขอบเขตของงานจ้างพัฒนาระบบเว็บไซต์ สพร. — ค้นข้อความภายในไฟล์ได้ (Full-text)", category: "จัดซื้อจัดจ้าง", fileType: "PDF", order: 1, file: torFileId },
  });
  strapi.log.info("[seed] TOR full-text demo download created (lifecycle จะสกัดข้อความ)");
}

/* ---------- Live chat / social channels ต่อ tenant (idempotent) ---------- */
export async function ensureTenantLiveChat(strapi: any) {
  const demo: Record<string, any> = {
    dga: { channels: [
      { type: "line", label: "LINE: @DGA", url: "https://line.me/R/ti/p/@dga" },
      { type: "messenger", label: "Messenger", url: "https://m.me/DGAThailand" },
      { type: "facebook", label: "Facebook", url: "https://facebook.com/DGAThailand" },
      { type: "phone", label: "โทร 0-2612-6000", url: "tel:026126000" },
    ] },
    pea: { channels: [
      { type: "line", label: "LINE: @PEA", url: "https://line.me/R/ti/p/@pea" },
      { type: "facebook", label: "Facebook PEA", url: "https://facebook.com/PEAElectric" },
      { type: "phone", label: "โทร 1129", url: "tel:1129" },
    ] },
  };
  const tenants = await strapi.db.query("api::tenant.tenant").findMany({ select: ["id", "key", "liveChat"], limit: 500 });
  for (const t of tenants) {
    if (t.liveChat == null && demo[t.key]) {
      await strapi.db.query("api::tenant.tenant").update({ where: { id: t.id }, data: { liveChat: demo[t.key] } });
      strapi.log.info(`[seed] set live-chat channels for tenant ${t.key}`);
    }
  }
}

/* ---------- Flat top-nav items ต่อ tenant (idempotent) ----------
 * api::menu-item.menu-item ถูกสร้างไว้แต่เดิมสำหรับ mega-menu ของเว็บ static
 * เก่า (แถวที่มี `column`) ตอนนี้ Header.tsx ของ public-site ใหม่อ่านแถวที่
 * `column` ว่าง (= flat top-nav) แทน — ทุก tenant ที่มีอยู่ตอนนี้มีแต่แถว
 * แบบ column-set เท่านั้น จึงต้อง seed แถว flat ให้ก่อน ไม่งั้นเมนูบนสุดจะ
 * ว่างเปล่าทันทีที่ Header.tsx เปลี่ยนมาอ่านจาก CMS. เนื้อหาเดียวกับ NAV
 * array เดิมใน Header.tsx ทุก tenant (เป็น safety net ไม่ใช่คำตอบที่ถูกต้อง
 * ต่อ tenant — จุดประสงค์ของฟีเจอร์นี้คือให้แอดมินแก้เองทีหลังได้) */
export async function seedFlatNavItems(strapi: any) {
  const P = { status: "published" as const };
  const NAV = [
    { label: "หน้าแรก", url: "/", order: 1 },
    { label: "บริการ", url: "#services", order: 2 },
    { label: "ข่าวสาร", url: "#news", order: 3 },
    { label: "บริการออนไลน์", url: "/complaint.html", order: 4 },
    { label: "เกี่ยวกับ สพร.", url: "/map.html", order: 5 },
  ];
  const tenants = await strapi.db.query("api::tenant.tenant").findMany({ select: ["id", "key"], limit: 500 });
  for (const t of tenants) {
    const flatCount = await strapi.db.query("api::menu-item.menu-item").count({ where: { tenant: t.id, column: null } });
    if (flatCount === 0) {
      for (const it of NAV) await strapi.documents("api::menu-item.menu-item").create({ ...P, data: { ...it, openNewTab: false, tenant: t.id } });
      strapi.log.info(`[seed] flat nav items created for tenant ${t.key} (${NAV.length})`);
    }
  }
}
