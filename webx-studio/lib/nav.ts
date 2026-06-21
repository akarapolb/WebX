export type NavItem = { id: string; label: string; icon: string; k: number; group: string };

export const GROUPS: Record<string, string> = {
  main: "Workspace",
  build: "Build",
  admin: "Administration",
};

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "home", k: 1, group: "main" },
  { id: "content", label: "Content", icon: "doc", k: 2, group: "main" },
  { id: "forms", label: "Forms", icon: "inbox", k: 3, group: "main" },
  { id: "search", label: "AI Search", icon: "spark", k: 4, group: "main" },
  { id: "analytics", label: "Analytics", icon: "chart", k: 14, group: "main" },
  { id: "builder", label: "Visual Builder", icon: "layout", k: 5, group: "build" },
  { id: "reviews", label: "Reviews", icon: "check", k: 6, group: "build" },
  { id: "releases", label: "Releases", icon: "package", k: 7, group: "build" },
  { id: "branding", label: "Branding", icon: "palette", k: 8, group: "build" },
  { id: "users", label: "Users & Roles", icon: "users", k: 9, group: "admin" },
  { id: "field-access", label: "Field Access", icon: "lock", k: 10, group: "admin" },
  { id: "audit", label: "Audit Log", icon: "shield", k: 11, group: "admin" },
  { id: "content-audit", label: "Content Audit", icon: "activity", k: 12, group: "admin" },
  { id: "consent", label: "Cookie Consent", icon: "cookie", k: 15, group: "admin" },
  { id: "schema", label: "Schema / SEO", icon: "code", k: 16, group: "admin" },
  { id: "billing", label: "Plans & Billing", icon: "card", k: 17, group: "admin" },
  { id: "tokens", label: "API & Tokens", icon: "code", k: 13, group: "admin" },
];
