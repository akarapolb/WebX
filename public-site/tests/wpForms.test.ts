// lib/wpForms.ts: where a WordPress tenant's forms go (decision D6) and in which envelope. Own file: lib/publicCms.ts reads
// its addresses when first imported, and each test file runs in its own process.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PUBLIC_CMS_URL = "https://cms.example";
process.env.PUBLIC_CONTROL_URL = "https://control.example/";
process.env.PUBLIC_WORDPRESS_URL = "https://wp.example/wp-json";

const captcha = { id: "c1", answer: "7" };
const fields = { name: "สมชาย", email: "a@b.co", phone: "", note: undefined, subject: "s" };

test("with PUBLIC_CONTROL_URL set, a WordPress tenant's forms and captcha go to webx-control", async () => {
  const f = await import("@/lib/wpForms");
  assert.equal(f.WP_FORMS_IN_CONTROL, true);
  assert.equal(f.wpFormsBase(), "https://control.example");
  assert.equal(f.wpCaptchaUrl(), "https://control.example/api/captcha");

  const c = f.wpFormRequest("complaint", "orst", fields, captcha);
  assert.equal(c.url, "https://control.example/api/complaints?tenant=orst");
  assert.deepEqual(JSON.parse(String(c.init.body)), { data: { name: "สมชาย", email: "a@b.co", subject: "s" }, captchaId: "c1", captchaAnswer: "7" }, "the envelope forms.rs reads; empty fields left out");

  const m = f.wpFormRequest("contact-message", "royal society", { name: "N", message: "m" }, captcha);
  assert.equal(m.url, "https://control.example/api/contact-messages?tenant=royal%20society");

  const resume = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "cv.pdf", { type: "application/pdf" });
  const a = f.wpFormRequest("application", "royalsociety", { jobId: "J1", position: "P", name: "N" }, captcha, resume);
  assert.equal(a.url, "https://control.example/api/applications/submit?tenant=royalsociety");
  const mp = a.init.body as FormData;
  assert.deepEqual(JSON.parse(String(mp.get("data"))), { jobId: "J1", position: "P", name: "N" });
  assert.equal((mp.get("files.resume") as File).name, "cv.pdf");
  assert.equal(mp.get("captchaId"), "c1");
  assert.equal(mp.get("captchaAnswer"), "7");

  const noFile = f.wpFormRequest("application", "orst", { name: "N" }, captcha, new File([], "empty.pdf"));
  assert.equal(noFile.url, "https://control.example/api/applications?tenant=orst", "an empty file is no file: plain JSON");

  const c2 = f.wpFormRequest("complaint", "orst", { detail: "d" }, captcha, resume);
  assert.equal(c2.url, "https://control.example/api/complaints/submit?tenant=orst");
  assert.ok((c2.init.body as FormData).get("files.attachment"), "a complaint's file is its attachment");
});

test("without it, WordPress's own routes, as before", async () => {
  const f = await import("@/lib/wpForms");
  assert.equal(f.wpFormsBase(false), "https://wp.example/wp-json");
  assert.equal(f.wpCaptchaUrl(false), "https://wp.example/wp-json/webx/v1/captcha");

  const c = f.wpFormRequest("complaint", "orst", fields, captcha, null, false);
  assert.equal(c.url, "https://wp.example/wp-json/webx/v1/complaints/submit?tenant=orst");
  assert.deepEqual(JSON.parse(String(c.init.body)), { name: "สมชาย", email: "a@b.co", subject: "s", captchaId: "c1", captchaAnswer: "7" }, "WordPress takes the fields bare");

  const m = f.wpFormRequest("contact-message", "orst", { name: "N" }, captcha, null, false);
  assert.equal(m.url, "https://wp.example/wp-json/webx/v1/contact-messages?tenant=orst");

  const resume = new File([new Uint8Array([1])], "cv.pdf");
  const a = f.wpFormRequest("application", "orst", { jobId: "J1", name: "N" }, captcha, resume, false);
  assert.equal(a.url, "https://wp.example/wp-json/webx/v1/applications?tenant=orst");
  const mp = a.init.body as FormData;
  assert.equal(mp.get("jobId"), "J1");
  assert.equal((mp.get("resume") as File).name, "cv.pdf");
  assert.equal(mp.get("captchaAnswer"), "7");
});

test("a wrong captcha is recognised from either service", async () => {
  const { isCaptchaRefusal } = await import("@/lib/wpForms");
  assert.equal(isCaptchaRefusal({ data: null, error: { status: 400, name: "CaptchaError", message: "x" } }), true);
  assert.equal(isCaptchaRefusal({ code: "captcha_error", message: "x" }), true);
  assert.equal(isCaptchaRefusal({ error: { name: "ValidationError" } }), false);
  assert.equal(isCaptchaRefusal(null), false);
});
