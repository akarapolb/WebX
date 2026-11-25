// Studio refuses to start in production with the scheduler password that is written in the public repository
// (lib/startupChecks.ts, called from instrumentation.ts).
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { PUBLIC_DEFAULT_SCHEDULER_PASSWORD, assertSafeToStart, failFast, publicDefaults } from "../lib/startupChecks";
import { register } from "../instrumentation";

describe("assertSafeToStart", () => {
  it("refuses production with the public default scheduler password, and says how to fix it", () => {
    const env = { NODE_ENV: "production", STRAPI_SCHEDULER_PASSWORD: PUBLIC_DEFAULT_SCHEDULER_PASSWORD };
    assert.throws(() => assertSafeToStart(env), /will not start in production.*STRAPI_SCHEDULER_PASSWORD.*public/s);
  });

  it("starts production with a private password, or with none (the scheduler then simply cannot sign in)", () => {
    assert.doesNotThrow(() => assertSafeToStart({ NODE_ENV: "production", STRAPI_SCHEDULER_PASSWORD: "a-private-one" }));
    assert.doesNotThrow(() => assertSafeToStart({ NODE_ENV: "production" }));
    assert.doesNotThrow(() => assertSafeToStart({ NODE_ENV: "production", STRAPI_SCHEDULER_PASSWORD: "" }));
    assert.doesNotThrow(() => assertSafeToStart({ NODE_ENV: "production", STRAPI_SCHEDULER_PASSWORD: PUBLIC_DEFAULT_SCHEDULER_PASSWORD + "-changed" }));
  });

  it("leaves development and test alone, where the default is what the seed uses", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      assert.doesNotThrow(() => assertSafeToStart({ NODE_ENV, STRAPI_SCHEDULER_PASSWORD: PUBLIC_DEFAULT_SCHEDULER_PASSWORD }), String(NODE_ENV));
    }
  });

  it("names what it found", () => {
    assert.deepEqual(publicDefaults({}), []);
    assert.equal(publicDefaults({ STRAPI_SCHEDULER_PASSWORD: PUBLIC_DEFAULT_SCHEDULER_PASSWORD }).length, 1);
  });
});

/** Replaces stderr and process.exit for one call, recording what was written and the exit codes asked for. */
async function capturing<T>(run: () => Promise<T>): Promise<{ said: string; exits: (number | undefined)[]; result: PromiseSettledResult<T> }> {
  const realWrite = process.stderr.write;
  const realExit = process.exit;
  let said = "";
  const exits: (number | undefined)[] = [];
  process.stderr.write = ((chunk: unknown, cb?: unknown) => { said += String(chunk); if (typeof cb === "function") cb(); return true; }) as typeof process.stderr.write;
  process.exit = ((code?: number) => { exits.push(code); }) as typeof process.exit;
  try {
    const [result] = await Promise.allSettled([run()]);
    return { said, exits, result };
  } finally {
    process.stderr.write = realWrite;
    process.exit = realExit;
  }
}

describe("failFast", () => {
  it("writes the message first, then ends the process with status 1", async () => {
    const order: string[] = [];
    const realWrite = process.stderr.write;
    process.stderr.write = ((chunk: unknown, cb?: unknown) => { order.push("write:" + String(chunk).trim()); if (typeof cb === "function") cb(); return true; }) as typeof process.stderr.write;
    try {
      await failFast("the reason", (code) => order.push("exit:" + code));
    } finally {
      process.stderr.write = realWrite;
    }
    assert.deepEqual(order, ["write:the reason", "exit:1"]);
  });
});

describe("instrumentation register()", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, NEXT_RUNTIME: env.NEXT_RUNTIME, AGENT_WORKER_ENABLED: env.AGENT_WORKER_ENABLED, STRAPI_SCHEDULER_PASSWORD: env.STRAPI_SCHEDULER_PASSWORD };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete env[k]; else env[k] = v; }
  });

  it("ends the process with status 1 and says why: a throw alone leaves a server up that answers 500 to everything", async () => {
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "nodejs";
    env.AGENT_WORKER_ENABLED = "0";
    env.STRAPI_SCHEDULER_PASSWORD = PUBLIC_DEFAULT_SCHEDULER_PASSWORD;
    const { said, exits, result } = await capturing(() => register());
    assert.deepEqual(exits, [1]);
    assert.match(said, /WebX Studio will not start in production.*STRAPI_SCHEDULER_PASSWORD/s);
    assert.equal(result.status, "rejected", "and where exit is not final, the server still does not prepare");
  });

  it("starts normally with a private password: no exit, nothing written", async () => {
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "nodejs";
    env.AGENT_WORKER_ENABLED = "0"; // do not start the job worker inside a unit test
    env.STRAPI_SCHEDULER_PASSWORD = "a-private-one";
    const { said, exits, result } = await capturing(() => register());
    assert.equal(result.status, "fulfilled");
    assert.deepEqual(exits, []);
    assert.equal(said, "");
  });

  it("does not look at production secrets outside the Node runtime or outside production", async () => {
    env.AGENT_WORKER_ENABLED = "0";
    env.STRAPI_SCHEDULER_PASSWORD = PUBLIC_DEFAULT_SCHEDULER_PASSWORD;
    env.NODE_ENV = "development";
    env.NEXT_RUNTIME = "nodejs";
    assert.deepEqual((await capturing(() => register())).exits, []);
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "edge";
    assert.deepEqual((await capturing(() => register())).exits, []);
  });
});
