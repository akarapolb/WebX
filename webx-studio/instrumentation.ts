// Next.js calls register() once when a server process starts. It starts the
// background job worker there (Node runtime only; the tick route starts it too,
// as a backstop). Set AGENT_WORKER_ENABLED=0 for processes that shouldn't run jobs.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.AGENT_WORKER_ENABLED !== "0") {
    const { ensureWorkerStarted } = await import("./lib/agent/worker");
    ensureWorkerStarted();
  }
}
