/* =====================================================================
   seedCollectionPages.ts — Collection Page migration (see the approved
   plan "Collection Page + migrate DGA/PEA pages into the CMS"):
     - dga/pea's own home-blocks page (durable — dga's already existed
       live in dev as a manually-created artifact that would vanish on a
       fresh reseed; pea never had one, its homepage still falls back to
       HomePage.tsx's legacy branch until this seeds one for it too)
     - dga's 11 list-type pages (news/blog/video/gallery/catalog/download/
       faq/calendar/links/map/careers), each one block.collection-list
       bound to a real, already-seeded content type
   Idempotent per (tenant, slug) — matches seedLanding's own existence-
   check-then-create pattern. pea gets no list-type pages: it never had a
   legacy static site to migrate, only a home-blocks page.
   ===================================================================== */

async function tenantIdByKey(strapi: any, key: string): Promise<number | null> {
  const rows = await strapi.documents("api::tenant.tenant").findMany({ filters: { key }, fields: ["key"], limit: 1 });
  return rows[0] ? rows[0].id : null;
}

async function pageExists(strapi: any, tenantId: number, slug: string): Promise<boolean> {
  const rows = await strapi.db.query("api::page.page").findMany({ where: { tenant: tenantId, slug }, select: ["id"], limit: 1 });
  return rows.length > 0;
}

async function createPage(strapi: any, tenantId: number, data: { title: string; slug: string; seoDescription?: string; blocks: any[] }) {
  await strapi.documents("api::page.page").create({ status: "published", data: { ...data, tenant: tenantId } });
}

// Same field-mapping shape VisualBuilder.tsx's sidebar writes onto a
// block.collection-list instance — every default here matches that
// component's own `def` object (see VisualBuilder.tsx's TYPES array).
function clBlock(overrides: Record<string, any>) {
  return {
    __component: "block.collection-list",
    heading: "", contentTypeUid: "", pluralName: "",
    titleField: "", imageField: "", excerptField: "", dateField: "", linkField: "",
    bodyField: "", linkToDetail: false,
    sortField: "createdAt", sortDir: "desc", pageSize: 12,
    ...overrides,
  };
}

// The 9 blocks already live on dga's manually-created "home-blocks" page in
// dev — captured verbatim here (minus the one `image` field, and one
// accidental "เรียนรู้เพิ่มเติม" suffix left over from live editor testing
// this session) so a fresh DB reproduces the same real homepage instead of
// losing it. See seedGroupA/seedLanding for the same "images blank on
// seeded blocks" convention — no hardcoded media ids.
function dgaHomeBlocks() {
  return [
    {
      __component: "block.hero",
      kicker: "บริการดิจิทัลภาครัฐที่เชื่อถือได้",
      heading: "บริการรัฐบาลดิจิทัล เพื่อประชาชนทุกคน",
      subheading: "ค้นหาบริการ เอกสาร และข้อมูลภาครัฐได้ในที่เดียว หรือถามผู้ช่วย AI เพื่อคำตอบที่ตรงจุด",
      ctaLabel: "ดูบริการทั้งหมด", ctaUrl: "#services", align: "center",
    },
    {
      __component: "block.feature-grid",
      heading: "บริการยอดนิยม", columns: "3",
      items: [
        { icon: "i-id", title: "บัตรประชาชนดิจิทัล", text: "ยืนยันตัวตน ThaID ใช้แทนบัตรจริง", url: "#", colorTheme: "orange" },
        { icon: "i-grid", title: "แอปทางรัฐ", text: "รวมบริการภาครัฐในแอปเดียว", url: "#", colorTheme: "blue" },
        { icon: "i-data", title: "ข้อมูลเปิดภาครัฐ", text: "Open Government Data", url: "#", colorTheme: "green" },
        { icon: "i-build", title: "BizPortal", text: "เริ่มต้นธุรกิจครบวงจร", url: "#", colorTheme: "amber" },
        { icon: "i-doc", title: "มาตรฐานดิจิทัล", text: "กรอบ EA และคู่มือภาครัฐ", url: "#", colorTheme: "purple" },
        { icon: "i-book", title: "ศูนย์ความรู้", text: "กฎหมายดิจิทัล & e-Book", url: "#", colorTheme: "teal" },
      ],
    },
    { __component: "block.highlights" },
    {
      __component: "block.stat-row",
      items: [
        { icon: "users", value: "30 ล้าน+", label: "ผู้ใช้บริการ" },
        { icon: "grid", value: "1,400+", label: "บริการดิจิทัล" },
        { icon: "shield", value: "99.9%", label: "ความพร้อมระบบ" },
        { icon: "clock", value: "24/7", label: "ศูนย์ช่วยเหลือ" },
      ],
    },
    { __component: "block.news-panel", newsTabLabel: "DGA News", articleTabLabel: "บทความ" },
    { __component: "block.video-channel", title: "DGA Channel" },
    { __component: "block.awards", eyebrow: "ความภาคภูมิใจของเรา", title: "DGA Auditorium", subtitle: "" },
    { __component: "block.faq", eyebrow: "ถาม–ตอบ", title: "คำถามที่พบบ่อย" },
    {
      __component: "block.featured-promo",
      eyebrow: "ซูเปอร์แอปภาครัฐ",
      title: "แอป “ทางรัฐ” บริการรัฐครบ จบในแอปเดียว",
      description: "ตรวจสอบสิทธิ์ จ่ายบิล นัดหมาย และเข้าถึงเอกสารราชการได้ทุกที่ทุกเวลา ปลอดภัยด้วยการยืนยันตัวตน ThaID",
      items: ["ตรวจสอบสิทธิ์สวัสดิการ", "จ่ายบิล/ชำระค่าบริการรัฐ", "นัดหมายหน่วยงานรัฐ", "เอกสารราชการดิจิทัล"],
      primaryLabel: "ดาวน์โหลดแอป", primaryUrl: "#", secondaryLabel: "เรียนรู้เพิ่มเติม", secondaryUrl: "#",
    },
  ];
}

