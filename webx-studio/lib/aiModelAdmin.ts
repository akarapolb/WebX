// Adding a model to the AI gateway from the Agent settings: what the form offers per provider and how its values are
// checked before anything is sent to the gateway. Pure, so the browser form and the server route use the same rules.

export type ProviderId = "openai" | "anthropic" | "gemini" | "moonshot" | "deepseek" | "other";
export type Provider = {
  id: ProviderId; label: string;
  /** The prefix the gateway uses to pick the provider's client ("openai/gpt-4o-mini"). */
  prefix: string;
  /** Fixed endpoint for this provider, if it needs one; "" lets the gateway use the provider's own. */
  apiBase: string;
  /** Model ids to suggest; any id may be typed. */
  suggest: string[];
  needsBase?: boolean;
};

export const PROVIDERS: Provider[] = [
  { id: "openai", label: "ChatGPT (OpenAI)", prefix: "openai", apiBase: "", suggest: ["gpt-4o-mini", "gpt-4o", "gpt-4.1"] },
  { id: "anthropic", label: "Claude (Anthropic)", prefix: "anthropic", apiBase: "", suggest: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-5"] },
  { id: "gemini", label: "Gemini (Google)", prefix: "gemini", apiBase: "", suggest: ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "moonshot", label: "Kimi (Moonshot)", prefix: "moonshot", apiBase: "https://api.moonshot.ai/v1", suggest: ["kimi-k3"] },
  { id: "deepseek", label: "DeepSeek", prefix: "deepseek", apiBase: "", suggest: ["deepseek-chat"] },
  { id: "other", label: "Other (OpenAI-compatible)", prefix: "openai", apiBase: "", suggest: [], needsBase: true },
];

export const providerById = (id: string): Provider | undefined => PROVIDERS.find((p) => p.id === id);

export type NewModelInput = { alias: string; provider: string; model: string; apiKey: string; apiBase?: string };
export type ModelFieldError = "alias" | "aliasTaken" | "provider" | "model" | "apiKey" | "apiBase";
export type Checked = { ok: true; value: { alias: string; litellmModel: string; apiKey: string; apiBase: string } } | { ok: false; field: ModelFieldError };

const ALIAS_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;

/** The name to use for a model: lower case letters, digits and hyphens, from whatever was typed. */
export const slugAlias = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** An https address with a host, no credentials in it. (The server also refuses private hosts.) */
export function isHttpsBase(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password && v.length <= 300;
  } catch { return false; }
}

export function checkNewModel(input: Partial<NewModelInput>, existingAliases: string[]): Checked {
  const alias = slugAlias(String(input.alias ?? ""));
  if (!ALIAS_RE.test(alias) || alias.startsWith("mock-")) return { ok: false, field: "alias" };
  if (existingAliases.includes(alias)) return { ok: false, field: "aliasTaken" };
  const p = providerById(String(input.provider ?? ""));
  if (!p) return { ok: false, field: "provider" };
  const model = String(input.model ?? "").trim();
  if (!MODEL_RE.test(model)) return { ok: false, field: "model" };
  const apiKey = String(input.apiKey ?? "").trim();
  if (apiKey.length < 8 || apiKey.length > 500 || /\s/.test(apiKey)) return { ok: false, field: "apiKey" };
  const given = String(input.apiBase ?? "").trim();
  const apiBase = given || p.apiBase;
  if (p.needsBase && !apiBase) return { ok: false, field: "apiBase" };
  if (apiBase && !isHttpsBase(apiBase)) return { ok: false, field: "apiBase" };
  return { ok: true, value: { alias, litellmModel: `${p.prefix}/${model}`, apiKey, apiBase } };
}
