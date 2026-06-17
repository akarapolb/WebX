import { factories } from '@strapi/strapi';

/** Poll controller — โหวต (สาธารณะ): เพิ่มคะแนนตัวเลือก แล้วคืนผลรวม */
export default factories.createCoreController('api::poll.poll', ({ strapi }) => ({
  async vote(ctx) {
    const documentId = ctx.params.documentId;
    const optionIndex = Number((ctx.request.body || {}).optionIndex);
    // findOne ผ่าน document service → ถูก scope ตาม tenant ของ request
    const poll: any = await strapi.documents('api::poll.poll').findOne({ documentId, status: 'published' });
    if (!poll || poll.active === false) return ctx.notFound('poll not found');
    const opts = Array.isArray(poll.options) ? poll.options : [];
    if (!(optionIndex >= 0 && optionIndex < opts.length)) return ctx.badRequest('invalid option');
    opts[optionIndex].votes = (opts[optionIndex].votes || 0) + 1;
    const total = opts.reduce((s: number, o: any) => s + (o.votes || 0), 0);
    // อัปเดต json ด้วย query engine (เชื่อถือได้กับฟิลด์ json)
    await strapi.db.query('api::poll.poll').update({ where: { documentId }, data: { options: opts, totalVotes: total } });
    ctx.body = { data: { question: poll.question, options: opts, totalVotes: total } };
  },
}));
