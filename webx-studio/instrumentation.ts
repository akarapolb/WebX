// Next.js calls register() once when a server process starts. It refuses to start
// production with a secret that is the public default (lib/startupChecks.ts: the
// process ends with status 1; a throw alone would leave a server up that answers 500
// to everything), then starts the background job worker (Node runtime only; the
// tick route starts it too, as a backstop). Set AGENT_WORKER_ENABLED=0 for
// processes that shouldn't run jobs.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeToStart, failFast } = await import("./lib/startupChecks");
    try {
      assertSafeToStart(process.env);
    } catch (e) {
      await failFast((e as Error).message);
      throw e; // only reached where exit is not final (a test); the server does not prepare
    }
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.AGENT_WORKER_ENABLED !== "0") {
    const { ensureWorkerStarted } = await import("./lib/agent/worker");
    ensureWorkerStarted();
  }
}
