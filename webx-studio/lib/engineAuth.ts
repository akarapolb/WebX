// Where the credentials for calls to a content engine come from (docs/c4-identity-plan.md, step 5). The engine adapters,
// the AI routes, the /api/strapi proxy and the app layout ask here instead of reading the session cookie (only
// lib/strapi.ts's own helpers still read it directly), so a second way in can be added in this file without changing the
// places that call an engine.
//
// Today there is one way in, the legacy one: the engine's own token the person signed in with (the session cookie: a
// Strapi admin token, or the WordPress Basic string), or the credential governance put in place with withServiceToken
// (the scheduler's, for bookkeeping and for background jobs); inside a background job the call also names the job's
// owner. Step 6 adds the control-plane session, where a call carries the workspace's service credential and a
// short-lived signed acting token; it goes in engineAuth() below, beside the legacy one. Whatever it looks like, a
// credential put in place with withServiceToken must keep winning over the person's own session, as it does now.
import "server-only";
import { actingSession, sessionToken } from "./strapi";

/** The engines these credentials are for. */
export type EngineKind = "strapi" | "wordpress";

/** Who an engine call is made for, when its credential is not that person's own. In the legacy implementation only a
 * background job has one: the scheduler's credential, acting as the job's owner. Not to be confused with lib/strapi.ts's
 * actingSession(), which governance reads as "inside a background job" (it switches on limits meant only for jobs): a
 * person's own calls may carry an EngineActing later (step 6), but must never set that. */
export type EngineActing = {
  email: string;
  tenantKey: string;
  /** Set when the call is made by a background job. */
  jobId?: string;
};

/** What a call to an engine authenticates with. */
export type EngineAuth = {
  /** Strapi: an admin bearer token. WordPress: the Basic-auth string, base64 of `user:application-password`. */
  credential: string;
  acting?: EngineActing;
};

/** The credential for engine calls made here, or null when there is none (the caller then refuses as unauthenticated). */
export async function engineAuth(): Promise<EngineAuth | null> {
  return legacyEngineAuth();
}

/** The session cookie's token, or a withServiceToken credential; inside a background job, plus the job's owner. */
async function legacyEngineAuth(): Promise<EngineAuth | null> {
  const credential = await sessionToken();
  if (!credential) return null;
  const job = actingSession();
  if (!job) return { credential };
  return { credential, acting: { email: job.email, tenantKey: job.tenantKey, jobId: job.jobId } };
}

/** The request headers that carry `auth` on a call to `engine`: the credential in that engine's scheme and, for Strapi,
 * who the call is made for (strapi-cms believes these two headers only from the scheduler account,
 * strapi-cms/src/index.ts). WordPress gets no acting headers: it has no way to act for someone yet (step 9). */
export function engineAuthHeaders(engine: EngineKind, auth: EngineAuth): Record<string, string> {
  if (engine === "wordpress") return { Authorization: "Basic " + auth.credential };
  const acting: Record<string, string> = auth.acting
    ? { "X-WebX-Acting-Email": auth.acting.email, "X-WebX-Acting-Tenant": auth.acting.tenantKey }
    : {};
  return { Authorization: "Bearer " + auth.credential, ...acting };
}
