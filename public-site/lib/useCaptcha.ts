"use client";
// Shared by both tenants' contact forms. Strapi already has a full
// captcha-protected public-write flow built for contact-message/complaint/
// application/registration (src/middlewares/captcha-guard.ts +
// src/utils/captcha.ts) — this is the client half neither tenant's contact
// form was ever wired up to. GET /api/captcha issues a one-time arithmetic
// challenge {id, question}; the id + the citizen's answer travel alongside
// the actual form payload as top-level captchaId/captchaAnswer fields (not
// nested under `data`) — that's where the guard middleware reads them from.
import { useEffect, useState, useCallback } from "react";

export const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");

export type Captcha = { id: string; question: string };

export function useCaptcha() {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const refreshCaptcha = useCallback(async () => {
    try {
      const r = await fetch(`${STRAPI}/api/captcha`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setCaptcha(j?.data ?? null);
    } catch {
      // Left null — the submit handler surfaces a real "temporarily
      // unavailable" error rather than letting the citizen submit with no
      // captcha and get a confusing rejection from the server instead.
    }
  }, []);
  useEffect(() => { void refreshCaptcha(); }, [refreshCaptcha]);
  return { captcha, refreshCaptcha };
}
