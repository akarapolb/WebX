// Maps Strapi's admin users and tenants to webx-control's users (track C4): pure, so it can be tested
// without a Strapi. A user's workspaces are the tenants whose adminEmails list them, which is how Studio
// scopes an editor today (resolveEffectiveTenant); their role there is their Strapi role, as a slug.
// A Strapi super admin who is listed on no tenant is unscoped in Studio, so becomes superAdmin here.
const slug = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

export function mapUsers(strapiUsers, tenants) {
  const out = [];
  const problems = [];
  for (const u of strapiUsers) {
    const email = String(u.email || "").trim().toLowerCase();
    if (!email) { problems.push("a Strapi user has no email"); continue; }
    const roles = (u.roles || []).map((r) => ({ code: r.code, name: r.name }));
    const isSuper = roles.some((r) => r.code === "strapi-super-admin");
    const role = slug((roles.find((r) => r.code !== "strapi-super-admin") || roles[0] || { name: "editor" }).name) || "editor";
    const memberships = [];
    for (const t of tenants) {
      const listed = (Array.isArray(t.adminEmails) ? t.adminEmails : []).some((x) => String(x).trim().toLowerCase() === email);
      if (listed) memberships.push({ tenantKey: t.key, role: isSuper ? "admin" : role });
    }
    const name = [u.firstname, u.lastname].filter(Boolean).join(" ") || null;
    out.push({ email, body: { name, disabled: u.isActive === false, superAdmin: isSuper && memberships.length === 0, memberships } });
  }
  return { users: out, problems };
}
