// Studio's side of the agent worker's tool gateway (docs/target-architecture.md,
// decision D13; the worker is webx-agent/). The worker drives MicroAgent and
// asks Studio for two things: the tools a job may use, and to run one. Both go
// through the SAME governed tools and the SAME owner checks a Studio-run
// background job uses (runAsJobOwner: the owner must still be in the workspace
// and active, the plan and the agent policy must still allow it), so nothing
// here re-implements or loosens any of it.
//
// Pure helpers only (tests load them without a server); the two routes under
// app/api/internal/agent-tools/ call runAsJobOwner and these.
import { timingSafeEqual } from "node:crypto";
import { availableTools, executeTool } from "./tools";
import type { AgentRunContext, ToolDef, ToolMode } from "./types";
import type { AgentJobRow, JobOwner } from "./jobs/types";

/** The identity of a job, as the worker holds it: what runAsJobOwner needs to find and check the owner. */
export type GatewayJob = Pick<AgentJobRow, "documentId" | "tenantKey" | "ownerEmail" | "ownerUserId" | "engine" | "requiredLevel" | "policySnapshot"> & { lang?: "en" | "th" };

const LEVELS = ["off", "read", "suggest", "draft", "draft_submit"];

/** Checks the job a request carries. Returns the job, or a sentence saying what is wrong. */
export function parseGatewayJob(v: any): GatewayJob | string {
  if (!v || typeof v !== "object") return "job is required";
  const text = (k: string) => (typeof v[k] === "string" && v[k].trim() ? (v[k] as string) : null);
  const documentId = text("documentId") ?? text("id");
  const tenantKey = text("tenantKey");
  const ownerEmail = text("ownerEmail");
  if (!documentId) return "job.documentId is required";
  if (!tenantKey) return "job.tenantKey is required";
  if (!ownerEmail) return "job.ownerEmail is required";
  if (v.ownerUserId == null || String(v.ownerUserId) === "") return "job.ownerUserId is required";
  if (v.engine !== "strapi" && v.engine !== "wordpress") return 'job.engine must be "strapi" or "wordpress"';
  if (!LEVELS.includes(v.requiredLevel)) return "job.requiredLevel is not an agent level";
  const snap = v.policySnapshot ?? null;
  if (snap !== null && (typeof snap !== "object" || !LEVELS.includes(snap.level))) return "job.policySnapshot is not a policy";
  return {
    documentId, tenantKey, ownerEmail, ownerUserId: String(v.ownerUserId), engine: v.engine,
    requiredLevel: v.requiredLevel, policySnapshot: snap, lang: v.lang === "th" ? "th" : "en",
  } as GatewayJob;
}

/** The risk class MicroAgent is told. A draft or a submit changes WebX's own records, so it is "write";
 * the worker's autonomy level decides whether write tools are offered at all, and nothing here is "money"
 * or "outside": the agent has no tool that leaves WebX. */
export function riskOf(mode: ToolMode): "read" | "write" {
  return mode === "read" ? "read" : "write";
}

const KIND: Record<string, string> = { string: "text", number: "number", integer: "number", boolean: "bool", array: "list", object: "object" };

export type GatewayTool = { name: string; help: string; risk: "read" | "write"; args: { name: string; kind: string; help: string; required: boolean }[] };

export function toGatewayTool(t: ToolDef): GatewayTool {
  const props: Record<string, any> = t.parameters?.properties ?? {};
  const required: string[] = Array.isArray(t.parameters?.required) ? t.parameters.required : [];
  return {
    name: t.name,
    help: t.description,
    risk: riskOf(t.mode),
    args: Object.entries(props).map(([name, p]) => ({
      name,
      kind: KIND[String(p?.type)] ?? "any",
      help: typeof p?.description === "string" ? p.description : (Array.isArray(p?.enum) ? `one of: ${p.enum.join(", ")}` : ""),
      required: required.includes(name),
    })),
  };
}

/** The run context for a job's owner, the same shape a Studio-run job builds. */
export function ctxForOwner(owner: JobOwner, job: GatewayJob): AgentRunContext {
  return {
    user: owner.user, tenantKey: owner.policy.tenantKey, level: owner.policy.level,
    allowedTools: owner.policy.tools, allowedContentTypes: owner.policy.contentTypes,
    model: owner.policy.model, runId: job.documentId, threadId: "", lang: owner.lang,
    ref: { kind: "none" }, dialect: owner.policy.dialect, engine: owner.policy.engine,
  };
}

/** What this owner may use right now: the tools Studio would offer an interactive run at the owner's level. */
export function gatewayTools(ctx: AgentRunContext): GatewayTool[] {
  return availableTools(ctx).map(toGatewayTool);
}

/** Runs one tool through Studio's own enforcement point (it re-checks level, allow-list and arguments). */
export async function runGatewayTool(ctx: AgentRunContext, name: string, args: unknown): Promise<{ ok: boolean; text: string }> {
  const r = await executeTool(ctx, name, JSON.stringify(args ?? {}));
  return { ok: r.ok, text: r.summary + (r.ok && r.data !== undefined ? "\n" + JSON.stringify(r.data) : "") };
}

/** Bearer secret check for the gateway routes, compared without leaking its length or content by timing. */
export function gatewayAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const got = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
