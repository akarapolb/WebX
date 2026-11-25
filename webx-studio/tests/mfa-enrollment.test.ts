// Starting an MFA enrollment (lib/cms/mfaEnrollment.ts): with a second factor already on, a session alone cannot replace it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { beginMfaEnrollment, type MfaEnrollmentIo, type MfaEnrollmentRow } from "../lib/cms/mfaEnrollment";
import { CmsError } from "../lib/cms/types";

type Row = MfaEnrollmentRow & Record<string, unknown>;

/** A one-account store that records what the code under test asked of it. */
function fake(initial: Row | null, accepts: (code: string) => boolean = () => false) {
  const state = { row: initial ? { ...initial } : null as Row | null, saves: 0, verified: [] as string[] };
  const io: MfaEnrollmentIo = {
    find: async () => (state.row ? { ...state.row } : null),
    verifyCurrent: async (_email, code) => { state.verified.push(code); return accepts(code); },
    save: async (existing, data) => { state.saves++; state.row = { ...(existing ?? {}), ...data }; },
  };
  return { io, state };
}

const ON: Row = { documentId: "d1", adminEmail: "a@example.org", secret: "OLDSECRET", enabled: true, recoveryCodesHash: ["h1"], recoveryCodesUsed: [] };
const refused = (pattern: RegExp) => (e: unknown) => e instanceof CmsError && e.status === 403 && pattern.test(e.message);

describe("beginMfaEnrollment", () => {
  it("lets an account with no second factor start, with no code", async () => {
    const { io, state } = fake(null);
    await beginMfaEnrollment("A@Example.org", "NEWSECRET", undefined, io);
    assert.equal(state.saves, 1);
    assert.deepEqual(state.row, { adminEmail: "a@example.org", secret: "NEWSECRET", enabled: false, recoveryCodesHash: null, recoveryCodesUsed: [] });
    assert.deepEqual(state.verified, [], "nothing to prove when nothing is on");
  });

  it("lets an enrollment that was started and never confirmed be started again", async () => {
    const { io, state } = fake({ ...ON, enabled: false, secret: "ABANDONED" });
    await beginMfaEnrollment("a@example.org", "NEWSECRET", undefined, io);
    assert.equal(state.row?.secret, "NEWSECRET");
    assert.deepEqual(state.verified, []);
  });

  it("refuses to replace a factor that is on when no code comes with the request, and changes nothing", async () => {
    for (const code of [undefined, "", "   "]) {
      const { io, state } = fake({ ...ON }, () => true);
      await assert.rejects(beginMfaEnrollment("a@example.org", "NEWSECRET", code, io), refused(/already on.*current code/i), JSON.stringify(code));
      assert.equal(state.saves, 0);
      assert.deepEqual(state.row, ON, "the secret and the switch are as they were");
      assert.deepEqual(state.verified, [], "an empty code is not even tried");
    }
  });

  it("refuses a wrong code, and changes nothing", async () => {
    const { io, state } = fake({ ...ON }, (c) => c === "123456");
    await assert.rejects(beginMfaEnrollment("a@example.org", "NEWSECRET", "000000", io), refused(/not right/));
    assert.equal(state.saves, 0);
    assert.deepEqual(state.row, ON);
    assert.deepEqual(state.verified, ["000000"]);
  });

  it("replaces the factor when the code is a current one, trimmed", async () => {
    const { io, state } = fake({ ...ON }, (c) => c === "123456");
    await beginMfaEnrollment("a@example.org", "NEWSECRET", " 123456 ", io);
    assert.deepEqual(state.verified, ["123456"]);
    assert.equal(state.saves, 1);
    assert.equal(state.row?.secret, "NEWSECRET");
    assert.equal(state.row?.documentId, "d1", "the same row, not a second one");
    assert.equal(state.row?.enabled, false, "on again only when the new secret is confirmed");
  });

  it("fails closed when the row cannot be read or the attempt limit is reached: nothing is written", async () => {
    const down = fake({ ...ON });
    down.io.find = async () => { throw new CmsError("MFA lookup temporarily unavailable", 503); };
    await assert.rejects(beginMfaEnrollment("a@example.org", "NEWSECRET", "123456", down.io), (e: any) => e.status === 503);
    assert.equal(down.state.saves, 0);

    const limited = fake({ ...ON });
    limited.io.verifyCurrent = async () => { throw new CmsError("Too many attempts — try again later", 429); };
    await assert.rejects(beginMfaEnrollment("a@example.org", "NEWSECRET", "123456", limited.io), (e: any) => e.status === 429);
    assert.equal(limited.state.saves, 0);
    assert.deepEqual(limited.state.row, ON);
  });
});
