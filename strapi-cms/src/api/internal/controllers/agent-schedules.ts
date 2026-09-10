/**
 * Agent schedules for webx-studio's tick (app/api/internal/agent/tick).
 *
 * Every change is a compare-and-set on the schedule's runSeq, which the caller
 * read from `due`: when two ticks race over one occurrence, exactly one
 * advances it. `advance` moves the schedule to its next run and creates that
 * occurrence's job in the same transaction, and never creates a second job
 * for an idempotency key that already has one. The due check uses this
 * process's clock, like the job leases.
 *
 * Service-to-service only: the shared secret, same as internal.ts.
 */
const SCHEDULE_UID = 'api::agent-schedule.agent-schedule';
const JOB_UID = 'api::agent-job.agent-job';
const DUE_LIMIT = 50;
const JOB_FIELDS = [
  'tenantKey', 'ownerEmail', 'ownerUserId', 'engine', 'template', 'title', 'goal', 'params', 'lang',
  'requiredLevel', 'policySnapshot', 'onQuestion', 'budget', 'idempotencyKey', 'priority',
];

function authorized(ctx: any): boolean {
  const secret = process.env.WEBX_INTERNAL_SECRET;
  if (!secret || ctx.request.header['x-internal-secret'] !== secret) {
    ctx.status = 401;
    ctx.body = { error: 'unauthorized' };
    return false;
  }
  return true;
}

const strapiOf = () => (global as any).strapi;
const schedules = () => strapiOf().db.query(SCHEDULE_UID);
const bodyOf = (ctx: any) => ctx.request.body || {};

function badRequest(ctx: any, error: string) {
  ctx.status = 400;
  ctx.body = { error };
}

function seqOf(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const failuresOf = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

export default {
  /** Enabled schedules whose next run has come, soonest first. */
  async due(ctx: any) {
    if (!authorized(ctx)) return;
    const rows = await schedules().findMany({
      where: { enabled: true, nextRunAt: { $lte: new Date() } },
      orderBy: { nextRunAt: 'asc' },
      limit: DUE_LIMIT,
    });
    ctx.body = { schedules: rows };
  },

  /**
   * Moves a due schedule to its next run. With `job`, also creates this
   * occurrence's job; without one, the occurrence is skipped (`skipReason`).
   */
  async advance(ctx: any) {
    if (!authorized(ctx)) return;
    const b = bodyOf(ctx);
    const expectedSeq = seqOf(b.expectedSeq);
    const nextRunAt = new Date(b.nextRunAt);
    if (!b.documentId || expectedSeq === null || Number.isNaN(nextRunAt.getTime())) {
      return badRequest(ctx, 'documentId, expectedSeq and nextRunAt are required');
    }
    const job = b.job && typeof b.job === 'object'
      ? Object.fromEntries(JOB_FIELDS.filter((k) => k in b.job).map((k) => [k, b.job[k]]))
      : null;
    if (job && (!job.idempotencyKey || !job.tenantKey || !job.ownerEmail || !job.ownerUserId || !job.title || !job.requiredLevel)) {
      return badRequest(ctx, 'job needs idempotencyKey, tenantKey, ownerEmail, ownerUserId, title and requiredLevel');
    }

    const strapi = strapiOf();
    const now = new Date();
    ctx.body = await strapi.db.transaction(async () => {
      const { count } = await schedules().updateMany({
        where: { documentId: b.documentId, enabled: true, runSeq: expectedSeq },
        data: {
          runSeq: expectedSeq + 1,
          nextRunAt,
          consecutiveFailures: failuresOf(b.consecutiveFailures),
          countedJobId: b.countedJobId ?? null,
          lastSkipReason: job ? null : String(b.skipReason || 'skipped'),
          ...(job ? { lastRunAt: now } : {}),
        },
      });
      if (count !== 1) return { ok: false };
      if (!job) return { ok: true, jobId: null };

      const existing = await strapi.db.query(JOB_UID).findOne({ where: { idempotencyKey: job.idempotencyKey }, select: ['documentId'] });
      const jobId = existing?.documentId ?? (await strapi.documents(JOB_UID).create({
        data: { ...job, scheduleId: b.documentId, runState: 'queued', attempts: 0, checkpointSeq: 0, eventSeq: 0, tokensUsed: 0 },
      })).documentId;
      await schedules().updateMany({ where: { documentId: b.documentId }, data: { lastJobId: jobId } });
      return { ok: true, jobId, existing: Boolean(existing) };
    });
  },

  /** Turns a schedule off with a reason, if it is still enabled at the caller's runSeq. */
  async disable(ctx: any) {
    if (!authorized(ctx)) return;
    const b = bodyOf(ctx);
    const expectedSeq = seqOf(b.expectedSeq);
    if (!b.documentId || expectedSeq === null || !b.reason) return badRequest(ctx, 'documentId, expectedSeq and reason are required');
    const { count } = await schedules().updateMany({
      where: { documentId: b.documentId, enabled: true, runSeq: expectedSeq },
      data: {
        enabled: false, runSeq: expectedSeq + 1, disabledReason: String(b.reason), disabledAt: new Date(),
        consecutiveFailures: failuresOf(b.consecutiveFailures), countedJobId: b.countedJobId ?? null,
      },
    });
    ctx.body = { ok: count === 1 };
  },
};
