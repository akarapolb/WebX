// What the WordPress adapter decrypts on the way out (lib/cms/wordpress.ts, PII_FIELDS): the personal data
// wordpress/mu-plugins/pii-crypto.php encrypts on submit, a contact message's e-mail and phone included. Only a value of the exact
// shape webx_pii_encrypt() writes is decrypted: WordPress's own test was looser and stored some plain values as sent (a phone
// number like 02.123.4567), which must be read as they are rather than fail the list. Own file: the key is read on import.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
/** webx_pii_encrypt(): AES-256-GCM, a 12-byte IV, base64 iv.ciphertext.tag dot-joined. */
function wpEncrypt(plain: string, key = KEY): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, ct, c.getAuthTag()].map((b) => b.toString("base64")).join(".");
}

let posts: Record<string, any[]> = {};
const realFetch = globalThis.fetch;
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.pathname.endsWith("/wp/v2/wtenant")) return json([{ id: 6, slug: "orst" }]);
  const type = url.pathname.split("/").pop() || "";
  const list = posts[type] || [];
  return json(list, { "X-WP-Total": String(list.length), "X-WP-TotalPages": "1" });
}
const post = (id: number, title: string, acf: Record<string, unknown>) =>
  ({ id, status: "publish", date: "2026-11-01T10:00:00", modified: "2026-11-01T10:00:00", title: { rendered: title }, wtenant: [6], acf });

let wp: typeof import("../lib/cms/wordpress");
let strapi: typeof import("../lib/strapi");
before(async () => {
  process.env.WORDPRESS_URL = "http://wp.test/wp-json";
  process.env.WEBX_WP_PII_KEY = KEY.toString("base64");
  globalThis.fetch = fakeFetch as typeof fetch;
  wp = await import("../lib/cms/wordpress");
  strapi = await import("../lib/strapi");
});
after(() => { globalThis.fetch = realFetch; });
const list = (uid: string) => strapi.withServiceToken("dXNlcjphcHA=", () => wp.wordpressAdapter.entries.list<any>(uid, { filter: [{ field: "tenant.key", op: "eq", value: "orst" }] }));

describe("personal data WordPress encrypted", () => {
  it("a contact message's e-mail and phone are decrypted; its sender is the title, plain", async () => {
    posts = { "contact-message": [post(1, "ผู้ติดต่อ", { email: wpEncrypt("a@b.co"), phone: wpEncrypt("081-234-5678"), subject: "s", message: "m" })] };
    const [row] = (await list("wp:contact-message")).data;
    assert.equal(row.email, "a@b.co");
    assert.equal(row.phone, "081-234-5678");
    assert.equal(row.title, "ผู้ติดต่อ");
  });

  it("a plain value that only looks encrypted is read as it is, and does not fail the list", async () => {
    posts = { "contact-message": [post(2, "N", { email: "", phone: "02.123.4567" })], complaint: [post(3, "ORST-CMP-2569-111111", { name: wpEncrypt("สมชาย"), email: "old@plain.example", phone: "02.123.4567" })] };
    assert.equal((await list("wp:contact-message")).data[0].phone, "02.123.4567");
    const [c] = (await list("wp:complaint")).data;
    assert.deepEqual([c.name, c.email, c.phone], ["สมชาย", "old@plain.example", "02.123.4567"]);
  });

  it("a value that is ciphertext under another key still fails, so a wrong key is noticed", async () => {
    posts = { complaint: [post(4, "ORST-CMP-2569-222222", { name: wpEncrypt("สมชาย", OTHER_KEY) })] };
    await assert.rejects(list("wp:complaint"));
  });
});
