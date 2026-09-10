import { randomUUID } from 'node:crypto';

/**
 * Background job leases for webx-studio's agent worker (lib/agent/worker.ts).
 *
 * Several webx replicas may run workers at once, so every state change here
 * is a compare-and-set: an updateMany whose `where` includes the state or the
 * lease token the caller last saw, and a count of 1 means the caller won.
 * A worker that stops heartbeating loses its lease after LEASE_MS; the next
 * claim requeues the job with backoff (or pauses it if it crashed twice
 * without making progress). The clock is this process's, so workers' clocks
 * don't matter.
 *
 * Service-to-service only: the shared secret, same as internal.ts.
 */
const UID = 'api::agent-job.agent-job';
const LEASE_MS = 90_000;
const MAX_ATTEMPTS = 5;
const RECLAIM_BASE_MS = 30_000;
const EVENTS_KEPT = 200;

function authorized(ctx: any): boolean {
  const secret = process.env.WEBX_INTERNAL_SECRET;
  if (!secret || ctx.request.header['x-internal-secret'] !== secret) {
    ctx.status = 401;
    ctx.body = { error: 'unauthorized' };
    return false;
  }
  return true;
}

const jobs = () => (global as any).strapi.db.query(UID);
const bodyOf = (ctx: any) => ctx.request.body || {};

function mergeEvents(existing: unknown, incoming: unknown): any[] {
  const list = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
  return list.slice(-EVENTS_KEPT);
}

function badRequest(ctx: any, error: string) {
  ctx.status = 400;
  ctx.body = { error };
}

/** Jobs whose worker stopped heartbeating: requeue with backoff, or pause one that keeps crashing at the same point. */
async function reapExpired(now: Date): Promise<number> {
  const expired = await jobs().findMany({
    where: { runState: 'running', leaseExpiresAt: { $lt: now } },
    select: ['id', 'leaseToken', 'attempts', 'checkpointSeq', 'crashSeq', 'crashCount'],
    limit: 50,
  });
  let reaped = 0;
  for (const j of expired) {
    const noProgress = j.crashSeq !== null && j.crashSeq !== undefined && j.crashSeq === j.checkpointSeq;
    const crashCount = noProgress ? (j.crashCount || 0) + 1 : 1;
    const attempts = (j.attempts || 0) + 1;
    let next: Record<string, unknown>;
    if (crashCount >= 2) next = { runState: 'paused', stateReason: 'stuck_crash' };
    else if (attempts > MAX_ATTEMPTS) next = { runState: 'failed', stateReason: 'worker_lost', finishedAt: now, lastError: 'The worker running this job stopped responding too many times.' };
    else next = { runState: 'queued', notBefore: new Date(now.getTime() + RECLAIM_BASE_MS * 2 ** (attempts - 1)) };
    const { count } = await jobs().updateMany({
      where: { id: j.id, runState: 'running', leaseToken: j.leaseToken },
      data: { ...next, attempts, crashCount, crashSeq: j.checkpointSeq ?? 0, leaseToken: null, leaseOwner: null, leaseExpiresAt: null },
    });
    reaped += count;
  }
  return reaped;
}

