/* สกัดข้อความจากไฟล์ e-book → contentText (Full-text Search) อัตโนมัติ */
import path from 'path';
import { extractText } from '../../../../utils/extract-text';

async function indexFile(id: number) {
  try {
    const full: any = await strapi.db.query('api::ebook.ebook').findOne({ where: { id }, populate: { file: true } });
    const f = full?.file;
    if (!f || !f.url) return;
    const pub = (strapi as any).dirs?.static?.public || path.join(process.cwd(), 'public');
    const abs = path.join(pub, String(f.url).replace(/^\//, ''));
    const text = await extractText(abs, f.ext || f.mime || '');
    if (text && text.trim()) {
      await strapi.db.query('api::ebook.ebook').update({ where: { id }, data: { contentText: text.slice(0, 200000) } });
      strapi.log.info(`[ebook] indexed full-text (${text.length} chars) id ${id}`);
    }
  } catch (e: any) { strapi.log.warn('[ebook] extract failed: ' + e.message); }
}

export default {
  async afterCreate(event: any) { await indexFile(event.result.id); },
  async afterUpdate(event: any) {
    if (event.params?.data && 'contentText' in event.params.data) return;
    await indexFile(event.result.id);
  },
};
