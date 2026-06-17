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
    "api::home-page.home-page": ["find"],
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
