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
    // updateMany, not update: with draftAndPublish on, one documentId spans
    // a separate draft row and a separate published row — a plain .update()
    // only touches whichever one it happens to match first (found live: it
    // was silently writing the draft row while every public read, including
    // this same request's own findOne above, serves the published row — a
    // vote's POST response looked right but the count reverted on the very
    // next page load). Write both rows so the published one — the one the
    // public actually reads — genuinely reflects the new vote.
    await strapi.db.query('api::poll.poll').updateMany({ where: { documentId }, data: { options: opts, totalVotes: total } });
    ctx.body = { data: { question: poll.question, options: opts, totalVotes: total } };
  },
}));
