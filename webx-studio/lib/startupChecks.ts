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
