import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkNewModel, slugAlias, isHttpsBase } from "../lib/aiModelAdmin";

const ok = { alias: "My GPT", provider: "openai", model: "gpt-4o-mini", apiKey: "sk-abcdefgh12345" };

describe("adding a model: what is accepted", () => {
  test("a normal entry becomes a gateway model name, an alias slug and the provider's prefix", () => {
    const r = checkNewModel(ok, []);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, { alias: "my-gpt", litellmModel: "openai/gpt-4o-mini", apiKey: "sk-abcdefgh12345", apiBase: "" });
  });
  test("Kimi gets its own endpoint, and another OpenAI-compatible service needs one", () => {
    const k = checkNewModel({ ...ok, provider: "moonshot", model: "kimi-k3" }, []);
    assert.equal(k.ok && k.value.apiBase, "https://api.moonshot.ai/v1");
    assert.deepEqual(checkNewModel({ ...ok, provider: "other" }, []), { ok: false, field: "apiBase" });
    assert.equal(checkNewModel({ ...ok, provider: "other", apiBase: "https://llm.example.org/v1" }, []).ok, true);
  });
  test("refuses a taken or malformed name, an unknown provider, a bad model id, a short or spaced key", () => {
    assert.deepEqual(checkNewModel(ok, ["my-gpt"]), { ok: false, field: "aliasTaken" });
    assert.deepEqual(checkNewModel({ ...ok, alias: "" }, []), { ok: false, field: "alias" });
    assert.deepEqual(checkNewModel({ ...ok, alias: "mock-chatgpt" }, []), { ok: false, field: "alias" });
    assert.deepEqual(checkNewModel({ ...ok, provider: "evil" }, []), { ok: false, field: "provider" });
    assert.deepEqual(checkNewModel({ ...ok, model: "gpt 4; rm" }, []), { ok: false, field: "model" });
    assert.deepEqual(checkNewModel({ ...ok, apiKey: "short" }, []), { ok: false, field: "apiKey" });
    assert.deepEqual(checkNewModel({ ...ok, apiKey: "sk-has a space-inside" }, []), { ok: false, field: "apiKey" });
  });
  test("an endpoint must be https without credentials", () => {
    for (const bad of ["http://llm.example.org/v1", "ftp://x.org", "https://user:pw@x.org/v1", "not a url", "javascript:alert(1)"]) {
      assert.equal(isHttpsBase(bad), false, bad);
      assert.deepEqual(checkNewModel({ ...ok, provider: "other", apiBase: bad }, []), { ok: false, field: "apiBase" });
    }
    assert.equal(isHttpsBase("https://api.example.org/v1"), true);
  });
  test("slugAlias makes a safe name from any text", () => {
    assert.equal(slugAlias("  My Model_2!! "), "my-model-2");
    assert.equal(slugAlias("ChatGPT ก"), "chatgpt");
  });
});
