<?php
// Native Gutenberg authoring for WordPress-tenant page layout — registers
// the block families built from wordpress/blocks/src/* (see that package's
// own README-equivalent comment in package.json). These are a SECOND way to
// author the exact same page.acf.blocks JSON the Visual Builder and
// public-site already read/render — see webx-blocks-sync.php for the hook
// that keeps the two in sync. This file only registers the blocks and the
// custom block category they live under; it makes no governance decisions
// itself (that stays in custom-role-enforcement.php, unchanged).
//
// Phase 1 scope: the block families proven end-to-end so far (see
// wordpress/blocks/src/*). notice and faq are SHARED between ORST and
// RoyalSociety (both templates' Blocks.tsx read the identical field/items
// shape for these two types, matching how the underlying JSON `type`
// string is already shared) — card-grid is NOT shared (ORST's items carry
// icon/tag/meta, RoyalSociety's carry image; different attribute schemas
// need different Gutenberg blocks even though both still write out
// `type: "card-grid"` in their own template's JSON), hence the separate
// `rs-card-grid`/`rs-card-grid-item` pair. Expanding to more block types
// means adding another wordpress/blocks/src/<type>/ package and one more
// line below; nothing else in this file changes shape.
//
// Known, accepted gap: wp-admin's block inserter has no per-tenant
// filtering, so an ORST editor sees RoyalSociety-specific blocks (and vice
// versa) in the inserter list too — same category of gap as wp-admin's
// list screens showing every tenant to a non-tenant-scoped admin (see
// custom-role-enforcement.php's own read-scoping comment). Worth a
// `blocks.registerBlockType`-filter fix later if it proves confusing in
// practice; not blocking for this phase.
//
// Built assets live in wordpress/blocks/build/ (git-ignored, produced by
// `npm run build` in that directory) and are deployed into this mu-plugin's
// own webx-blocks/ subdirectory — see DEPLOY.md's WordPress engine
// checklist for the same "copy into the running container" step already
// documented there for mu-plugin PHP changes; built block assets need the
// identical treatment.

add_action('init', function () {
    $base = __DIR__ . '/webx-blocks';
    if (!is_dir($base)) {
        error_log('[webx-blocks] built assets not found at ' . $base . ' — run `npm run build` in wordpress/blocks/ and deploy the build/ output here.');
        return;
    }
    foreach ([
        'notice', 'faq', 'faq-item', 'card-grid', 'card-grid-item', 'rs-card-grid', 'rs-card-grid-item',
        'cta-band', 'cta-band-action', 'logo-marquee', 'logo-marquee-item',
        'steps', 'steps-item', 'stats-steps', 'stats-steps-item',
        'feature-list', 'feature-list-item', 'mission-grid', 'mission-grid-item',
        'page-hero', 'page-hero-action', 'rs-page-hero',
        'stat-row', 'stat-row-item', 'link-list', 'link-list-item', 'list-panel', 'list-panel-item',
        'media-grid', 'media-grid-item', 'contact-info', 'rs-contact-info',
        'trust-strip', 'trust-strip-item', 'timeline', 'timeline-item', 'vm-strip', 'vm-strip-item',
        'rich-text', 'rich-text-item', 'contact-hero', 'home-hero', 'about-hero',
        'intro-feature', 'intro-feature-item',
        'contact-form', 'rs-contact-form', 'news-feed', 'news-feed-item',
        'recommended-carousel', 'recommended-carousel-item',
        'feature-directory', 'feature-directory-item',
        'table', 'table-column', 'table-row', 'table-cell',
        'media-tabs', 'media-tabs-tab', 'media-tabs-item',
        'news-tabs', 'news-tabs-tab', 'news-tabs-side-item',
        'service-hub', 'service-hub-step', 'service-hub-item',
        'org-structure', 'org-structure-item',
        'service-gateway', 'service-gateway-item', 'service-gateway-step',
        'two-column', 'two-column-paragraph', 'two-column-action',
    ] as $block) {
        $dir = $base . '/' . $block;
        if (is_dir($dir)) register_block_type($dir);
    }
});

// A custom category keeps these 3 (soon more) block types grouped together
// in the inserter instead of scattered across "Text"/"Widgets" — editors
// working on ORST/RoyalSociety pages only ever need this one group.
add_filter('block_categories_all', function (array $categories) {
    return array_merge([[
        'slug' => 'webx-blocks',
        'title' => 'WebX page blocks',
        'icon' => 'layout',
    ]], $categories);
});
