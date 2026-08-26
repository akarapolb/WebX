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
    // Native `page` type, never used until Phase 9 — hero copy (slug:"home")
    // and About narrative (slug:"about") per tenant, keyed by slug like any
    // other WP page. Reuses WP's own built-in type instead of a third
    // custom one for "a block of prose keyed by page".
    register_taxonomy_for_object_type('wtenant', 'page');
}, 20);
