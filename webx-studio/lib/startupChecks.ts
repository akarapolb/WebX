// What Studio refuses to run with in production (called from instrumentation.ts when the server starts).

/** The scheduler account's password as strapi-cms/src/seed/seed.ts used to fall back to it: written in a public repository.
 * Keep in step with strapi-cms/src/utils/scheduler-credentials.ts. */
export const PUBLIC_DEFAULT_SCHEDULER_PASSWORD = "WebxSched@2569";

type Env = Record<string, string | undefined>;

/** What in this environment is a secret everyone can read. */
export function publicDefaults(env: Env): string[] {
  const found: string[] = [];
  if (env.STRAPI_SCHEDULER_PASSWORD === PUBLIC_DEFAULT_SCHEDULER_PASSWORD) {
    found.push(
      "STRAPI_SCHEDULER_PASSWORD is the default written in the public repository (strapi-cms/src/seed/seed.ts). " +
      "The scheduler is a Super Admin, so anyone who has read the code can sign in to Strapi as it. Set a private " +
      "password in STRAPI_SCHEDULER_PASSWORD on Strapi and here, and change the account's password if it was created with the default.",
    );
  }
  return found;
}

/** Throws in production when a secret is still the public default, so the server does not come up exposed. Elsewhere it does nothing. */
export function assertSafeToStart(env: Env): void {
  if (env.NODE_ENV !== "production") return;
  const found = publicDefaults(env);
  if (found.length) throw new Error("WebX Studio will not start in production: " + found.join(" "));
}

/**
 * Says why on stderr, then ends the process with status 1 once the message has been written.
 *
 * Throwing from instrumentation's register() is not a refusal on its own: Next logs the error as an unhandled rejection and
 * leaves the process up, listening, answering 500 to every request (seen on Next 15.5 with `next start`), so a container
 * looks started and is only ever unhealthy. A refusal to start should end the process, where a supervisor and
 * `docker compose up` both see it. `exit` can be replaced, for tests.
 */
export function failFast(message: string, exit: (code: number) => void = (code) => process.exit(code)): Promise<void> {
  return new Promise((resolve) => {
    process.stderr.write(`\n${message}\n`, () => { exit(1); resolve(); });
  });
}
