// The secret the scheduler routes check (lib/secretCompare.ts, lib/internalAuth.ts), and a walk over every route under
// app/api/internal to make sure each one is behind one of the two approved checks, run before the handler does anything.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { secretMatches } from "../lib/secretCompare";
import { schedulerSecretRefusal } from "../lib/internalAuth";

describe("secretMatches", () => {
  it("is true only for the exact secret", () => {
    assert.equal(secretMatches("s3cret-value", "s3cret-value"), true);
    assert.equal(secretMatches("s3cret-valuf", "s3cret-value"), false, "last character");
    assert.equal(secretMatches("x3cret-value", "s3cret-value"), false, "first character");
    assert.equal(secretMatches("S3CRET-VALUE", "s3cret-value"), false, "case");
    assert.equal(secretMatches("s3cret-value ", "s3cret-value"), false, "trailing space");
    assert.equal(secretMatches("s3cret", "s3cret-value"), false, "a prefix");
    assert.equal(secretMatches("s3cret-value-and-more", "s3cret-value"), false, "longer");
    assert.equal(secretMatches("", "s3cret-value"), false);
    assert.equal(secretMatches(null, "s3cret-value"), false);
    assert.equal(secretMatches(undefined, "s3cret-value"), false);
  });

  it("matches nothing when no secret is set, not even an empty guess", () => {
    for (const expected of ["", null, undefined]) {
      for (const given of ["", null, undefined, "anything", "undefined", "null"]) {
        assert.equal(secretMatches(given, expected), false, `${JSON.stringify(given)} against ${JSON.stringify(expected)}`);
      }
    }
  });

  it("compares text, including non-ASCII, not bytes of some other encoding", () => {
    assert.equal(secretMatches("ลับสุดยอด", "ลับสุดยอด"), true);
    assert.equal(secretMatches("ลับสุดยอด", "ลับสุดยอ"), false);
  });
});

describe("schedulerSecretRefusal", () => {
  const post = (headers: Record<string, string> = {}) => new Request("http://studio.test/api/internal/releases/process-due", { method: "POST", headers });

  it("lets the caller that sends the secret through", () => {
    assert.equal(schedulerSecretRefusal(post({ "x-internal-secret": "right" }), "right"), null);
    assert.equal(schedulerSecretRefusal(post({ "X-Internal-Secret": "right" }), "right"), null, "header names are not case-sensitive");
  });

  it("answers 401 to a missing, wrong or partial secret", async () => {
    const bad: Record<string, string>[] = [{}, { "x-internal-secret": "" }, { "x-internal-secret": "wrong" }, { "x-internal-secret": "righ" }, { "x-internal-secret": "rightt" }];
    for (const headers of bad) {
      const res = schedulerSecretRefusal(post(headers), "right");
      assert.equal(res?.status, 401, JSON.stringify(headers));
      assert.deepEqual(await res?.json(), { error: "unauthorized" });
    }
    assert.equal(schedulerSecretRefusal(post({ authorization: "Bearer right" }), "right")?.status, 401, "only the internal-secret header counts");
  });

  it("answers 401 to everyone when no secret is configured", () => {
    const any: Record<string, string>[] = [{}, { "x-internal-secret": "" }, { "x-internal-secret": "undefined" }];
    for (const headers of any) {
      assert.equal(schedulerSecretRefusal(post(headers), "")?.status, 401, JSON.stringify(headers));
    }
  });
});

describe("every route under app/api/internal", () => {
  const dir = path.join(__dirname, "..", "app", "api", "internal");
  const files = (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => /(^|[\\/])route\.ts$/.test(f));
  const gates = ["schedulerSecretRefusal(", "gatewayAuthorized("];

  it("was found (this test is not vacuous)", () => {
    assert.ok(files.length >= 6, `only ${files.length} routes found: ${files.join(", ")}`);
  });

  it("checks one of the approved secrets, before it awaits anything, and does not compare a secret itself", () => {
    const problems: string[] = [];
    for (const file of files) {
      // Comments may name the secret (they explain it); only code counts.
      const src = fs.readFileSync(path.join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const handler = src.slice(src.indexOf("export async function POST("));
      const gate = Math.min(...gates.map((g) => handler.indexOf(g)).map((i) => (i < 0 ? Infinity : i)));
      if (!Number.isFinite(gate)) { problems.push(`${file}: no approved secret check`); continue; }
      const firstAwait = handler.indexOf("await ");
      if (firstAwait >= 0 && firstAwait < gate) problems.push(`${file}: awaits before the secret check`);
      if (/headers\.get\(\s*["']x-internal-secret["']\s*\)/i.test(src)) problems.push(`${file}: reads the secret header itself`);
      if (/WEBX_SCHEDULER_SECRET/.test(src)) problems.push(`${file}: uses WEBX_SCHEDULER_SECRET directly`);
      if (/(!==|===|!=|==)\s*[A-Za-z_.]*SECRET/.test(src)) problems.push(`${file}: compares a secret with an operator`);
    }
    assert.deepEqual(problems, []);
  });
});
