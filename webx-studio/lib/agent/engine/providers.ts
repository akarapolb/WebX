export type ProviderFamily = "anthropic" | "moonshot" | "google" | "openai" | "local" | "other";

export type ProviderInfo = {
  family: ProviderFamily;
  contextTokens: number;
  /** Which reasoning field this provider expects echoed back on its own assistant messages. */
  echo: "reasoning_content" | "thinking_blocks" | "none";
};

// Aliases from litellm/config.yaml.
const KNOWN: Record<string, ProviderInfo> = {
  "webx-default": { family: "anthropic", contextTokens: 200_000, echo: "thinking_blocks" },
  "webx-kimi": { family: "moonshot", contextTokens: 256_000, echo: "reasoning_content" },
  "webx-thai": { family: "google", contextTokens: 1_000_000, echo: "none" },
  "webx-local": { family: "local", contextTokens: 32_000, echo: "none" },
};

export function providerFor(model: string): ProviderInfo {
  if (KNOWN[model]) return KNOWN[model];
  const m = (model || "").toLowerCase();
  if (/kimi|moonshot/.test(m)) return { family: "moonshot", contextTokens: 128_000, echo: "reasoning_content" };
  if (/claude|anthropic/.test(m)) return { family: "anthropic", contextTokens: 200_000, echo: "thinking_blocks" };
  if (/gemini/.test(m)) return { family: "google", contextTokens: 1_000_000, echo: "none" };
  if (/gpt|openai|\bo[134]\b/.test(m)) return { family: "openai", contextTokens: 128_000, echo: "none" };
  return { family: "other", contextTokens: 32_000, echo: "none" };
}

/** True when reasoning produced by `servedBy` may be echoed to `target`. */
export function sameReasoningTarget(servedBy: string, target: string): boolean {
  if (servedBy === target) return true;
  const a = providerFor(servedBy).family;
  return a !== "other" && a === providerFor(target).family;
}
