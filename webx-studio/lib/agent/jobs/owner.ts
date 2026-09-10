// Whether a background job may still act as its owner. Checked before every
// slice, because a job can outlive its owner's access: they may leave the
// workspace, be deactivated, lose the plan or have the agent's autonomy
// lowered. Pure, so the rules are unit-tested; governance.ts gathers the facts.
import { levelAtLeast, type AgentLevel } from "../types";
import type { AgentJobRow, JobPolicy, OwnerRefusal } from "./types";

export type OwnerFacts = {
  tenant: { key: string; engine?: "strapi" | "wordpress"; plan?: string; adminEmails?: string[]; features?: Record<string, any> } | null;
  account: { id: unknown; email?: string; active: boolean } | null;
  /** The owner's policy resolved right now, as for an interactive run. */
  livePolicy: JobPolicy | null;
};

const LEVEL_ORDER: AgentLevel[] = ["off", "read", "suggest", "draft", "draft_submit"];

function intersect(a: string[] | null, b: string[] | null): string[] | null {
  if (!a) return b;
  if (!b) return a;
  return a.filter((x) => b.includes(x));
}

/** The stricter of the policy saved when the job was created and the policy now: a job never gains reach. */
export function stricterPolicy(saved: JobPolicy | null | undefined, live: JobPolicy): JobPolicy {
  if (!saved) return live;
  const level = LEVEL_ORDER.indexOf(saved.level) <= LEVEL_ORDER.indexOf(live.level) ? saved.level : live.level;
  return { ...live, level, tools: intersect(saved.tools, live.tools), contentTypes: intersect(saved.contentTypes, live.contentTypes) };
}

export function evaluateJobOwner(
  job: Pick<AgentJobRow, "tenantKey" | "ownerEmail" | "ownerUserId" | "engine" | "requiredLevel" | "policySnapshot">,
  facts: OwnerFacts,
): { ok: true; policy: JobPolicy } | { ok: false; reason: OwnerRefusal } {
  const { tenant, account, livePolicy } = facts;
  const email = job.ownerEmail.toLowerCase();
  if (!tenant || tenant.key !== job.tenantKey || !(tenant.adminEmails || []).some((e) => e.toLowerCase() === email)) {
    return { ok: false, reason: "owner_revoked" };
  }
  if ((tenant.engine || "strapi") !== job.engine) return { ok: false, reason: "owner_revoked" };
  if (!account || !account.active || String(account.id) !== String(job.ownerUserId)) return { ok: false, reason: "owner_revoked" };
  if (!tenant.plan || tenant.plan === "free") return { ok: false, reason: "plan" };
  if (!tenant.features?.agent?.background) return { ok: false, reason: "policy_changed" };
  if (!livePolicy || livePolicy.tenantKey !== job.tenantKey) return { ok: false, reason: "policy_changed" };
  const policy = stricterPolicy(job.policySnapshot, livePolicy);
  if (!levelAtLeast(policy.level, job.requiredLevel)) return { ok: false, reason: "policy_changed" };
  return { ok: true, policy };
}
