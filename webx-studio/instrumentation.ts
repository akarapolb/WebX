// Next.js calls register() once when a server process starts. It refuses to start
// production with a secret that is the public default (lib/startupChecks.ts: throwing
// here stops the server), then starts the background job worker (Node runtime only;
// the tick route starts it too, as a backstop). Set AGENT_WORKER_ENABLED=0 for
// processes that shouldn't run jobs.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeToStart } = await import("./lib/startupChecks");
    assertSafeToStart(process.env);
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.AGENT_WORKER_ENABLED !== "0") {
    const { ensureWorkerStarted } = await import("./lib/agent/worker");
    ensureWorkerStarted();
  }
}