// A smaller, honest set matching pea's actual seeded content (verified
// live: 0 banners/videos/awards for pea) — no highlights/video-channel/
// awards blocks, since pea has nothing to back them. feature-grid items
// mirror pea's 3 real seeded api::service.service rows (same icon/
// colorTheme) rather than invented copy; stat-row/featured-promo are
// freeform per-block text (same as dga's own — not live-queried data),
// written for pea's real mandate (provincial electricity distribution).
function peaHomeBlocks() {
  return [
    {
      __component: "block.hero",
      kicker: "บริการไฟฟ้าเพื่อประชาชน",
      heading: "การไฟฟ้าส่วนภูมิภาค บริการไฟฟ้าที่ไว้วางใจได้ทั่วประเทศ",
      subheading: "ตรวจสอบค่าไฟ ชำระบิล แจ้งไฟฟ้าขัดข้อง และติดตามข่าวสารได้ในที่เดียว",
      ctaLabel: "ดูบริการทั้งหมด", ctaUrl: "#services", align: "center",
    },
    {
      __component: "block.feature-grid",
      heading: "บริการยอดนิยม", columns: "3",
      items: [
        { icon: "i-data", title: "ตรวจสอบค่าไฟฟ้า", text: "เช็กยอดค่าไฟและประวัติการใช้", url: "#", colorTheme: "purple" },
        { icon: "i-build", title: "ชำระค่าไฟออนไลน์", text: "จ่ายบิลผ่านช่องทางดิจิทัล", url: "#", colorTheme: "amber" },
        { icon: "i-shield", title: "แจ้งไฟฟ้าขัดข้อง", text: "แจ้งเหตุไฟดับและติดตามสถานะ", url: "#", colorTheme: "blue" },
      ],
    },
    {
      __component: "block.stat-row",
      items: [
        { icon: "users", value: "22 ล้าน+", label: "ผู้ใช้ไฟฟ้า" },
        { icon: "grid", value: "74 จังหวัด", label: "พื้นที่ให้บริการ" },
        { icon: "shield", value: "99.9%", label: "ความเชื่อถือได้ของระบบ" },
        { icon: "clock", value: "24/7", label: "PEA Contact Center 1129" },
      ],
    },
    { __component: "block.news-panel", newsTabLabel: "ข่าว กฟภ.", articleTabLabel: "บทความ" },
    { __component: "block.faq", eyebrow: "ถาม–ตอบ", title: "คำถามที่พบบ่อย" },
    {
      __component: "block.featured-promo",
      eyebrow: "แอปพลิเคชัน PEA Smart Plus",
      title: "PEA Smart Plus ตรวจสอบและชำระค่าไฟฟ้าได้ทุกที่ทุกเวลา",
      description: "ตรวจสอบค่าไฟ ชำระบิล แจ้งไฟฟ้าขัดข้อง และรับข่าวสารจาก กฟภ. ได้จากมือถือเครื่องเดียว",
      items: ["ตรวจสอบยอดค่าไฟ", "ชำระค่าไฟออนไลน์", "แจ้งไฟฟ้าขัดข้อง", "ติดตามข่าวสาร กฟภ."],
      primaryLabel: "ดาวน์โหลดแอป", primaryUrl: "#", secondaryLabel: "เรียนรู้เพิ่มเติม", secondaryUrl: "#",
    },
  ];
}

