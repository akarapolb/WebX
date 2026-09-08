"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms } from "@/lib/cms";

// First-run checklist for a new workspace. Steps auto-complete from real signals;
// hides itself once everything's done or the user dismisses it (per workspace).
const TEN = "api::tenant.tenant";

export default function Onboarding() {
  const { t } = useLang();
  const { currentKey, engine } = useTenant();
  const key = currentKey && currentKey !== "workspace" ? currentKey : "";
  const [steps, setSteps] = useState<{ id: string; done: boolean; href: string }[]>([]);
  const [dismissed, setDismissed] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const count = useCallback(async (uid: string) => {
    try {
      // Strapi-side tenant.key filter — WordPress scopes WP_SCOPED uids
      // server-side via the caller's own session, not a client filter (see
      // dashboard/page.tsx's identical fix for why this must be engine-gated).
      const filter = engine !== "wordpress" && key ? [{ field: "tenant.key", op: "eq" as const, value: key }] : undefined;
      const { total } = await cms.entries.list(uid, { page: 1, pageSize: 1, filter });
      return total ?? 0;
    } catch { return 0; }
  }, [key, engine]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let dis = false;
      try { dis = localStorage.getItem("webx_onboard_" + (key || "default")) === "1"; } catch {}
      // no "|| dga" fallback — silently checked a DIFFERENT real tenant's
      // brand/roster for the "Set your brand" / "Invite a teammate" steps.
      // tenant.tenant is genuinely Strapi-only regardless of engine (tenant
      // records always live in Strapi — see earlier session notes), so an
      // empty key here legitimately means "no match," handled by tn=null below.
      const tn = key ? await cms.entries.list<any>(TEN, { pageSize: 1, filter: [{ field: "key", op: "eq" as const, value: key }] }).then((r) => r.data[0]).catch(() => null) : null;
      // api::article.article / api::landing.landing are Strapi-only uids —
      // wp:post / wp:page are WordPress's own equivalents (a landing page
      // built in Visual Builder is stored as a wp:page there, see
      // lib/cms/wordpress.ts's POST_TYPES). Same silent-400 bug class as
      // dashboard/page.tsx: content/pages a WordPress tenant genuinely has
      // never counted, so "Add your first content"/"Build a landing page"
      // could never complete for ORST/RoyalSociety/NBTC.
      const [content, landings] = engine === "wordpress"
        ? await Promise.all([count("wp:post"), count("wp:page")])
        : await Promise.all([count("api::article.article"), count("api::landing.landing")]);
      if (!alive) return;
      setSteps([
        { id: "create", done: true, href: "/dashboard" },
        { id: "brand", done: Boolean(tn?.brand?.primaryColor), href: "/branding" },
        { id: "content", done: content > 0, href: "/content" },
        { id: "page", done: landings > 0, href: "/builder" },
        { id: "invite", done: Array.isArray(tn?.adminEmails) && tn.adminEmails.length > 1, href: "/users" },
      ]);
      setDismissed(dis);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [key, count]);

  const done = steps.filter((s) => s.done).length;
  const all = steps.length || 5;
  if (!loaded || dismissed || done >= all) return null;

  function dismiss() { try { localStorage.setItem("webx_onboard_" + (key || "default"), "1"); } catch {} setDismissed(true); }

  return (
    <div className="panel" style={{ marginBottom: 16, border: "1px solid var(--acc, #EE5020)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="spark" /><h3 style={{ margin: 0 }}>{t("ob.title")}</h3>
        <span className="badge b-acc">{done}/{all}</span>
        <button className="btn btn--g" style={{ marginLeft: "auto", padding: "2px 10px" }} onClick={dismiss}>{t("ob.dismiss")}</button>
      </div>
      <div style={{ height: 8, background: "var(--line)", borderRadius: 6, overflow: "hidden", margin: "10px 0 14px" }}>
        <div style={{ height: "100%", width: (done / all) * 100 + "%", background: "var(--acc, #EE5020)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: s.done ? "var(--ok)" : "var(--muted)", display: "inline-flex" }}><Icon name={s.done ? "check" : "chevron"} /></span>
            <span style={{ textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.55 : 1 }}>{t("ob." + s.id)}</span>
            {!s.done && <Link href={s.href} className="btn btn--g" style={{ marginLeft: "auto", padding: "2px 10px" }}>{t("ob.go")}</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}
