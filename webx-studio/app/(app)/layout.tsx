import { redirect } from "next/navigation";
import { sessionToken, strapiMe, strapiGet } from "@/lib/strapi";
import Shell from "@/components/Shell";
import { TenantProvider } from "@/components/TenantProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = await sessionToken();
  const me = token ? await strapiMe(token) : null;
  if (!me) redirect("/login");

  // Tenants come from the WebX console endpoint when present; otherwise a single workspace.
  const ctx = await strapiGet<any>("/api/console/context");
  const rawTenants = ctx?.tenants ?? ctx?.data?.tenants ?? [];
  const tenants =
    Array.isArray(rawTenants) && rawTenants.length
      ? rawTenants.map((t: any, i: number) => ({
          key: t.key ?? t.slug ?? String(t.id ?? i),
          name: t.name ?? t.label ?? `Tenant ${i + 1}`,
          plan: t.plan ?? "Workspace",
          brand: t.brand ?? {},
        }))
      : [{ key: "workspace", name: "My Workspace", plan: "Connected to Strapi", brand: {} }];

  const user = {
    email: me.email ?? "",
    name: [me.firstname, me.lastname].filter(Boolean).join(" ") || me.email || "Admin",
  };

  return (
    <TenantProvider tenants={tenants}>
      <Shell user={user} connected={Boolean(ctx)}>{children}</Shell>
    </TenantProvider>
  );
}