// dga's 11 list-type pages — field names verified directly against each
// content type's real schema.json (see the plan). `links` is the one
// linkToDetail:false page: weblink's own `url` field already IS the
// external destination, so it uses linkField instead of an auto-generated
// detail route (its "article.html" companion detail page, and news.html's,
// are superseded by Collection Page's own auto-generated route).
const DGA_LIST_PAGES: { slug: string; title: string; seoDescription: string; block: any }[] = [
  { slug: "news", title: "ข่าวสาร", seoDescription: "ข่าวสารและประกาศจาก สพร.",
    block: clBlock({ heading: "ข่าวสาร", contentTypeUid: "api::article.article", pluralName: "articles",
      titleField: "title", imageField: "coverImage", excerptField: "excerpt", bodyField: "body",
      dateField: "publishDate", sortField: "publishDate", sortDir: "desc", linkToDetail: true }) },
  { slug: "blog", title: "บทความ", seoDescription: "บทความและมุมมองจากทีม สพร.",
    block: clBlock({ heading: "บทความ", contentTypeUid: "api::blog.blog", pluralName: "blogs",
      titleField: "title", imageField: "coverImage", excerptField: "excerpt", bodyField: "body",
      dateField: "publishDate", sortField: "publishDate", sortDir: "desc", linkToDetail: true }) },
  { slug: "video", title: "วิดีโอ", seoDescription: "คลังวิดีโอ DGA Channel",
    block: clBlock({ heading: "วิดีโอ", contentTypeUid: "api::video.video", pluralName: "videos",
      titleField: "title", imageField: "thumbnail", videoUrlField: "videoUrl",
      dateField: "date", sortField: "date", sortDir: "desc", linkToDetail: true }) },
  { slug: "gallery", title: "คลังภาพ", seoDescription: "คลังภาพกิจกรรมและผลงาน",
    block: clBlock({ heading: "คลังภาพ", contentTypeUid: "api::gallery.gallery", pluralName: "galleries",
      titleField: "title", imageField: "coverImage", excerptField: "description", bodyField: "description",
      dateField: "date", sortField: "date", sortDir: "desc", linkToDetail: true }) },
  { slug: "catalog", title: "แคตตาล็อก", seoDescription: "แคตตาล็อกบริการและผลิตภัณฑ์",
    block: clBlock({ heading: "แคตตาล็อก", contentTypeUid: "api::catalog.catalog", pluralName: "catalogs",
      titleField: "title", imageField: "coverImage", excerptField: "description", bodyField: "description",
      sortField: "order", sortDir: "asc", linkToDetail: true }) },
  { slug: "download", title: "ดาวน์โหลด", seoDescription: "เอกสารและไฟล์ดาวน์โหลด",
    block: clBlock({ heading: "ดาวน์โหลด", contentTypeUid: "api::download.download", pluralName: "downloads",
      titleField: "title", excerptField: "description", bodyField: "description",
      sortField: "order", sortDir: "asc", linkToDetail: true }) },
  { slug: "faq", title: "คำถามที่พบบ่อย", seoDescription: "คำถามที่พบบ่อย",
    block: clBlock({ heading: "คำถามที่พบบ่อย", contentTypeUid: "api::faq.faq", pluralName: "faqs",
      titleField: "question", excerptField: "answer", bodyField: "answer",
      sortField: "order", sortDir: "asc", linkToDetail: true }) },
  { slug: "calendar", title: "ปฏิทินกิจกรรม", seoDescription: "ปฏิทินกิจกรรมและอีเวนต์",
    block: clBlock({ heading: "ปฏิทินกิจกรรม", contentTypeUid: "api::event.event", pluralName: "events",
      titleField: "title", excerptField: "description", bodyField: "description",
      dateField: "start", sortField: "start", sortDir: "asc", linkToDetail: true }) },
  { slug: "links", title: "ลิงก์ที่เกี่ยวข้อง", seoDescription: "ลิงก์หน่วยงานและบริการที่เกี่ยวข้อง",
    block: clBlock({ heading: "ลิงก์ที่เกี่ยวข้อง", contentTypeUid: "api::weblink.weblink", pluralName: "weblinks",
      titleField: "title", imageField: "thumbnail", excerptField: "description", bodyField: "description",
      linkField: "url", sortField: "order", sortDir: "asc", linkToDetail: false }) },
  { slug: "map", title: "ที่ตั้งหน่วยงาน", seoDescription: "ที่ตั้งสำนักงานและหน่วยบริการ",
    block: clBlock({ heading: "ที่ตั้งหน่วยงาน", contentTypeUid: "api::location.location", pluralName: "locations",
      titleField: "name", excerptField: "address", bodyField: "address", layout: "map",
      sortField: "createdAt", sortDir: "desc", linkToDetail: true }) },
  { slug: "careers", title: "ร่วมงานกับเรา", seoDescription: "ตำแหน่งงานว่างและร่วมงานกับ สพร.",
    block: clBlock({ heading: "ร่วมงานกับเรา", contentTypeUid: "api::job.job", pluralName: "jobs",
      titleField: "title", excerptField: "summary", bodyField: "summary",
      sortField: "createdAt", sortDir: "desc", linkToDetail: true }) },
];

