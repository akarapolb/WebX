// No imports: shared by the pure engine and lib/llm.ts.

export type LlmErrorKind =
  | "network" | "timeout" | "rate_limit" | "server" | "context_length"
  | "bad_request" | "auth" | "not_found" | "unprocessable" | "unknown";

export class LlmError extends Error {
  readonly status: number;
  readonly kind: LlmErrorKind;
  readonly retryAfterMs?: number;
  readonly body?: string;
  constructor(message: string, o: { status: number; kind: LlmErrorKind; retryAfterMs?: number; body?: string }) {
    super(message);
    this.name = "LlmError";
    this.status = o.status;
    this.kind = o.kind;
    this.retryAfterMs = o.retryAfterMs;
    this.body = o.body;
  }
}

export function classifyHttp(status: number, body: string): LlmErrorKind {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 422) return "unprocessable";
  if (status === 409 || status === 425 || status >= 500) return "server";
  if (status === 400 || status === 413) {
    return /context.{0,20}(length|window)|maximum context|too many tokens|prompt is too long/i.test(body) ? "context_length" : "bad_request";
  }
  return "unknown";
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}
