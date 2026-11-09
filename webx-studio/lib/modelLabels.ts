// The names people know the AI models by, shown in the chat's model picker and the Agent settings. Display only: the
// alias the gateway serves (webx-default, webx-kimi, ...) is still what a run sends, and nothing in the gateway's
// config changes. A provider with no friendly name shows its own name.

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini", google: "Gemini", vertex_ai: "Gemini",
  moonshot: "Kimi", ollama: "Llama (local)", huggingface: "Hugging Face",
};

export const providerLabel = (provider: string): string => PROVIDER_LABEL[provider] || provider || "";

/** "Claude" for anthropic/claude-sonnet-4-5, "Gemini" for gemini/gemini-2.0-flash, "Kimi" for moonshot/kimi-k3 … */
export const modelLabel = (m: { alias: string; provider?: string }): string => providerLabel(m.provider || "") || m.alias;

/** A placeholder row for a well-known assistant the gateway does not serve yet, so the list shows the familiar
 * names. It is never selectable and never sent anywhere. */
export type MockModel = { alias: string; label: string; provider: string; mock: true };
export const MOCK_MODELS: MockModel[] = [
  { alias: "mock-chatgpt", label: "ChatGPT", provider: "openai", mock: true },
];

/** The mock rows whose provider the gateway does not really serve. */
export const mocksFor = (real: { provider?: string }[]): MockModel[] =>
  MOCK_MODELS.filter((m) => !real.some((r) => (r.provider || "") === m.provider));
