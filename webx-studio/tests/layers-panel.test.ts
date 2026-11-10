import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { layerName, layerId } from "../components/LayersPanel";
import { translate } from "../lib/i18n";

const th = (k: string) => translate("th", k);
const en = (k: string) => translate("en", k);

describe("layer names", () => {
  test("parts of an item read as words", () => {
    assert.equal(layerName({ kind: "comp", key: "itemIcon.2" }, en), "Item 3 · icon");
    assert.equal(layerName({ kind: "comp", key: "itemTitle.0" }, th), "รายการ 1 · หัวข้อ");
    assert.equal(layerName({ kind: "comp", key: "items.1" }, en), "Item 2");
  });
  test("the section, its background and the template's own pictures", () => {
    assert.equal(layerName({ kind: "comp", key: "section" }, en), "Section");
    assert.equal(layerName({ kind: "bg", key: "background" }, th), "พื้นหลัง");
    assert.equal(layerName({ kind: "layer", key: "photo" }, en), "Hero picture");
    assert.equal(layerName({ kind: "layer", key: "slides" }, th), "สไลด์โชว์");
  });
  test("an unknown layer keeps its own key", () => {
    assert.equal(layerName({ kind: "layer", key: "mystery" }, en), "mystery");
    assert.equal(layerName({ kind: "comp", key: "heading" }, en), "heading");
  });
  test("the id the preview expects", () => {
    assert.equal(layerId(3, { kind: "layer", key: "photo" }), "3|layer|photo");
  });
});

test("a card in a tab reads as its tab and its place", () => {
  assert.equal(layerName({ kind: "comp", key: "tab1Item.2" }, en), "Tab 2 · Item 3");
  assert.equal(layerName({ kind: "comp", key: "tab0Item.0" }, th), "แท็บ 1 · รายการ 1");
});
