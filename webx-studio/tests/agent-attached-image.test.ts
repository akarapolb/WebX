import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { imageFileFromDataUrl, attachedFileName, isSafeBackgroundUrl } from "../lib/agent/attachedImage";

// A real 1×1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("imageFileFromDataUrl", () => {
  test("a real PNG becomes a file with a safe name", () => {
    const r = imageFileFromDataUrl(PNG, "Hero background!");
    assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.file.name, "hero-background.png"); assert.equal(r.type, "image/png"); assert.ok(r.bytes > 0); }
  });
  test("nothing attached", () => {
    const r = imageFileFromDataUrl(undefined);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /attach/);
  });
  test("a type that is not an image we accept (SVG can carry script)", () => {
    assert.equal(imageFileFromDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=").ok, false);
    assert.equal(imageFileFromDataUrl("data:text/html;base64,PGI+eDwvYj4=").ok, false);
  });
  test("bytes that are not really the type it claims", () => {
    const fake = "data:image/png;base64," + Buffer.from("<html>not a png</html>").toString("base64");
    assert.equal(imageFileFromDataUrl(fake).ok, false);
  });
  test("too big", () => {
    const big = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(4_100_000)]).toString("base64");
    const r = imageFileFromDataUrl(big);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /4 MB/);
  });
});

describe("names and addresses", () => {
  test("a file name with no usable letters gets a generated one", () => {
    assert.match(attachedFileName("พื้นหลัง", "jpg"), /^chat-image-\d+\.jpg$/);
  });
  test("background addresses", () => {
    assert.equal(isSafeBackgroundUrl("https://cms.example.org/wp-content/uploads/a.jpg"), true);
    assert.equal(isSafeBackgroundUrl("/uploads/a.jpg"), true);
    assert.equal(isSafeBackgroundUrl('https://x.org/a.jpg"); background:red'), false);
    assert.equal(isSafeBackgroundUrl("javascript:alert(1)"), false);
    assert.equal(isSafeBackgroundUrl("//evil.org/a.jpg"), false);
    assert.equal(isSafeBackgroundUrl("data:image/png;base64,xx"), false);
  });
});