export default {
  /**
   * Leases up to `limit` runnable jobs to `workerId`. `caps` maps tenantKey to
   * that tenant's concurrent-job limit (webx-studio knows the plans);
   * `defaultCap` covers the rest. One running job per owner.
   */
  async claim(ctx: any) {
    if (!authorized(ctx)) return;
    const { workerId = '', limit = 1, caps = {}, defaultCap = 2 } = bodyOf(ctx);
    const now = new Date();
    const reaped = await reapExpired(now);
    const want = Math.max(1, Math.min(Number(limit) || 1, 20));

    const queued = await jobs().findMany({
      where: { runState: 'queued', $or: [{ notBefore: { $null: true } }, { notBefore: { $lte: now } }] },
      orderBy: [{ priority: 'desc' }, { lastSliceAt: 'asc' }, { createdAt: 'asc' }],
      select: ['id', 'tenantKey', 'ownerEmail'],
      limit: 100,
    });
    const running = await jobs().findMany({ where: { runState: 'running' }, select: ['tenantKey', 'ownerEmail'], limit: 1000 });
    const perTenant = new Map<string, number>();
    const busyOwners = new Set<string>();
    for (const r of running) {
      perTenant.set(r.tenantKey, (perTenant.get(r.tenantKey) || 0) + 1);
      busyOwners.add(String(r.ownerEmail).toLowerCase());
    }

    const claimed: any[] = [];
    for (const c of queued) {
      if (claimed.length >= want) break;
      const cap = Number(caps[c.tenantKey] ?? defaultCap);
      const owner = String(c.ownerEmail).toLowerCase();
      if ((perTenant.get(c.tenantKey) || 0) >= cap || busyOwners.has(owner)) continue;
      const leaseToken = randomUUID();
      const { count } = await jobs().updateMany({
        where: { id: c.id, runState: 'queued' },
        data: { runState: 'running', leaseOwner: String(workerId), leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), heartbeatAt: now, lastSliceAt: now },
      });
      if (count !== 1) continue; // another worker got it
      const row = await jobs().findOne({ where: { id: c.id } });
      if (!row.startedAt) {
        await jobs().updateMany({ where: { id: c.id, leaseToken }, data: { startedAt: now } });
        row.startedAt = now;
      }
      perTenant.set(c.tenantKey, (perTenant.get(c.tenantKey) || 0) + 1);
      busyOwners.add(owner);
      claimed.push(row);
    }
    ctx.body = { jobs: claimed, reaped };
  },

  /** Extends the lease; reports the user's cancel/pause requests. `ok: false` means the lease is gone. */
  async heartbeat(ctx: any) {
    if (!authorized(ctx)) return;
    const { documentId, leaseToken } = bodyOf(ctx);
    if (!documentId || !leaseToken) return badRequest(ctx, 'documentId and leaseToken are required');
    const now = new Date();
    const { count } = await jobs().updateMany({
      where: { documentId, leaseToken, runState: 'running' },
      data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS), heartbeatAt: now },
    });
    if (count !== 1) {
      ctx.body = { ok: false };
      return;
    }
    const row = await jobs().findOne({ where: { documentId }, select: ['cancelRequestedAt', 'pauseRequestedAt'] });
    ctx.body = { ok: true, cancelRequested: Boolean(row?.cancelRequestedAt), pauseRequested: Boolean(row?.pauseRequestedAt) };
  },

  /** Saves the run's checkpoint, progress and new events under the lease, and extends it. */
  async checkpoint(ctx: any) {
    if (!authorized(ctx)) return;
    const b = bodyOf(ctx);
    if (!b.documentId || !b.leaseToken) return badRequest(ctx, 'documentId and leaseToken are required');
    const row = await jobs().findOne({ where: { documentId: b.documentId, leaseToken: b.leaseToken, runState: 'running' }, select: ['id', 'events'] });
    if (!row) {
      ctx.body = { ok: false };
      return;
    }
    const now = new Date();
    const data: Record<string, unknown> = {
      checkpoint: b.checkpoint ?? null,
      checkpointSeq: Number(b.checkpointSeq) || 0,
      eventSeq: Number(b.eventSeq) || 0,
      progress: b.progress ?? null,
      tokensUsed: Number(b.tokensUsed) || 0,
      events: mergeEvents(row.events, b.events),
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      heartbeatAt: now,
      lastSliceAt: now,
    };
    if (b.clearAnswer) data.pendingAnswer = null;
    const { count } = await jobs().updateMany({ where: { id: row.id, leaseToken: b.leaseToken, runState: 'running' }, data });
    ctx.body = { ok: count === 1 };
  },

  /** Ends a slice: back to the queue, or paused, done, failed or cancelled. Releases the lease. */
  async finish(ctx: any) {
    if (!authorized(ctx)) return;
    const b = bodyOf(ctx);
    if (!b.documentId || !b.leaseToken) return badRequest(ctx, 'documentId and leaseToken are required');
    if (!['queued', 'paused', 'done', 'failed', 'cancelled'].includes(b.runState)) return badRequest(ctx, 'invalid runState');
    const row = await jobs().findOne({ where: { documentId: b.documentId, leaseToken: b.leaseToken, runState: 'running' }, select: ['id', 'events'] });
    if (!row) {
      ctx.body = { ok: false };
      return;
    }
    const now = new Date();
    const terminal = b.runState === 'done' || b.runState === 'failed' || b.runState === 'cancelled';
    const data: Record<string, unknown> = {
      runState: b.runState,
      outcome: b.outcome ?? null,
      stateReason: b.stateReason ?? null,
      lastError: b.lastError ?? null,
      notBefore: b.runState === 'queued' && b.notBefore ? new Date(b.notBefore) : null,
      leaseToken: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: now,
      lastSliceAt: now,
      crashCount: 0,
      events: mergeEvents(row.events, b.events),
      eventSeq: Number(b.eventSeq) || 0,
      // A request that arrives while a slice is ending as "queued" is kept for the next slice to act on.
      ...(b.runState === 'queued' ? {} : { cancelRequestedAt: null, pauseRequestedAt: null }),
      ...(terminal ? { finishedAt: now } : {}),
    };
    for (const k of ['checkpoint', 'checkpointSeq', 'progress', 'tokensUsed', 'result']) if (b[k] !== undefined) data[k] = b[k];
    const { count } = await jobs().updateMany({ where: { id: row.id, leaseToken: b.leaseToken, runState: 'running' }, data });
    ctx.body = { ok: count === 1 };
  },

  /**
   * A user's request, already authorized by webx-studio: cancel, pause,
   * resume, or answer a question. A queued or paused job changes state here;
   * a running one gets a flag its worker acts on at the next turn.
   */
  async control(ctx: any) {
    if (!authorized(ctx)) return;
    const { documentId, action, answer } = bodyOf(ctx);
    if (!documentId) return badRequest(ctx, 'documentId is required');
    const row = await jobs().findOne({ where: { documentId }, select: ['id'] });
    if (!row) {
      ctx.status = 404;
      ctx.body = { error: 'not found' };
      return;
    }
    const now = new Date();
    const cas = async (states: string[], data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      (await jobs().updateMany({ where: { id: row.id, runState: { $in: states }, ...extra }, data })).count === 1;

    let ok = false;
    if (action === 'cancel') {
      ok = (await cas(['queued', 'paused'], { runState: 'cancelled', stateReason: 'user', finishedAt: now, notBefore: null }))
        || (await cas(['running'], { cancelRequestedAt: now }));
    } else if (action === 'pause') {
      ok = (await cas(['queued'], { runState: 'paused', stateReason: 'user' })) || (await cas(['running'], { pauseRequestedAt: now }));
    } else if (action === 'resume') {
      ok = await cas(['paused'], { runState: 'queued', stateReason: null, notBefore: null, pauseRequestedAt: null, crashCount: 0 });
    } else if (action === 'answer') {
      if (typeof answer !== 'string' || !answer.trim()) return badRequest(ctx, 'answer is required');
      ok = await cas(['paused'], { runState: 'queued', stateReason: null, notBefore: null, pendingAnswer: answer.slice(0, 4000) }, { stateReason: 'needs_input' });
    } else {
      return badRequest(ctx, 'unknown action');
    }
    const job = await jobs().findOne({ where: { id: row.id }, select: ['documentId', 'runState', 'stateReason', 'cancelRequestedAt', 'pauseRequestedAt'] });
    ctx.body = { ok, job };
  },
};
