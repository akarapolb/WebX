// The models the AI gateway really serves (GET, any signed-in user), and adding or removing one from the Agent
// settings (POST / DELETE, workspace admins only). A model is added through the gateway's own /model/new, which stores
// the provider key in the gateway's database, encrypted: Studio never keeps the key and never sends it back.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, getAgentPolicy } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { gatewayModels, resetGatewayCache } from "@/lib/aiModels";
import { checkNewModel } from "@/lib/aiModelAdmin";
import { assertIssuerHostIsPublic } from "@/lib/oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const base = () => (process.env.LITELLM_URL || "").replace(/\/$/, "");
const authHeaders = () => ({ Authorization: "Bearer " + (process.env.LITELLM_KEY || ""), "Content-Type": "application/json" });
const err = (message: string, status: number, field?: string) => NextResponse.json({ error: message, ...(field ? { field } : {}) }, { status });

async function who() {
  try { await requireUser(); return null; }
  catch (e) { return err(e instanceof CmsError ? e.message : "Unauthenticated", e instanceof CmsError ? e.status || 401 : 401); }
}
/** Only someone who can change this workspace's agent settings may add or remove a model. */
async function adminOf(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  try { await getAgentPolicy(tenant); return null; }
  catch (e) { return err(e instanceof CmsError ? e.message : "Not allowed", e instanceof CmsError ? e.status || 403 : 403); }
}
async function modelId(alias: string): Promise<string> {
  const r = await fetch(base() + "/model/info", { headers: authHeaders(), signal: AbortSignal.timeout(8000), cache: "no-store" });
  const j: any = await r.json().catch(() => ({}));
  const m = (j?.data || []).find((x: any) => x?.model_name === alias);
  return String(m?.model_info?.id || "");
}

export async function GET() {
  const denied = await who();
  if (denied) return denied;
  return NextResponse.json(await gatewayModels());
}

export async function POST(req: NextRequest) {
  const denied = (await who()) || (await adminOf(req));
  if (denied) return denied;
  const g = await gatewayModels();
  if (!g.reachable) return err("Cannot reach the AI gateway.", 502);
  if (!g.canAdd) return err("The AI gateway has no database, so it cannot store a new model yet.", 409, "gateway");
  const body = await req.json().catch(() => ({}));
  const checked = checkNewModel(body, g.models.map((m) => m.alias));
  if (!checked.ok) return err("Check the " + checked.field + " field.", 400, checked.field);
  const { alias, litellmModel, apiKey, apiBase } = checked.value;
  if (apiBase) {
    // The gateway will call this address from inside the server's network: a private host is refused.
    try { await assertIssuerHostIsPublic(apiBase); } catch { return err("That address is not a public host.", 400, "apiBase"); }
  }
  const create = await fetch(base() + "/model/new", {
    method: "POST", headers: authHeaders(), signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model_name: alias, litellm_params: { model: litellmModel, api_key: apiKey, ...(apiBase ? { api_base: apiBase } : {}) } }),
  }).catch(() => null);
  if (!create || !create.ok) return err("The gateway did not accept the model.", 502);
  resetGatewayCache();
  // One tiny request to prove the key and model id work; a model that cannot answer is removed again.
  const ping = await fetch(base() + "/chat/completions", {
    method: "POST", headers: authHeaders(), signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ model: alias, messages: [{ role: "user", content: "ping" }], max_tokens: 8 }),
  }).catch(() => null);
  if (!ping || !ping.ok) {
    const id = await modelId(alias).catch(() => "");
    if (id) await fetch(base() + "/model/delete", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id }), signal: AbortSignal.timeout(10000) }).catch(() => {});
    resetGatewayCache();
    return err("The provider did not accept this key or model id, so it was not added.", 422, "apiKey");
  }
  return NextResponse.json({ ok: true, alias });
}

export async function DELETE(req: NextRequest) {
  const denied = (await who()) || (await adminOf(req));
  if (denied) return denied;
  const alias = req.nextUrl.searchParams.get("alias") || "";
  const g = await gatewayModels();
  const m = g.models.find((x) => x.alias === alias);
  if (!m || !m.custom) return err("Only a model added here can be removed here.", 400);
  if (alias === g.defaultModel) return err("That is the default model.", 409);
  const id = await modelId(alias);
  if (!id) return err("Model not found.", 404);
  const r = await fetch(base() + "/model/delete", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id }), signal: AbortSignal.timeout(10000) }).catch(() => null);
  resetGatewayCache();
  return r && r.ok ? NextResponse.json({ ok: true }) : err("The gateway did not remove it.", 502);
}
