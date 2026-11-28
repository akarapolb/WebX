// The forms of a WordPress tenant (ORST, the Royal Society): contact messages, complaints and job applications. Decision D6
// moves them to the WebX control plane: with PUBLIC_CONTROL_URL set they go to webx-control's form routes (forms.rs), as every
// other tenant's forms do (components/blocks/FormBlock.tsx); without it, to WordPress's own routes, as before
// (wordpress/mu-plugins/public-forms-api.php). Both take the same fields, in different envelopes, and name a wrong captcha
// differently; this file is the one place that knows both. The captcha must come from where the form goes, so it is here too.
//
// No "use client": plain code, so tests can load it.
import { PUBLIC_CONTROL, PUBLIC_RUNTIME, PUBLIC_WP } from "./publicCms";

export type WpFormKind = "complaint" | "contact-message" | "application";

/** Whether a WordPress tenant's forms, and their captcha, go to webx-control (PUBLIC_CONTROL_URL is set). */
export const WP_FORMS_IN_CONTROL = PUBLIC_CONTROL !== "";

/** Where a WordPress tenant's forms go ("" when the published site has nowhere to send them). */
export function wpFormsBase(inControl = WP_FORMS_IN_CONTROL): string {
  return inControl ? PUBLIC_RUNTIME : PUBLIC_WP;
}

/** The captcha a WordPress tenant's form is checked against: the one at the service the form goes to. */
export function wpCaptchaUrl(inControl = WP_FORMS_IN_CONTROL): string {
  return inControl ? `${PUBLIC_RUNTIME}/api/captcha` : `${PUBLIC_WP}/webx/v1/captcha`;
}

const CONTROL_PATH: Record<WpFormKind, string> = { complaint: "/api/complaints", "contact-message": "/api/contact-messages", application: "/api/applications" };
const WP_PATH: Record<WpFormKind, string> = { complaint: "/webx/v1/complaints/submit", "contact-message": "/webx/v1/contact-messages", application: "/webx/v1/applications" };
/** The field a form's file is kept under, as both services name it. */
const FILE_FIELD: Partial<Record<WpFormKind, string>> = { complaint: "attachment", application: "resume" };

/** The request that submits one form for `tenant`: `fields` are the form's own (name, email, ...; empty ones are left out),
 *  `file` its attachment or resume. webx-control takes `{data, captchaId, captchaAnswer}` as JSON, or multipart with `data` as
 *  JSON text and the file as `files.<field>` (forms.rs); WordPress takes the fields bare, the application as multipart. */
export function wpFormRequest(
  kind: WpFormKind,
  tenant: string,
  fields: Record<string, unknown>,
  captcha: { id: string; answer: string },
  file?: File | null,
  inControl = WP_FORMS_IN_CONTROL,
): { url: string; init: RequestInit } {
  const q = `?tenant=${encodeURIComponent(tenant)}`;
  const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const attach = file && file.size > 0 ? file : null;
  const fileField = FILE_FIELD[kind];
  if (inControl) {
    if (attach && fileField) {
      const mp = new FormData();
      mp.append("data", JSON.stringify(given));
      mp.append(`files.${fileField}`, attach, attach.name);
      mp.append("captchaId", captcha.id);
      mp.append("captchaAnswer", captcha.answer);
      return { url: `${PUBLIC_RUNTIME}${CONTROL_PATH[kind]}/submit${q}`, init: { method: "POST", body: mp } };
    }
    return {
      url: `${PUBLIC_RUNTIME}${CONTROL_PATH[kind]}${q}`,
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: given, captchaId: captcha.id, captchaAnswer: captcha.answer }) },
    };
  }
  if (kind === "application") {
    const mp = new FormData();
    for (const [k, v] of Object.entries(given)) mp.set(k, String(v));
    mp.set("captchaId", captcha.id);
    mp.set("captchaAnswer", captcha.answer);
    if (attach) mp.set("resume", attach);
    return { url: `${PUBLIC_WP}${WP_PATH[kind]}${q}`, init: { method: "POST", body: mp } };
  }
  return {
    url: `${PUBLIC_WP}${WP_PATH[kind]}${q}`,
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...given, captchaId: captcha.id, captchaAnswer: captcha.answer }) },
  };
}

/** Whether a refusal says the captcha answer was wrong or has expired: webx-control names it CaptchaError, WordPress captcha_error. */
export function isCaptchaRefusal(body: unknown): boolean {
  const b = body as { error?: { name?: string }; code?: string } | null;
  return b?.error?.name === "CaptchaError" || b?.code === "captcha_error";
}
