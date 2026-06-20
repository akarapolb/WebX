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
  { id: "builder", label: "Visual Builder", icon: "layout", k: 5, group: "build" },
  { id: "branding", label: "Branding", icon: "palette", k: 6, group: "build" },
  { id: "users", label: "Users & Roles", icon: "users", k: 7, group: "admin" },
  { id: "audit", label: "Audit Log", icon: "shield", k: 8, group: "admin" },
  { id: "tokens", label: "API & Tokens", icon: "code", k: 9, group: "admin" },
];
