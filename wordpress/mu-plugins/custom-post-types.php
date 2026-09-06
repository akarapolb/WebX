<?php
// Phase 8 — real WordPress content types beyond a plain post, so
// services/publications for the new ORST/RoyalSociety tenants are genuine
// CMS content instead of static page copy. Same shape as native `post`
// (title/editor/excerpt/thumbnail) so webx-studio's existing normalization
// (lib/cms/wordpress.ts) extends to them mechanically — no new field types.
// Priority 20 (default is 10): must run AFTER the wtenant taxonomy itself
// is registered (wtenant-taxonomy.php's own init hook), since
// register_taxonomy_for_object_type() below needs it to already exist.
// Relying on mu-plugin filename load order for this would be fragile.
add_action('init', function () {
    register_post_type('service', [
        'label' => 'Service',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'service',
        'supports' => ['title', 'editor', 'excerpt', 'thumbnail'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-admin-tools',
    ]);
    register_post_type('publication', [
        'label' => 'Publication',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'publication',
        'supports' => ['title', 'editor', 'excerpt', 'thumbnail'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-book',
    ]);
    // Phase 9 — faq (question/answer) and resource (dictionary/knowledge
    // cards) round out the content types both tenants actually need. Same
    // shape as service/publication, so no adapter changes beyond the
    // POST_TYPES registry entry.
    register_post_type('faq', [
        'label' => 'FAQ',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'faq',
        'supports' => ['title', 'editor', 'excerpt'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-editor-help',
    ]);
    register_post_type('resource', [
        'label' => 'Resource',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'resource',
        'supports' => ['title', 'editor', 'excerpt', 'thumbnail'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-book-alt',
    ]);
    // Phase 10 — the remaining deeply-structured About-page sections
    // (timeline, mission cards, org units, ITA transparency documents),
    // each as its own repeatable post type (same shape/pattern as
    // faq/resource above) rather than a repeater field on a single page —
    // see the Phase 10 plan's ACF-free-vs-pro rationale. ACF field groups
    // for these (year/order/icon/tag/etc) are registered in acf-fields.php.
    register_post_type('timeline-event', [
        'label' => 'Timeline Event',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'timeline-event',
        'supports' => ['title', 'editor'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-clock',
    ]);
    register_post_type('mission-item', [
        'label' => 'Mission Item',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'mission-item',
        'supports' => ['title', 'editor'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-flag',
    ]);
    register_post_type('org-unit', [
        'label' => 'Org Unit',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'org-unit',
        'supports' => ['title', 'editor'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-networking',
    ]);
    register_post_type('document', [
        'label' => 'Document',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'document',
        'supports' => ['title', 'editor'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-media-document',
    ]);
    // Phase 3 gap — a real "ปฏิทินกิจกรรม" (event calendar): ORST's own
    // news.json already carried an empty placeholder table block for this
    // (id "calendar", rows: []) and RoyalSociety's activities.json lead copy
    // already promises one — neither had actual data behind it. Same
    // simple-fields pattern as the Phase 10 types above (see acf-fields.php's
    // group_event for event_date/event_time/location/category).
    register_post_type('event', [
        'label' => 'Event',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'event',
        'supports' => ['title', 'editor', 'excerpt'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-calendar-alt',
    ]);
    // Phase 3 gap — a real member/scholar directory: both tenants' about
    // pages already reference "ราชบัณฑิตและภาคีสมาชิก" (Fellows and Associate
    // Members) — RoyalSociety's own homepage card promises "get to know
    // these people" and links to /about, ORST's about page carries an
    // unfilled "[จำนวน] ราชบัณฑิตและภาคีสมาชิก" count placeholder — but
    // neither had any actual per-person content anywhere (org-unit is
    // organizational bureaus, not individuals). `thumbnail` support for a
    // portrait photo, `excerpt` for a short bio blurb shown on the
    // directory card (see acf-fields.php's group_member for tier/division).
    register_post_type('member', [
        'label' => 'Member',
        'public' => true,
        'show_in_rest' => true,
        'rest_base' => 'member',
        'supports' => ['title', 'editor', 'excerpt', 'thumbnail'],
        'has_archive' => false,
        'menu_icon' => 'dashicons-groups',
    ]);
    // Reuse the existing wtenant taxonomy (Phase 5) wholesale — same
    // tenant-scoping mechanism, no new governance logic needed.
    register_taxonomy_for_object_type('wtenant', 'service');
    register_taxonomy_for_object_type('wtenant', 'publication');
    register_taxonomy_for_object_type('wtenant', 'faq');
    register_taxonomy_for_object_type('wtenant', 'resource');
    register_taxonomy_for_object_type('wtenant', 'timeline-event');
    register_taxonomy_for_object_type('wtenant', 'mission-item');
    register_taxonomy_for_object_type('wtenant', 'org-unit');
    register_taxonomy_for_object_type('wtenant', 'document');
    register_taxonomy_for_object_type('wtenant', 'event');
    register_taxonomy_for_object_type('wtenant', 'member');
    // Media library gap (TOR — search/tag/reuse/crop/caption): media was
    // never tenant-scoped at all (webx-studio/lib/cms/governance.ts's
    // media.upload wrapper called the adapter directly, no tenant involved)
    // — same wtenant mechanism as every other WP-hosted type here, just
    // applied to the native `attachment` type instead of a custom one.
    register_taxonomy_for_object_type('wtenant', 'attachment');
    // Native `page` type, never used until Phase 9 — hero copy (slug:"home")
    // and About narrative (slug:"about") per tenant, keyed by slug like any
    // other WP page. Reuses WP's own built-in type instead of a third
    // custom one for "a block of prose keyed by page".
    register_taxonomy_for_object_type('wtenant', 'page');
}, 20);

// e2e/TOR audit finding: org-unit, mission-item, timeline-event and document
// are pure metadata records (order/icon/tag/etc, all via ACF meta boxes) —
// their real "editor" support only exists so webx-studio's normalizePost()
// can read a post_content field mechanically, like every other WP-hosted
// type. Real content for all four is created/edited via seed scripts or
// webx-studio, never by typing into a wp-admin block canvas, so post_content
// stays empty in practice. Found live: on an empty-content record, the
// block editor's iframe canvas (editor-canvas) never receives its resize
// bridge — the iframe's own document renders the title/content correctly
// internally (confirmed a real, correct DOM node with the right text) but
// the <iframe> element itself in the parent document is never resized past
// height:0, so the whole title/content area is invisible even though the
// underlying data and every ACF meta box below it are completely unaffected.
// The classic editor has no iframe and isn't subject to this at all, and for
// these four types the classic title/content boxes are all a wp-admin user
// actually needs (the ACF panels carry the real fields) — so route them
// there instead of chasing the resize-bridge bug in a third-party block set.
add_filter('use_block_editor_for_post_type', function ($use_block_editor, $post_type) {
    if (in_array($post_type, ['org-unit', 'mission-item', 'timeline-event', 'document'], true)) return false;
    return $use_block_editor;
}, 10, 2);
