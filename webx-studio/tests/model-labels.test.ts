import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { modelLabel, providerLabel, mocksFor } from "../lib/modelLabels";

describe("model display names", () => {
  test("known providers show the name people know; others show their own name or the alias", () => {
    assert.equal(modelLabel({ alias: "webx-default", provider: "anthropic" }), "Claude");
    assert.equal(modelLabel({ alias: "webx-thai", provider: "gemini" }), "Gemini");
    assert.equal(modelLabel({ alias: "webx-kimi", provider: "moonshot" }), "Kimi");
    assert.equal(modelLabel({ alias: "webx-x", provider: "mistral" }), "mistral");
    assert.equal(modelLabel({ alias: "webx-y" }), "webx-y");
    assert.equal(providerLabel("openai"), "ChatGPT");
  });
  test("a ChatGPT placeholder is listed only while the gateway has no OpenAI model", () => {
    assert.deepEqual(mocksFor([{ provider: "anthropic" }, { provider: "gemini" }]).map((m) => m.label), ["ChatGPT"]);
    assert.deepEqual(mocksFor([{ provider: "openai" }]), []);
    assert.ok(mocksFor([]).every((m) => m.mock === true));
  });
});
