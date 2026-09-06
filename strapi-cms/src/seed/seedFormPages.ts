/* =====================================================================
   seedFormPages.ts — demo pages for the new block.form (see the approved
   plan "Form block + interactive map + video playback"). Durable, real
   example content for admins to see/copy, and also the one credential-free
   way to verify the Form block end-to-end (public-site build + browser)
   without a live Strapi admin session. Idempotent per (tenant, slug),
   mirroring seedCollectionPages.ts's own pattern.
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

function formBlock(overrides: Record<string, any>) {
  return {
    __component: "block.form",
    contentTypeUid: "", mode: "submit", heading: "",
    consentText: "ข้าพเจ้ายินยอมให้เก็บรวบรวมและใช้ข้อมูลตามนโยบายความเป็นส่วนตัว (PDPA)",
    submitLabel: "ส่งข้อมูล", successMessage: "ส่งข้อมูลเรียบร้อยแล้ว ขอบคุณ",
    ...overrides,
  };
}

const DGA_FORM_PAGES: { slug: string; title: string; seoDescription: string; blocks: any[] }[] = [
  { slug: "contact", title: "ติดต่อเรา", seoDescription: "ช่องทางติดต่อ สพร.",
    blocks: [formBlock({ contentTypeUid: "api::contact-message.contact-message", heading: "ติดต่อเรา",
      submitLabel: "ส่งข้อความ", successMessage: "ส่งข้อความเรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับตามช่องทางที่ท่านระบุ" })] },
  { slug: "complaint", title: "ร้องเรียน / แจ้งเบาะแส", seoDescription: "ช่องทางร้องเรียนและแจ้งเบาะแส",
    blocks: [
      formBlock({ contentTypeUid: "api::complaint.complaint", heading: "ยื่นเรื่องร้องเรียน", mode: "submit",
        submitLabel: "ส่งเรื่องร้องเรียน", successMessage: "รับเรื่องร้องเรียนเรียบร้อยแล้ว กรุณาเก็บเลขอ้างอิงไว้ติดตามสถานะ" }),
      formBlock({ contentTypeUid: "api::complaint.complaint", heading: "ติดตามสถานะเรื่องร้องเรียน", mode: "track" }),
    ] },
  { slug: "apply", title: "สมัครงาน", seoDescription: "สมัครงานกับ สพร.",
    blocks: [
      formBlock({ contentTypeUid: "api::application.application", heading: "ใบสมัครงาน", mode: "submit",
        submitLabel: "ส่งใบสมัคร", successMessage: "ส่งใบสมัครเรียบร้อยแล้ว กรุณาเก็บเลขอ้างอิงไว้ติดตามสถานะ" }),
      formBlock({ contentTypeUid: "api::application.application", heading: "ติดตามสถานะใบสมัคร", mode: "track" }),
    ] },
  { slug: "register", title: "ลงทะเบียนผู้ใช้งาน", seoDescription: "ลงทะเบียนเพื่อใช้บริการภาครัฐ",
    blocks: [formBlock({ contentTypeUid: "api::registration.registration", heading: "ลงทะเบียนผู้ใช้งาน",
      submitLabel: "ลงทะเบียน", successMessage: "ลงทะเบียนเรียบร้อยแล้ว" })] },
];

export async function seedFormPages(strapi: any) {
  const dgaId = await tenantIdByKey(strapi, "dga");
  if (!dgaId) return;
  let created = 0;
  for (const p of DGA_FORM_PAGES) {
    if (await pageExists(strapi, dgaId, p.slug)) continue;
    await createPage(strapi, dgaId, { title: p.title, slug: p.slug, seoDescription: p.seoDescription, blocks: p.blocks });
    created++;
  }
  if (created) strapi.log.info(`[seed] dga form pages created (${created}/${DGA_FORM_PAGES.length})`);
}
