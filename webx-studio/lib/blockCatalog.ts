// The Visual Builder's own block-type catalog — extracted verbatim from
// components/VisualBuilder.tsx (a "use client" component the server can't
// import) so lib/agent/tools.ts's page-building tools (get_page_blocks/
// insert_blocks/replace_block/remove_block/list_block_types) can share the
// EXACT SAME definitions VisualBuilder.tsx's own palette/add/addAt/metaOf
// use — one catalog, not a second copy that could drift. VisualBuilder.tsx
// re-imports everything here; nothing about its own behavior changed by
// this extraction (confirmed via `git diff` reducing to an import swap plus
// the literal data moving, no logic changes).
//
// Pure data + one pure lookup function — no React, no "use client", safe
// for both the client (VisualBuilder.tsx) and the server (lib/agent/tools.ts)
// to import.

// `cat` groups the palette below into scannable sections once there were
// enough block types that a single flat grid (20+ and growing) became a
// pure scroll-and-scan exercise — see BLOCK_CATEGORIES just below.
export const TYPES = [
  { comp: "block.hero", key: "vb.hero", icon: "layout", cat: "content", fields: [{ k: "kicker" }, { k: "heading" }, { k: "subheading", ta: true }, { k: "ctaLabel" }, { k: "ctaUrl" }], def: { heading: "New hero", subheading: "Describe your offer here", ctaLabel: "Get started" } },
  { comp: "block.richtext", key: "vb.richtext", icon: "doc", cat: "content", fields: [{ k: "body", rich: true }], def: { body: "<p>Write something compelling…</p>" } },
  { comp: "block.cta-banner", key: "vb.cta", icon: "cta", cat: "content", fields: [{ k: "heading" }, { k: "text", ta: true }, { k: "buttonLabel" }, { k: "buttonUrl" }], def: { heading: "Ready to start?", text: "", buttonLabel: "Get started", buttonUrl: "#" } },
  { comp: "block.image", key: "vb.image", icon: "img", cat: "content", fields: [{ k: "caption" }], def: { caption: "" } },
  { comp: "block.feature-grid", key: "vb.features", icon: "grid", cat: "grids", fields: [{ k: "heading" }], def: { heading: "Features", items: [{ title: "Feature", text: "" }, { title: "Feature", text: "" }, { title: "Feature", text: "" }] } },
  // Live-data blocks (highlights/news-panel/video-channel/awards/faq): hold
  // only framing config — the content itself is pulled at request time from
  // the tenant's own banners/articles/videos/awards/faqs collections (see
  // public-site/components/blocks/BlockRenderer.tsx), same as the legacy
  // hardcoded sections already do. Nothing to preview inline here.
  { comp: "block.highlights", key: "vb.highlights", icon: "img", cat: "live", fields: [], def: {} },
  { comp: "block.stat-row", key: "vb.statrow", icon: "grid", cat: "grids", fields: [], def: { items: [{ icon: "users", value: "0", label: "Label" }, { icon: "grid", value: "0", label: "Label" }] } },
  { comp: "block.news-panel", key: "vb.newspanel", icon: "doc", cat: "live", fields: [{ k: "newsTabLabel" }, { k: "articleTabLabel" }], def: { newsTabLabel: "DGA News", articleTabLabel: "บทความ" } },
  { comp: "block.video-channel", key: "vb.videochannel", icon: "img", cat: "live", fields: [{ k: "title" }], def: { title: "DGA Channel" } },
  { comp: "block.awards", key: "vb.awards", icon: "grid", cat: "live", fields: [{ k: "eyebrow" }, { k: "title" }, { k: "subtitle", ta: true }], def: { eyebrow: "ความภาคภูมิใจของเรา", title: "DGA Auditorium", subtitle: "" } },
  { comp: "block.faq", key: "vb.faq", icon: "doc", cat: "live", fields: [{ k: "eyebrow" }, { k: "title" }], def: { eyebrow: "ถาม–ตอบ", title: "คำถามที่พบบ่อย" } },
  { comp: "block.featured-promo", key: "vb.featuredpromo", icon: "cta", cat: "promo", fields: [{ k: "eyebrow" }, { k: "title" }, { k: "description", ta: true }, { k: "primaryLabel" }, { k: "primaryUrl" }, { k: "secondaryLabel" }, { k: "secondaryUrl" }], def: { title: "New featured promo", primaryLabel: "Get started", primaryUrl: "#", items: [] } },
  // Webflow-style Embed escape hatch — raw HTML/CSS/JS, for cases the block
  // library can't cover. `html` runs as-is on the live site (see
  // BlockRenderer.tsx's EmbedBlock) — gated server-side by governance.ts's
  // embedCode custom-role permission, not by anything in this file.
  { comp: "block.embed", key: "vb.embed", icon: "code", cat: "promo", fields: [{ k: "label" }, { k: "html", code: true }], def: { label: "", html: "" } },
  // Webflow-style Collection List — binds to ANY content type (see
  // LISTABLE_UIDS below), renders a card grid, no per-type component
  // needed. Only `heading` is a plain field; the content-type + field
  // mappings get a bespoke sidebar block (see the block.collection-list
  // conditional further down), same as block.custom's dynamic form.
  { comp: "block.collection-list", key: "vb.collectionlist", icon: "card", cat: "grids", fields: [{ k: "heading" }],
    def: { heading: "", contentTypeUid: "", pluralName: "", titleField: "", imageField: "", excerptField: "", dateField: "", linkField: "", bodyField: "", linkToDetail: false,
      layout: "grid", videoUrlField: "", sortField: "createdAt", sortDir: "desc", pageSize: 12 } },
  // Public-facing forms (contact/complaint/application/registration) —
  // bound to one of a fixed, small set of write-only content types (see
  // FORM_FIELD_DEFS). Unlike block.collection-list, WHICH fields appear is
  // not admin-configurable — only the framing text below is. The
  // content-type/mode picker gets a bespoke sidebar block further down.
  { comp: "block.form", key: "vb.form", icon: "inbox", cat: "promo",
    fields: [{ k: "heading" }, { k: "consentText", ta: true }, { k: "submitLabel" }, { k: "successMessage", ta: true }],
    def: { heading: "ติดต่อเรา", contentTypeUid: "", mode: "submit",
      consentText: "ข้าพเจ้ายินยอมให้เก็บรวบรวมและใช้ข้อมูลตามนโยบายความเป็นส่วนตัว (PDPA)",
      submitLabel: "ส่งข้อมูล", successMessage: "ส่งข้อมูลเรียบร้อยแล้ว ขอบคุณที่ติดต่อเรา" } },
  // Small, self-contained blocks — same "framing block + repeatable item
  // component" shape as feature-grid/stat-row above, items edited via a
  // bespoke sidebar block further down (same convention as those two).
  { comp: "block.testimonials", key: "vb.testimonials", icon: "msg", cat: "promo", fields: [{ k: "heading" }],
    def: { heading: "เสียงจากผู้ใช้บริการ", items: [{ quote: "", author: "", role: "" }] } },
  { comp: "block.logo-cloud", key: "vb.logocloud", icon: "grid", cat: "grids", fields: [{ k: "heading" }],
    def: { heading: "", items: [] } },
  { comp: "block.team-grid", key: "vb.teamgrid", icon: "users", cat: "grids", fields: [{ k: "heading" }],
    def: { heading: "ทีมงานของเรา", items: [{ name: "", role: "" }] } },
  { comp: "block.blockquote", key: "vb.blockquote", icon: "msg", cat: "content", fields: [{ k: "quote", ta: true }, { k: "attribution" }],
    def: { quote: "", attribution: "" } },
  // No generic `fields` at all — style/size are enums, not text, so this
  // gets a small bespoke sidebar (like block.form's mode picker) instead.
  { comp: "block.spacer", key: "vb.spacer", icon: "layout", cat: "content", fields: [],
    def: { style: "space", size: "md" } },
  // Generic tabs/accordion — one item list, two display modes (b.layout).
  { comp: "block.tabs", key: "vb.tabs", icon: "layout", cat: "grids", fields: [{ k: "heading" }],
    def: { heading: "", layout: "tabs", items: [{ title: "Tab 1", body: "" }, { title: "Tab 2", body: "" }] } },
  // Parallel comparison/pricing cards — see the bespoke sidebar's own note
  // on why this isn't a synchronized row-by-row matrix.
  { comp: "block.comparison", key: "vb.comparison", icon: "grid", cat: "grids", fields: [{ k: "heading" }],
    def: { heading: "", columns: [{ name: "Plan A", features: [] }, { name: "Plan B", features: [] }] } },
];
// ORST's own 14 block types (public-site/templates/orst/Blocks.tsx) — a
// completely different dialect (`type`, not `__component`; see
// blockDialect.ts) and a completely different visual design (verified: zero
// shared CSS tokens or class names with gov-portal). `tpl: "orst"` is what
// paletteTypes below filters on so a gov-portal tenant never sees these and
// vice versa. Every entry's `comp` here is already namespaced
// ("orst." + Blocks.tsx's own type string) so ALL_TYPES stays one flat,
// collision-free array — metaOf/iconOf/labelOf/add/addAt/compName/aMeta
// need no changes at all because of this.
//
// Only ONE repeatable list per block type is exposed here (the `items`
// descriptor the generic editor below reads) even where Blocks.tsx supports
// more than one (e.g. page-hero also has a breadcrumb array, cta-band/
// two-column also have `actions`) — picked whichever list an editor is most
// likely to actually touch; the rest keeps whatever was seeded and can be
// hand-edited later via a raw-JSON view, matching this codebase's existing
// "not every field needs a no-code control in v1" precedent (see
// block.comparison's parallel-cards-not-matrix decision above). `table`
// has no items editor at all — its `columns`/`rows` shape is a genuine 2D
// grid the single-list `items` descriptor can't express.
//
// rich-text deliberately has NO `html` field in this palette — Blocks.tsx
// renders `b.html` via dangerouslySetInnerHTML, and exposing it here would
// hand every Builder editor a raw-script injection point on a live .go.th
// site with no permission gate (see governance.ts's hasEmbedBlock, which
// this palette avoids needing to extend by simply never offering the
// field). Only the safe, escaped `paragraphs` list is editable.
// Pieces ORST's shared Section wrapper (Blocks.tsx's Section/SectionHead)
// reads on every block that goes through it: `variant: "alt"` (tinted
// background) and a top-right "view all" link (`action: {label, href}`,
// rendered only when href is set).
const ORST_SEC = [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "variant", select: ["", "alt"] }];
const ORST_ACTION = { key: "action", fields: [{ k: "label" }, { k: "href" }] };
const ACTIONS = { key: "actions", fields: [{ k: "label" }, { k: "href" }, { k: "variant", select: ["", "ghost"] }], def: { label: "ปุ่ม", href: "#" } };
const uid = (p: string) => p + "-" + Math.random().toString(36).slice(2, 8);
export const ORST_TYPES = [
  { comp: "orst.page-hero", key: "vb.orst.pagehero", icon: "layout", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading", keep: true }, { k: "lead", ta: true }],
    items: ACTIONS,
    lists: [{ key: "breadcrumb", fields: [{ k: "label" }, { k: "href" }], def: { label: "หน้าแรก", href: "/" } }],
    def: { heading: "หัวข้อหน้า", lead: "", actions: [] } },
  { comp: "orst.rich-text", key: "vb.orst.richtext", icon: "doc", cat: "orst", tpl: "orst",
    fields: [...ORST_SEC, { k: "width", select: ["", "full"] }],
    objects: [ORST_ACTION],
    items: { key: "paragraphs", scalar: true, def: "" },
    def: { heading: "", paragraphs: ["เขียนเนื้อหาที่นี่"] } },
  { comp: "orst.card-grid", key: "vb.orst.cardgrid", icon: "card", cat: "orst", tpl: "orst",
    fields: [...ORST_SEC, { k: "columns", select: ["1", "2", "3", "4"] }],
    objects: [ORST_ACTION],
    items: { key: "items", fields: [{ k: "icon", icon: true }, { k: "title" }, { k: "body", ta: true }, { k: "meta" }, { k: "tag" }, { k: "href" }],
      def: { icon: "i-file", title: "หัวข้อ", body: "", href: "#" } },
    def: { heading: "", columns: "3", items: [] } },
  { comp: "orst.feature-list", key: "vb.orst.featurelist", icon: "grid", cat: "orst", tpl: "orst",
    fields: [...ORST_SEC, { k: "columns", select: ["1", "2", "3", "4"] }],
    objects: [ORST_ACTION],
    items: { key: "items", fields: [{ k: "icon", icon: true }, { k: "title" }, { k: "body", ta: true }], def: { icon: "i-shield", title: "หัวข้อ", body: "" } },
    def: { heading: "", columns: "3", items: [] } },
  { comp: "orst.stat-row", key: "vb.orst.statrow", icon: "grid", cat: "orst", tpl: "orst",
    fields: ORST_SEC,
    objects: [ORST_ACTION],
    items: { key: "items", fields: [{ k: "value" }, { k: "label" }, { k: "note" }], def: { value: "0", label: "ป้ายกำกับ" } },
    def: { heading: "", items: [] } },
  { comp: "orst.link-list", key: "vb.orst.linklist", icon: "doc", cat: "orst", tpl: "orst",
    fields: ORST_SEC,
    objects: [ORST_ACTION],
    items: { key: "items", fields: [{ k: "icon", icon: true }, { k: "title" }, { k: "desc", ta: true }, { k: "tag" }, { k: "meta" }, { k: "href" }],
      def: { icon: "i-file", title: "หัวข้อ", href: "#" } },
    def: { heading: "", items: [] } },
  { comp: "orst.media-grid", key: "vb.orst.mediagrid", icon: "img", cat: "orst", tpl: "orst",
    fields: [...ORST_SEC, { k: "columns", select: ["1", "2", "3", "4"] }],
    objects: [ORST_ACTION],
    items: { key: "items", fields: [{ k: "image" }, { k: "alt" }, { k: "title" }, { k: "desc", ta: true }, { k: "tag" }, { k: "href" }],
      def: { image: "", title: "หัวข้อ" } },
    def: { heading: "", columns: "3", items: [] } },
  { comp: "orst.steps", key: "vb.orst.steps", icon: "layout", cat: "orst", tpl: "orst",
    fields: ORST_SEC,
    objects: [ORST_ACTION],
    items: { key: "items", fields: [{ k: "title" }, { k: "body", ta: true }], def: { title: "ขั้นตอน", body: "" } },
    def: { heading: "", items: [] } },
  { comp: "orst.two-column", key: "vb.orst.twocolumn", icon: "layout", cat: "orst", tpl: "orst",
    fields: [...ORST_SEC, { k: "subheading" }, { k: "image", keep: true }, { k: "imageAlt" }, { k: "imageSide", select: ["", "left"] }],
    objects: [ORST_ACTION],
    items: { key: "paragraphs", scalar: true, def: "" },
    lists: [ACTIONS],
    def: { heading: "", subheading: "", image: "", paragraphs: [] } },
  { comp: "orst.contact-info", key: "vb.orst.contactinfo", icon: "msg", cat: "orst", tpl: "orst",
    fields: [...ORST_SEC, { k: "address", ta: true }, { k: "phone" }, { k: "email" }, { k: "hours" }, { k: "mapEmbed" }],
    objects: [ORST_ACTION],
    def: { address: "", phone: "", email: "", hours: "" } },
  // Ported from ContactPage.tsx during its full decomposition into blocks
  // (see app/orst/[page]/page.tsx) — a hero with an attached info-card,
  // which page-hero (no such card) doesn't model.
  { comp: "orst.contact-hero", key: "vb.orst.contacthero", icon: "layout", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "cta1Label" }, { k: "cta1Url" }, { k: "cta2Label" }, { k: "cta2Url" },
      { k: "officeHours" }, { k: "phone" }, { k: "email" }, { k: "address", ta: true }],
    def: { heading: "ติดต่อเรา", lead: "", cta1Label: "ส่งข้อความถึงเรา", cta1Url: "#contact-form", cta2Label: "ดูแผนที่และการเดินทาง", cta2Url: "https://www.google.com/maps" } },
  // The form's own fields (name/email/phone/subject/message) are fixed —
  // they're tied to a real Strapi content type's schema (see Blocks.tsx's
  // ContactFormBlock comment). Only framing text is editable here, same
  // convention as gov-portal's own block.form.
  { comp: "orst.contact-form", key: "vb.orst.contactform", icon: "inbox", cat: "orst", tpl: "orst",
    fields: [{ k: "kicker" }, { k: "heading" }, { k: "intro", ta: true }],
    def: { kicker: "Contact Form", heading: "ส่งข้อความถึงเรา", intro: "กรอกข้อมูลให้ครบถ้วน เจ้าหน้าที่จะพิจารณาและติดต่อกลับตามช่องทางที่ท่านระบุ" } },
  // Ported from KnowledgePage.tsx during its full decomposition — a hero
  // with an attached stat-list aside, distinct from contact-hero's info
  // card. The source page's search box/quick-chips were non-functional
  // decoration (confirmed by that page's own file comment) and were
  // dropped rather than ported inert, per the user's own "simplify to real
  // content" call.
  { comp: "orst.stats-hero", key: "vb.orst.statshero", icon: "layout", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "panelHeading" }, { k: "note", ta: true }],
    items: { key: "stats", fields: [{ k: "label" }, { k: "value" }], def: { label: "ป้ายกำกับ", value: "0" } },
    def: { heading: "หัวข้อ", lead: "", panelHeading: "ภาพรวม", stats: [] } },
  // Ported from HomePage.tsx during its full decomposition. A third,
  // distinct hero style (see Blocks.tsx's HomeHero comment) — no
  // breadcrumb/actions, no info card.
  // `image` falls back to a built-in hero picture when absent (Blocks.tsx's
  // HomeHero), so it can be replaced but not removed.
  { comp: "orst.home-hero", key: "vb.orst.homehero", icon: "layout", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading", keep: true }, { k: "lead", ta: true }, { k: "image", keep: true }, { k: "imageAlt" }],
    items: ACTIONS,
    def: { heading: "หัวข้อหน้าแรก", lead: "" } },
  // media-tabs/news-tabs: genuinely nested (tabs containing items, or a
  // featured object + side list per tab) — edited through ListDesc's own
  // nested `lists`/`objects`. A tab's `id` drives the renderer's DOM ids and
  // tab state, so new tabs get a unique one generated rather than a blank.
  { comp: "orst.media-tabs", key: "vb.orst.mediatabs", icon: "grid", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" }],
    lists: [{ key: "tabs", fields: [{ k: "label" }, { k: "kind", select: ["pub", "media"] }],
      def: () => ({ id: uid("tab"), label: "แท็บใหม่", kind: "pub", items: [] }),
      lists: [{ key: "items", fields: [{ k: "image" }, { k: "tag" }, { k: "title" }, { k: "caption", ta: true }], def: { image: "", title: "หัวข้อ", caption: "" } }] }],
    def: { heading: "คลังสื่อและองค์ความรู้", tabs: [] } },
  { comp: "orst.news-tabs", key: "vb.orst.newstabs", icon: "doc", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" }],
    lists: [{ key: "tabs", fields: [{ k: "label" }],
      def: () => ({ id: uid("tab"), label: "แท็บใหม่", featured: { title: "หัวข้อข่าว" }, side: [] }),
      objects: [{ key: "featured", fields: [{ k: "image" }, { k: "badge" }, { k: "date" }, { k: "category" }, { k: "title" }, { k: "body", ta: true }, { k: "ctaLabel" }] }],
      lists: [{ key: "side", fields: [{ k: "image" }, { k: "type" }, { k: "title" }, { k: "body", ta: true }], def: { title: "หัวข้อข่าว" } }] }],
    def: { heading: "ข่าวสารและกิจกรรม", tabs: [] } },
  // Two lists: the intro panel's numbered `steps` (numbers are automatic)
  // and the service `items` cards.
  { comp: "orst.service-hub", key: "vb.orst.servicehub", icon: "inbox", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" },
      { k: "introLabel" }, { k: "introHeading" }, { k: "introLead", ta: true }],
    items: { key: "items", fields: [{ k: "badge" }, { k: "time" }, { k: "title" }, { k: "body", ta: true }, { k: "buttonLabel" }, { k: "href" }],
      def: { title: "บริการใหม่", body: "", buttonLabel: "ใช้บริการ" } },
    lists: [{ key: "steps", fields: [{ k: "label" }], def: { label: "ขั้นตอน" } }],
    def: { heading: "บริการประชาชนดิจิทัล", steps: [], items: [] } },
  { comp: "orst.logo-marquee", key: "vb.orst.logomarquee", icon: "grid", cat: "orst", tpl: "orst",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" }],
    items: { key: "items", fields: [{ k: "name" }, { k: "image" }, { k: "href" }], def: { name: "หน่วยงาน", href: "#" } },
    def: { heading: "หน่วยงานและระบบที่เกี่ยวข้อง", items: [] } },
  // The one no-code "compose a new block" escape hatch for this template —
  // see Blocks.tsx's FlexPanel for the full rationale. `layout` picks which
  // of 6 pre-built, already-styled arrangements to render as; everything
  // else is the same generic fields/items shape every other type here uses,
  // so no new sidebar code was needed for this either.
  { comp: "orst.flex-panel", key: "vb.orst.flexpanel", icon: "layout", cat: "orst", tpl: "orst",
    // `tone` only affects the "banner" layout's icon/color (Blocks.tsx's
    // FlexPanel), and "banner" is the one layout that never reads `items` —
    // hiding both elsewhere keeps the sidebar from showing controls that
    // silently do nothing for whichever layout is currently selected.
    // "cta" is the one layout that skips Section, so it reads neither
    // eyebrow nor variant/action.
    fields: [{ k: "layout", select: ["cards", "banner", "list", "cta", "stats", "feature"] },
      { k: "eyebrow", when: (b: any) => b.layout !== "cta" }, { k: "heading" }, { k: "lead", ta: true },
      { k: "variant", select: ["", "alt"], when: (b: any) => b.layout !== "cta" },
      { k: "tone", select: ["info", "warn", "success"], when: (b: any) => b.layout === "banner" }],
    objects: [{ ...ORST_ACTION, when: (b: any) => b.layout !== "cta" }],
    items: { key: "items", fields: [{ k: "icon", icon: true, when: (b: any) => !["cta", "stats"].includes(b.layout) }, { k: "title" },
      { k: "body", ta: true, when: (b: any) => !["cta", "feature"].includes(b.layout) }, { k: "href", when: (b: any) => !["stats", "feature"].includes(b.layout) }],
      def: { title: "หัวข้อ" }, when: (b: any) => b.layout !== "banner" },
    def: { layout: "cards", heading: "", items: [] } },
  // Server-bound types — their content comes from a live WordPress feed
  // (`source`) or a WordPress poll post, so only the framing is editable
  // here and they're kept out of the palette (see noPalette).
  { comp: "orst.poll", key: "vb.orst.poll", icon: "msg", cat: "orst", tpl: "orst", noPalette: true,
    fields: [{ k: "heading" }, { k: "pollId", keep: true }], def: {} },
  { comp: "orst.event-calendar", key: "vb.orst.eventcalendar", icon: "doc", cat: "orst", tpl: "orst", noPalette: true,
    fields: ORST_SEC, objects: [ORST_ACTION], def: {} },
  { comp: "orst.member-directory", key: "vb.orst.memberdirectory", icon: "users", cat: "orst", tpl: "orst", noPalette: true,
    fields: ORST_SEC, objects: [ORST_ACTION], def: {} },
  { comp: "orst.job-listing", key: "vb.orst.joblisting", icon: "doc", cat: "orst", tpl: "orst", noPalette: true,
    fields: [...ORST_SEC, { k: "emptyLabel" }, { k: "formHeading" }], objects: [ORST_ACTION], def: {} },
];
// RoyalSociety's own 22 block types (public-site/templates/royalsociety/
// Blocks.tsx) — same "shared vocabulary, per-template skin" split as ORST's
// own set just above: several of these conceptually mirror an ORST type
// (page-hero/card-grid/faq/table/notice/cta-band/logo-marquee/contact-info/
// contact-form) but render RoyalSociety's own `.rs-*`/`.about-*`/`.ks-*`
// classes and its own inline-SVG RsIcon set — zero shared CSS with ORST or
// gov-portal (see Blocks.tsx's own header comment). `tpl: "royalsociety"` is
// what paletteTypes filters on, `comp` is namespaced the same mechanical way
// ("royalsociety." + Blocks.tsx's own type string), so this can never
// collide with "block.*" or "orst.*" either.
//
// `intro-feature` deliberately has NO `html` field exposed, same reasoning
// as `orst.rich-text` — that field is a bespoke server-side merge from the
// wp:page "about" post's own native content (see app/royalsociety/[page]/
// page.tsx), not a Builder-editable raw-HTML sink.
const RS_SEC = [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }];
const isKnowledge = (b: any) => b.variant === "knowledge";
export const ROYALSOCIETY_TYPES = [
  { comp: "royalsociety.page-hero", key: "vb.rs.pagehero", icon: "layout", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "variant", select: ["", "deep"] }],
    def: { heading: "หัวข้อหน้า", lead: "" } },
  { comp: "royalsociety.about-hero", key: "vb.rs.abouthero", icon: "layout", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "subtitle" }, { k: "lead", ta: true }, { k: "action1Label" }, { k: "action1Href" }, { k: "action2Label" }, { k: "action2Href" }, { k: "image" }],
    def: { heading: "เกี่ยวกับราชบัณฑิตยสภา" } },
  { comp: "royalsociety.home-hero", key: "vb.rs.homehero", icon: "layout", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }],
    def: { heading: "หัวข้อหน้าแรก" } },
  { comp: "royalsociety.trust-strip", key: "vb.rs.truststrip", icon: "grid", cat: "royalsociety", tpl: "royalsociety",
    // eyebrow is only the section's aria-label here (screen readers), not visible text.
    fields: [{ k: "eyebrow" }],
    items: { key: "items", fields: [{ k: "icon", icon: true }, { k: "title" }], def: { icon: "i-book", title: "หัวข้อ" } },
    def: { items: [] } },
  { comp: "royalsociety.news-feed", key: "vb.rs.newsfeed", icon: "doc", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" }, { k: "badgeLabel" }, { k: "readMoreLabel" }],
    items: { key: "items", fields: [{ k: "date" }, { k: "title" }, { k: "body", ta: true }, { k: "href" }], def: { title: "หัวข้อข่าว" } },
    def: { heading: "ข่าวสารและกิจกรรมล่าสุด", items: [] } },
  { comp: "royalsociety.list-panel", key: "vb.rs.listpanel", icon: "doc", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }],
    items: { key: "items", fields: [{ k: "date" }, { k: "tag" }, { k: "title" }, { k: "body", ta: true }, { k: "href" }], def: { title: "หัวข้อ" } },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.card-grid", key: "vb.rs.cardgrid", icon: "card", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "columns", select: ["2", "3", "4"] }, { k: "variant", select: ["", "flat"] }, { k: "linkLabel" }],
    items: { key: "items", fields: [{ k: "title" }, { k: "body", ta: true }, { k: "image" }, { k: "href" }], def: { title: "หัวข้อ" } },
    def: { heading: "", columns: "3", items: [] } },
  { comp: "royalsociety.stats-steps", key: "vb.rs.statssteps", icon: "grid", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }],
    items: { key: "items", scalar: true, def: "" },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.contact-info", key: "vb.rs.contactinfo", icon: "msg", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "heading" }, { k: "address", ta: true }, { k: "phone" }, { k: "email" }, { k: "hours" }, { k: "mapEmbed" }],
    def: { heading: "", address: "", phone: "", email: "", hours: "" } },
  { comp: "royalsociety.contact-form", key: "vb.rs.contactform", icon: "inbox", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }],
    def: { heading: "ส่งเรื่องถึงเรา" } },
  { comp: "royalsociety.intro-feature", key: "vb.rs.introfeature", icon: "layout", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "highlightLabel" }, { k: "highlightText", ta: true }],
    items: { key: "items", fields: [{ k: "label" }, { k: "title" }, { k: "body", ta: true }], def: { label: "", title: "", body: "" } },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.timeline", key: "vb.rs.timeline", icon: "doc", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }],
    items: { key: "items", fields: [{ k: "year" }, { k: "statusLabel" }, { k: "title" }, { k: "body", ta: true }], def: { title: "เหตุการณ์" } },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.mission-grid", key: "vb.rs.missiongrid", icon: "grid", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "linkLabel" }, { k: "linkHref" }],
    items: { key: "items", fields: [{ k: "icon", icon: true }, { k: "title" }, { k: "body", ta: true }], def: { icon: "i-book", title: "", body: "" } },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.org-structure", key: "vb.rs.orgstructure", icon: "grid", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "image" },
      { k: "councilLabel" }, { k: "councilTitle" }, { k: "councilBody", ta: true },
      { k: "officeLabel" }, { k: "officeTitle" }, { k: "officeBody", ta: true },
      { k: "schoolsHeading" }, { k: "schoolsLead", ta: true }],
    items: { key: "items", fields: [{ k: "title" }, { k: "body", ta: true }], def: { title: "" } },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.feature-directory", key: "vb.rs.featuredirectory", icon: "card", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "variant", select: ["services", "knowledge"] },
      ...["featureLabel", "featureTitle", "featureBody", "featureLinkLabel", "featureLinkUrl", "linkLabel"].map((k) => ({ k, ta: k === "featureBody", when: isKnowledge }))],
    items: { key: "items", fields: [{ k: "title" }, { k: "body", ta: true }, { k: "href" }, { k: "linkLabel", when: isKnowledge }], def: { title: "" } },
    def: { heading: "", variant: "services", items: [] } },
  { comp: "royalsociety.recommended-carousel", key: "vb.rs.recommended", icon: "card", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" }],
    items: { key: "items", fields: [{ k: "image" }, { k: "type" }, { k: "category" }, { k: "title" }, { k: "body", ta: true }, { k: "href" }, { k: "linkLabel" }], def: { title: "" } },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.service-gateway", key: "vb.rs.servicegateway", icon: "inbox", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" },
      { k: "mainLabel" }, { k: "mainTitle" }, { k: "mainBody", ta: true }, { k: "mainActionLabel" }, { k: "mainHref" }, { k: "processLabel" }],
    items: { key: "items", fields: [{ k: "label" }, { k: "title" }, { k: "body", ta: true }, { k: "href" }], def: { title: "" } },
    lists: [{ key: "steps", scalar: true, def: "ขั้นตอน" }],
    def: { heading: "", items: [], steps: [] } },
  { comp: "royalsociety.logo-marquee", key: "vb.rs.logomarquee", icon: "grid", cat: "royalsociety", tpl: "royalsociety",
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "viewAllLabel" }, { k: "viewAllUrl" }],
    items: { key: "items", fields: [{ k: "name" }, { k: "image" }, { k: "href" }], def: { name: "" } },
    def: { heading: "", items: [] } },
  { comp: "royalsociety.vm-strip", key: "vb.rs.vmstrip", icon: "layout", cat: "royalsociety", tpl: "royalsociety",
    fields: [],
    items: { key: "items", scalar: true, def: "" },
    def: { items: [] } },
  // The one no-code "compose a new block" escape hatch for this template —
  // see ORST_TYPES' identical orst.flex-panel entry and Blocks.tsx's
  // FlexPanel for the full rationale.
  { comp: "royalsociety.flex-panel", key: "vb.rs.flexpanel", icon: "layout", cat: "royalsociety", tpl: "royalsociety",
    // `tone` only affects "banner" (`.rs-note` tone class), "banner" never
    // reads `items`, and "feature" (Blocks.tsx's `.trust-strip` branch)
    // reads none of eyebrow/heading/lead at all — its dark band is
    // load-bearing for that, see the comment on FlexPanel's "feature"
    // branch. Hiding each where it's a no-op keeps the sidebar honest about
    // which fields the current layout actually uses.
    fields: [{ k: "layout", select: ["cards", "banner", "list", "cta", "stats", "feature"] },
      { k: "eyebrow", when: (b: any) => b.layout !== "feature" && b.layout !== "cta" }, { k: "heading", when: (b: any) => b.layout !== "feature" }, { k: "lead", ta: true, when: (b: any) => b.layout !== "feature" },
      { k: "tone", select: ["info", "warn", "success"], when: (b: any) => b.layout === "banner" }],
    items: { key: "items", fields: [{ k: "icon", icon: true, when: (b: any) => b.layout === "feature" }, { k: "title" },
      { k: "body", ta: true, when: (b: any) => !["cta", "feature"].includes(b.layout) }, { k: "href", when: (b: any) => ["cards", "list", "cta"].includes(b.layout || "cards") }],
      def: { title: "หัวข้อ" }, when: (b: any) => b.layout !== "banner" },
    def: { layout: "cards", heading: "", items: [] } },
  // Server-bound types — see ORST_TYPES' own identical entries.
  { comp: "royalsociety.event-calendar", key: "vb.orst.eventcalendar", icon: "doc", cat: "royalsociety", tpl: "royalsociety", noPalette: true,
    fields: RS_SEC, def: {} },
  { comp: "royalsociety.member-directory", key: "vb.orst.memberdirectory", icon: "users", cat: "royalsociety", tpl: "royalsociety", noPalette: true,
    fields: RS_SEC, def: {} },
  { comp: "royalsociety.job-listing", key: "vb.orst.joblisting", icon: "doc", cat: "royalsociety", tpl: "royalsociety", noPalette: true,
    fields: [...RS_SEC, { k: "emptyLabel" }, { k: "formHeading" }], def: {} },
];
// Shared across EVERY WordPress-dialect tenant (orst, royalsociety, and any
// future one — e.g. nbtc, which today has no dialect entry of its own at
// all and would otherwise start with an empty Toolbox) — see
// blockDialect.ts's GENERIC_WP_TYPES comment for which types qualify and
// why, and for the bug this closes (an unscoped WordPress session, unable
// to guess which tenant's prefix applies, silently mis-resolved these as
// "orst.*" regardless of which tenant's page was actually open). `comp` is
// the bare stored `type` string, un-prefixed — `tpl` is deliberately
// omitted; paletteTypes below shows these for ANY WP dialect instead of
// gating on one specific `tpl` value.
export const GENERIC_TYPES = [
  // `variant`/`action` below are ORST-only (its Section wrapper reads them;
  // RoyalSociety's doesn't) — gated with `tpl` so a RoyalSociety editor
  // isn't shown controls that do nothing.
  { comp: "table", key: "vb.wp.table", icon: "grid", cat: "wp-shared", generic: true,
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "caption" }, { k: "variant", select: ["", "alt"], tpl: "orst" }],
    objects: [{ ...ORST_ACTION, tpl: "orst" }],
    // Header cells, then one row per entry with a cell per column.
    lists: [{ key: "columns", scalar: true, def: "หัวข้อ" }, { key: "rows", matrix: "columns", def: [] }],
    def: { heading: "", columns: [], rows: [] } },
  { comp: "faq", key: "vb.wp.faq", icon: "doc", cat: "wp-shared", generic: true,
    fields: [{ k: "eyebrow" }, { k: "heading" }, { k: "lead", ta: true }, { k: "variant", select: ["", "alt"], tpl: "orst" }],
    objects: [{ ...ORST_ACTION, tpl: "orst" }],
    items: { key: "items", fields: [{ k: "q" }, { k: "a", ta: true }], def: { q: "คำถาม", a: "" } },
    def: { heading: "", items: [] } },
  // ORST renders the full section head above the notice; RoyalSociety only
  // its eyebrow.
  { comp: "notice", key: "vb.wp.notice", icon: "doc", cat: "wp-shared", generic: true,
    fields: [{ k: "eyebrow" }, { k: "heading", tpl: "orst" }, { k: "lead", ta: true, tpl: "orst" }, { k: "variant", select: ["", "alt"], tpl: "orst" },
      { k: "title" }, { k: "body", ta: true }, { k: "tone", select: ["info", "warn", "success"] }],
    objects: [{ ...ORST_ACTION, tpl: "orst" }],
    def: { title: "", body: "", tone: "info" } },
  // RoyalSociety's own definition carried an extra `eyebrow` field ORST's
  // didn't — included here (harmless as an always-present optional field
  // for ORST too, same convention already used throughout both catalogs).
  // …except ORST's CtaBand turned out never to render it, so it's gated to
  // RoyalSociety rather than offered as a control that does nothing.
  { comp: "cta-band", key: "vb.wp.ctaband", icon: "cta", cat: "wp-shared", generic: true,
    fields: [{ k: "eyebrow", tpl: "royalsociety" }, { k: "heading", keep: true }, { k: "body", ta: true }],
    items: { key: "actions", fields: [{ k: "label" }, { k: "href" }, { k: "variant", select: ["", "ghost"] }], def: { label: "", href: "#" } },
    def: { heading: "", body: "", actions: [] } },
];
export const BLOCK_CATEGORIES = [
  { key: "content", labelKey: "vb.cat.content" },
  { key: "grids", labelKey: "vb.cat.grids" },
  { key: "live", labelKey: "vb.cat.live" },
  { key: "promo", labelKey: "vb.cat.promo" },
  // Shared WP-dialect vocabulary shows first, then each tenant's own types.
  { key: "wp-shared", labelKey: "vb.cat.wpshared" },
  // Single flat category per WordPress template — unlike gov-portal's 23,
  // there's no live-data/promo distinction worth a separate section for.
  { key: "orst", labelKey: "vb.cat.orst" },
  { key: "royalsociety", labelKey: "vb.cat.royalsociety" },
];
// Every type across every template, flat and namespace-collision-free (see
// ORST_TYPES's own comment on why "orst."/"royalsociety." can never collide
// with "block."). metaOf is the ONLY lookup that needs to search all four —
// iconOf/labelOf/add/addAt/compName/aMeta all call metaOf and therefore need
// no changes.
export const ALL_TYPES = [...TYPES, ...GENERIC_TYPES, ...ORST_TYPES, ...ROYALSOCIETY_TYPES];
// Explicit shape so metaOf's return type includes ORST_TYPES' optional
// `items`/`tpl` fields without widening TYPES' own (much larger, pre-existing)
// literal array — TS won't infer that merge automatically across a union.
// `when(b)` — optional per-field/per-items visibility gate, keyed off the
// block's OWN current field values (e.g. FlexPanel's `layout` select).
// Omitted means always visible, same as before this existed.
// On item fields, `when(b)` still receives the BLOCK (not the item), so one
// field can be hidden for a layout/variant that never renders it.
// `tpl` — only meaningful under that one template (for GENERIC_TYPES shared
// across templates whose renderers read different keys). `keep` — the
// renderer draws this element (or a built-in default) even when the key is
// absent, so offering "remove" would be a no-op; the sidebar hides its ×.
export type ItemField = { k: string; ta?: boolean; select?: string[]; icon?: boolean; when?: (b: any) => boolean; tpl?: string; keep?: boolean };
// One repeatable list. `def` is the new-item template — a function when each
// new item needs something unique (e.g. media-tabs' tab `id`, which the
// renderer uses for DOM ids). Items may themselves hold nested `lists`/
// `objects` (media-tabs' tabs[].items[], news-tabs' tabs[].featured/side[]).
// `matrix` — each item is a string[] row with one cell per entry of the
// sibling scalar list named here (table's rows[][] against columns[]).
export type ListDesc = {
  key: string; fields?: ItemField[]; def: any; scalar?: boolean; when?: (b: any) => boolean; tpl?: string;
  matrix?: string; lists?: ListDesc[]; objects?: ObjDesc[];
};
// A single nested object edited as a small group of fields (ORST's section
// "view all" `action: {label, href}`, news-tabs' `featured`).
export type ObjDesc = { key: string; fields: ItemField[]; when?: (b: any) => boolean; tpl?: string };
export type BlockTypeMeta = {
  comp: string; key: string; icon: string; cat: string; fields: ItemField[]; def: any;
  // The block's PRIMARY list — the one the live-data `source` binding
  // replaces (when key === "items") and the one lib/agent/tools.ts and the
  // mockup canvas summarize. Any further lists go in `lists`.
  items?: ListDesc;
  lists?: ListDesc[];
  objects?: ObjDesc[];
  tpl?: string;
  // Shown for every WP-dialect tenant regardless of `tpl` — see GENERIC_TYPES.
  generic?: boolean;
  // Editable when already on a page, but not offered in the palette/agent's
  // add-block list — for types whose content is bound server-side (a
  // `source` feed, a WordPress poll id) and would render empty or broken if
  // dropped in fresh from the Toolbox.
  noPalette?: boolean;
};
export const metaOf = (c: string) => ALL_TYPES.find((t) => t.comp === c) as BlockTypeMeta | undefined;
/** Every list a block type exposes, primary `items` first. */
export const listsOf = (m: BlockTypeMeta | undefined): ListDesc[] => (m ? [...(m.items ? [m.items] : []), ...(m.lists || [])] : []);
/** A fresh, unshared copy of a `def` (plain value or factory). */
export const freshDef = (d: any) => (typeof d === "function" ? d() : d === undefined ? undefined : JSON.parse(JSON.stringify(d)));
/** Same template/`when` gate every sidebar control applies. */
export const applies = (x: { when?: (b: any) => boolean; tpl?: string }, b: any, template?: string) =>
  (!x.tpl || x.tpl === template) && (!x.when || x.when(b));
