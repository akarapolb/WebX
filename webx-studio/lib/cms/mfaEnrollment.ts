// Starting an MFA enrollment (governance.ts's startMfaEnrollment), with what it needs from the outside passed in so the
// refusals can be tested without a Strapi.
//
// Starting writes a NEW secret over the account's row and leaves it un-enabled until a code from it is confirmed. While a
// second factor is already on, that is a downgrade of the account: anyone holding the session (a stolen cookie, a page
// that made the browser post, a colleague at an unlocked desk) could call it, which switches the second factor OFF, then
// confirm their own authenticator and read the new recovery codes. So with a factor on, starting takes a current code
// from it first (an authenticator code, or a recovery code as at sign-in). The proof goes through the same per-account
// attempt limit as signing in, so it cannot be guessed here either.
//
// Left for the identity work (docs/c4-identity-plan.md step 4): the old factor still stops counting between starting and
// confirming, and a code just used to sign in still works here within its 30 seconds.
import { CmsError } from "./types";

export type MfaEnrollmentRow = { documentId?: string; id?: string | number; enabled?: boolean };

export type MfaEnrollmentIo = {
  /** The account's enrollment row, or null when it has none; throws when the lookup itself fails. */
  find(email: string): Promise<MfaEnrollmentRow | null>;
  /** True for a current authenticator code or an unused recovery code of this account; counts the attempt. */
  verifyCurrent(email: string, code: string): Promise<boolean>;
  /** Writes the row (update when `existing`, else create). */
  save(existing: MfaEnrollmentRow | null, data: Record<string, unknown>): Promise<void>;
};

export async function beginMfaEnrollment(email: string, secret: string, currentCode: string | undefined, io: MfaEnrollmentIo): Promise<void> {
  const existing = await io.find(email);
  if (existing?.enabled) {
    const code = typeof currentCode === "string" ? currentCode.trim() : "";
    if (!code) {
      throw new CmsError("Two-step verification is already on for this account. Enter a current code from your authenticator app, or a recovery code, to replace it.", 403);
    }
    if (!(await io.verifyCurrent(email, code))) {
      throw new CmsError("That code is not right, so the authenticator was not replaced.", 403);
    }
  }
  await io.save(existing, { adminEmail: email.toLowerCase(), secret, enabled: false, recoveryCodesHash: null, recoveryCodesUsed: [] });
}
