// Background jobs and schedules in the WebX control plane (docs/target-architecture.md,
// track C5). governance.ts reads and writes them through a CmsAdapter, so this is one:
// entries.list / get / create / update / remove against webx-control's /internal/jobs and
// /internal/schedules. The workers' lease calls (claim, heartbeat, checkpoint, finish) and
// the tick's (due, advance, disable) live in lib/agent/jobs/store.server.ts and use
// `controlQueuePath` below.
//
// Switched on by WEBX_CONTROL_QUEUE=1 together with WEBX_CONTROL_URL and
// WEBX_CONTROL_SERVICE_TOKEN. It is its own switch because it moves live work: jobs and
// schedules already in Strapi are not copied, so turn it on when none are running.
//
// No "server-only" import: it is plain fetch, so tests can load it.
import type { CmsAdapter, EntryList, EntryQuery } from "./types";
import { CmsError } from "./types";
import { auditQueryString, controlAuditConfig, type ControlAuditConfig } from "./audit-store";

export const QUEUE_COLLECTIONS: Record<string, string> = {
  "api::agent-job.agent-job": "jobs",
  "api::agent-schedule.agent-schedule": "schedules",
};

/** The control plane's address and token when jobs and schedules live there, else null. */
export function controlQueueConfig(env: Record<string, string | undefined> = process.env): ControlAuditConfig | null {
  if (!/^(1|true|yes|on)$/i.test(env.WEBX_CONTROL_QUEUE || "")) return null;
  return controlAuditConfig(env);
}

export function createControlQueueAdapter(cfg: ControlAuditConfig): CmsAdapter {
  const collectionOf = (uid: string): string => {
    const c = QUEUE_COLLECTIONS[uid];
    if (!c) throw new CmsError(`${uid} is not stored in the control plane's queue`, 501);
    return c;
  };
  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${cfg.baseUrl}/internal/${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    let j: any = null;
    try { j = await r.json(); } catch { /* empty or non-JSON body */ }
    if (!r.ok) throw new CmsError(j?.error?.message || (typeof j?.error === "string" ? j.error : "") ? `queue ${method} failed: ${j.error?.message || j.error}` : `queue ${method} failed`, r.status);
    return j;
  }
  const unsupported = (what: string) => (): never => { throw new CmsError(`${what} is not part of the control plane's queue`, 501); };

  return {
    schema: { listContentTypes: unsupported("the content type list") },
    entries: {
      async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
        const j = await call("GET", collectionOf(uid) + auditQueryString(query));
        const rows: T[] = j.data ?? [];
        return { data: rows, total: j.meta?.pagination?.total ?? rows.length, pageCount: j.meta?.pagination?.pageCount ?? 1 };
      },
      async get<T = any>(uid: string, id: string): Promise<T | null> {
        try {
          return (await call("GET", `${collectionOf(uid)}/${encodeURIComponent(id)}`)).data as T;
        } catch (e) {
          if (e instanceof CmsError && e.status === 404) return null;
          throw e;
        }
      },
      async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
        return (await call("POST", collectionOf(uid), { data })).data as T;
      },
      async update<T = any>(uid: string, id: string, data: Record<string, any>): Promise<T> {
        if (collectionOf(uid) === "jobs") throw new CmsError("A job changes only through its lease and the control actions", 405);
        return (await call("PUT", `schedules/${encodeURIComponent(id)}`, { data })).data as T;
      },
      async remove(uid: string, id: string): Promise<void> {
        if (collectionOf(uid) === "jobs") throw new CmsError("A job is not deleted", 405);
        await call("DELETE", `schedules/${encodeURIComponent(id)}`);
      },
    },
    publish: { publish: unsupported("publishing"), unpublish: unsupported("publishing") },
    media: { upload: unsupported("media"), list: unsupported("media"), update: unsupported("media"), remove: unsupported("media") },
    auth: {
      me: unsupported("users"), listRoles: unsupported("users"), listUsers: unsupported("users"),
      findUserByEmail: unsupported("users"), create: unsupported("users"), remove: unsupported("users"),
    },
  };
}

/** Control-plane path and answer shape for a worker or tick call that Strapi serves at
 * `agent-jobs/<op>` or `agent-schedules/<op>`. Heartbeat answers differently there
 * ({ok, cancelRequested, pauseRequested} here); `due` is a GET. */
export function controlQueueRoute(path: string): { method: "GET" | "POST"; path: string } {
  const [kind, op] = path.split("/");
  const base = kind === "agent-jobs" ? "jobs" : kind === "agent-schedules" ? "schedules" : null;
  if (!base || !op) throw new CmsError(`unknown queue call ${path}`, 500);
  return { method: base === "schedules" && op === "due" ? "GET" : "POST", path: `${base}/${op}` };
}
