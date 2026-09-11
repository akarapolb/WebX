import { redirect } from "next/navigation";
import { sessionToken, sessionEngine, strapiMe, strapiGet } from "@/lib/strapi";
import { wordpressMe } from "@/lib/wordpress";
import { resolveMyTenant, mfaEnforcementStatus } from "@/lib/cms/governance";
import Shell from "@/components/Shell";
import SessionKeeper from "@/components/SessionKeeper";
import { TenantProvider } from "@/components/TenantProvider";
import { AgentProvider } from "@/components/agent/AgentProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = await sessionToken();
  const engine = await sessionEngine();
  const wp = engine === "wordpress";
  const me = token ? await (wp ? wordpressMe(token) : strapiMe(token)) : null;
  if (!me) redirect("/login");

  // Tenants come from the WebX console endpoint when present; otherwise a
  // single workspace. The console endpoint is Strapi-admin-session-only
  // (multi-tenant switching only works within one engine — see the Phase 6
  // plan) — a WordPress session always gets the single-workspace fallback,
  // now resolved to that org's real tenant record rather than a placeholder.
  const ctx = wp ? null : await strapiGet<any>("/api/console/context");
  const rawTenants = ctx?.tenants ?? ctx?.data?.tenants ?? [];
  let tenants =
    Array.isArray(rawTenants) && rawTenants.length
      ? rawTenants.map((t: any, i: number) => ({
          key: t.key ?? t.slug ?? String(t.id ?? i),
          name: t.name ?? t.label ?? `Tenant ${i + 1}`,
          plan: t.plan ?? "Workspace",
          brand: t.brand ?? {},
        }))
      : [];
  if (!tenants.length) {
    const mine = wp ? await resolveMyTenant() : null;
    tenants = [
      mine
        ? { key: mine.key, name: mine.name || mine.key, plan: "Connected to WordPress", brand: mine.brand ?? {} }
        : { key: "workspace", name: "My Workspace", plan: wp ? "Connected to WordPress" : "Connected to Strapi", brand: {} },
    ];
  }

  const user = {
    email: me.email ?? me.name ?? "",
    name: wp ? (me.name || me.email || "Admin") : ([me.firstname, me.lastname].filter(Boolean).join(" ") || me.email || "Admin"),
  };

  // Per-tenant "require MFA" (default off — see governance.ts's own
  // module comment). Strapi-engine only: a WordPress session has no TOTP
  // enrollment path here at all. Failure fails open (never locks anyone
  // out over a transient lookup error) — the same call, if it fails, will
  // simply fail again on the next page load.
  const mfa = wp ? null : await mfaEnforcementStatus().catch(() => null);

  return (
    <TenantProvider tenants={tenants} engine={engine}>
      <AgentProvider>
        <SessionKeeper />
        {/* Under WordPress there's no equivalent "extra" console endpoint to
            probe — reaching this point already proves the session is valid. */}
        <Shell user={user} connected={wp ? true : Boolean(ctx)} mfaEnforcement={mfa}>{children}</Shell>
      </AgentProvider>
    </TenantProvider>
  );
}
