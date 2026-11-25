"use client";
// Shared by every tenant's contact/complaint/application forms. Strapi has a
// full captcha-protected public-write flow (src/middlewares/captcha-guard.ts
// + src/utils/captcha.ts) that DGA/PEA's generic FormBlock.tsx still uses
// unchanged. ORST/RoyalSociety moved their own complaint/contact/application
// forms to native WordPress (Phase 7 — wordpress/mu-plugins/
// public-forms-api.php), which exposes the exact same {id, question}
// challenge shape at its own URL — so useCaptcha() takes which engine to
// hit rather than becoming two near-identical hooks. Default stays "strapi"
// so FormBlock.tsx's existing `useCaptcha()` call (no args) is completely
// unaffected by this.
import { useEffect, useState, useCallback } from "react";

import { PUBLIC_CMS, PUBLIC_RUNTIME, PUBLIC_WP } from "@/lib/publicCms";
/** Browser-facing CMS URL ("" when the published site has no CMS; lib/publicCms.ts): what the assistant calls. */
export const STRAPI = PUBLIC_CMS;
/** Where the forms and their captcha are: the WebX control plane when PUBLIC_CONTROL_URL is set (webx-control's forms.rs and
 *  captcha.rs), the CMS as before otherwise. The captcha and the form it guards must be one service, so both use this. */
export const FORMS = PUBLIC_RUNTIME;
/** Browser-facing WordPress REST base ("" when the published site has none). */
export const WORDPRESS = PUBLIC_WP;

export type Captcha = { id: string; question: string };
export type CaptchaEngine = "strapi" | "wordpress";

function captchaUrl(engine: CaptchaEngine): string {
  return engine === "wordpress" ? `${WORDPRESS}/webx/v1/captcha` : `${FORMS}/api/captcha`;
}

export function useCaptcha(engine: CaptchaEngine = "strapi") {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const refreshCaptcha = useCallback(async () => {
    if (engine === "strapi" ? !FORMS : !WORDPRESS) return; // no CMS behind this copy
    try {
      const r = await fetch(captchaUrl(engine), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setCaptcha(j?.data ?? null);
    } catch {
      // Left null — the submit handler surfaces a real "temporarily
      // unavailable" error rather than letting the citizen submit with no
      // captcha and get a confusing rejection from the server instead.
    }
  }, [engine]);
  useEffect(() => { void refreshCaptcha(); }, [refreshCaptcha]);
  return { captcha, refreshCaptcha };
}
