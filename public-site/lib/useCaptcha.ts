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

export const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
export const WORDPRESS = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "http://localhost:8081/wp-json").replace(/\/$/, "");

export type Captcha = { id: string; question: string };
export type CaptchaEngine = "strapi" | "wordpress";

function captchaUrl(engine: CaptchaEngine): string {
  return engine === "wordpress" ? `${WORDPRESS}/webx/v1/captcha` : `${STRAPI}/api/captcha`;
}

export function useCaptcha(engine: CaptchaEngine = "strapi") {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const refreshCaptcha = useCallback(async () => {
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
