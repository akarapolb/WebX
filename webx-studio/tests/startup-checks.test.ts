// Studio refuses to start in production with the scheduler password that is written in the public repository
// (lib/startupChecks.ts, called from instrumentation.ts).
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { PUBLIC_DEFAULT_SCHEDULER_PASSWORD, assertSafeToStart, publicDefaults } from "../lib/startupChecks";
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

describe("instrumentation register()", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, NEXT_RUNTIME: env.NEXT_RUNTIME, AGENT_WORKER_ENABLED: env.AGENT_WORKER_ENABLED, STRAPI_SCHEDULER_PASSWORD: env.STRAPI_SCHEDULER_PASSWORD };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete env[k]; else env[k] = v; }
  });

  it("stops the server from starting: it throws, so the process does not come up", async () => {
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "nodejs";
    env.AGENT_WORKER_ENABLED = "0";
    env.STRAPI_SCHEDULER_PASSWORD = PUBLIC_DEFAULT_SCHEDULER_PASSWORD;
    await assert.rejects(register(), /will not start in production/);
  });

  it("starts normally with a private password", async () => {
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "nodejs";
    env.AGENT_WORKER_ENABLED = "0"; // do not start the job worker inside a unit test
    env.STRAPI_SCHEDULER_PASSWORD = "a-private-one";
    await assert.doesNotReject(register());
  });
});