export async function seedCollectionPages(strapi: any) {
  const dgaId = await tenantIdByKey(strapi, "dga");
  const peaId = await tenantIdByKey(strapi, "pea");

  if (dgaId && !(await pageExists(strapi, dgaId, "home-blocks"))) {
    await createPage(strapi, dgaId, { title: "Home Blocks (pilot)", slug: "home-blocks", blocks: dgaHomeBlocks() });
    strapi.log.info("[seed] dga home-blocks page created");
  }
  if (peaId && !(await pageExists(strapi, peaId, "home-blocks"))) {
    await createPage(strapi, peaId, { title: "หน้าแรก", slug: "home-blocks", blocks: peaHomeBlocks() });
    strapi.log.info("[seed] pea home-blocks page created");
  }

  if (dgaId) {
    await recreateStaleListPages(strapi, dgaId);
    let created = 0;
    for (const p of DGA_LIST_PAGES) {
      if (await pageExists(strapi, dgaId, p.slug)) continue;
      await createPage(strapi, dgaId, { title: p.title, slug: p.slug, seoDescription: p.seoDescription, blocks: [p.block] });
      created++;
    }
    if (created) strapi.log.info(`[seed] dga list-type pages created (${created}/${DGA_LIST_PAGES.length})`);
  }
}

// Tenants whose "map"/"video" (or any future list-type) page already
// existed before a new clBlock() field was added (layout/videoUrlField)
// never pick it up — seedCollectionPages() only ever creates a page once.
// Patching a dynamiczone in place via the Document Service proved fragile
// (a populate-then-write-back round trip threw "components ... not related
// to the entity"), so instead: delete the stale page outright and let the
// normal create-if-missing loop right below recreate it fresh with the
// current clBlock() config. Safe because these are auto-generated, fully
// reproducible pages, not admin-authored content — an admin's own edits to
// one would show up as `titleField`/etc. no longer matching DGA_LIST_PAGES'
// defaults, which is exactly the signal used to decide "stale" here, so a
// hand-customized page is left untouched.
async function recreateStaleListPages(strapi: any, dgaId: number) {
  const WATCHED = ["layout", "videoUrlField"] as const;
  let removed = 0;
  for (const p of DGA_LIST_PAGES) {
    const wantsWatched = WATCHED.some((k) => (p.block as any)[k] !== undefined);
    if (!wantsWatched) continue;
    const rows = await strapi.documents("api::page.page").findMany({ filters: { tenant: dgaId, slug: p.slug }, status: "published", populate: { blocks: true }, limit: 1 });
    const row = rows[0];
    const block = row?.blocks?.find((b: any) => b.__component === "block.collection-list");
    if (!row || !block) continue;
    const isStale = WATCHED.some((k) => (p.block as any)[k] !== undefined && block[k] !== (p.block as any)[k]);
    if (!isStale) continue;
    await strapi.documents("api::page.page").delete({ documentId: row.documentId });
    removed++;
  }
  if (removed) strapi.log.info(`[seed] recreating ${removed} dga list page(s) with the current block config (layout/videoUrlField)`);
}
