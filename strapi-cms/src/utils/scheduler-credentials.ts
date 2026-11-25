/**
 * The scheduler service account's password (src/seed/seed.ts's seedScheduler).
 *
 * The account is a Super Admin that WebX Studio signs in as for scheduled releases, background jobs and SSO checks. Its
 * password used to fall back to a fixed development value written in the repository whenever STRAPI_SCHEDULER_PASSWORD
 * was not set, which is public: a production instance that missed the variable shipped a Super Admin that anyone who has
 * read the code can sign in as. The fallback now applies outside production only.
 *
 * Keep PUBLIC_DEFAULT_SCHEDULER_PASSWORD in step with webx-studio/lib/startupChecks.ts, which refuses to start with it.
 */
export const PUBLIC_DEFAULT_SCHEDULER_PASSWORD = 'WebxSched@2569';

/**
 * The password to create the account with, or null when none may be used (then the account is not created).
 *  - set to something else: that, in every environment;
 *  - not set: the development default, outside production only;
 *  - set to the public default in production: refused, the same as not set.
 */
export function schedulerSeedPassword(env: Record<string, string | undefined>): string | null {
  const given = env.STRAPI_SCHEDULER_PASSWORD;
  const production = env.NODE_ENV === 'production';
  if (!given) return production ? null : PUBLIC_DEFAULT_SCHEDULER_PASSWORD;
  if (production && given === PUBLIC_DEFAULT_SCHEDULER_PASSWORD) return null;
  return given;
}
