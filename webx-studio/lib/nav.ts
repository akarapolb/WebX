export type NavItem = { id: string; label: string; icon: string; k: number; group: string };

export const GROUPS: Record<string, string> = {
  main: "Workspace",
  build: "Build",
  admin: "Administration",
};

// Content types grouped into collapsible sidebar menus (deep-link to /content?type=).
// The Content page itself has no inner rail — navigation lives here in the sidebar.
export type ContentType = { api: string; th: string; en: string };
export type ContentMenu = { id: string; icon: string; th: string; en: string; types: ContentType[] };
export const CONTENT_MENUS: ContentMenu[] = [
  {
    id: "content", icon: "doc", th: "เนื้อหา", en: "Content", types: [
      { api: "article", th: "ข่าว / บทความ", en: "Articles" },
      { api: "service", th: "บริการ (e-Service)", en: "Services" },
      { api: "event", th: "กิจกรรม", en: "Events" },
      { api: "faq", th: "คำถามที่พบบ่อย", en: "FAQ" },
      { api: "catalog", th: "e-Catalog", en: "Catalog" },
      { api: "download", th: "ดาวน์โหลด", en: "Downloads" },
      { api: "ebook", th: "e-Book", en: "E-books" },
      { api: "blog", th: "บล็อก", en: "Blog" },
      { api: "award", th: "รางวัล", en: "Awards" },
      { api: "job", th: "ตำแหน่งงาน", en: "Jobs" },
      { api: "home-page", th: "หน้าแรก", en: "Home Page" },
      { api: "landing", th: "Landing Page", en: "Landing" },
    ],
  },
  {
    id: "media", icon: "img", th: "สื่อ · มีเดีย", en: "Media", types: [
      { api: "banner", th: "แบนเนอร์", en: "Banners" },
      { api: "gallery", th: "แกลเลอรี", en: "Gallery" },
      { api: "video", th: "วิดีโอ", en: "Video" },
      { api: "top-graphic", th: "Top Graphic", en: "Top Graphic" },
      { api: "popup", th: "ป๊อปอัป", en: "Popups" },
    ],
  },
  {
    id: "more", icon: "package", th: "อื่นๆ", en: "More", types: [
      { api: "menu-item", th: "เมนูนำทาง", en: "Menu Items" },
      { api: "weblink", th: "ลิงก์ภายนอก", en: "Web Links" },
      { api: "location", th: "สถานที่ (แผนที่)", en: "Locations" },
      { api: "poll", th: "โพล / แบบสำรวจ", en: "Polls" },
      { api: "review", th: "รีวิว", en: "Reviews" },
    ],
  },
];

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "home", k: 1, group: "main" },
  { id: "content", label: "Content", icon: "doc", k: 2, group: "main" },
  { id: "forms", label: "Forms", icon: "inbox", k: 3, group: "main" },
  { id: "search", label: "AI Search", icon: "spark", k: 4, group: "main" },
  { id: "builder", label: "Visual Builder", icon: "layout", k: 5, group: "build" },
  { id: "reviews", label: "Reviews", icon: "check", k: 6, group: "build" },
  { id: "releases", label: "Releases", icon: "package", k: 7, group: "build" },
  { id: "branding", label: "Branding", icon: "palette", k: 8, group: "build" },
  { id: "users", label: "Users & Roles", icon: "users", k: 9, group: "admin" },
  { id: "field-access", label: "Field Access", icon: "lock", k: 10, group: "admin" },
  { id: "audit", label: "Audit Log", icon: "shield", k: 11, group: "admin" },
  { id: "tokens", label: "API & Tokens", icon: "code", k: 12, group: "admin" },
];
