<?php
// One-time migration helper (Phase 1 verification only — see the plan's
// "Non-goals" on NOT building a persistent "Convert to Gutenberg" action
// yet): every existing ORST/RoyalSociety page's layout lives only in
// page.acf.blocks today, so post_content is empty and opening one in
// Gutenberg shows nothing to edit. This WP-CLI command reads the existing
// blocks JSON and writes matching webx/* Gutenberg block markup into
// post_content, for exactly the block types webx-blocks-sync.php also
// understands — the inverse of that file's own mapper.
//
// Usage: wp --path=/var/www/html --allow-root webx backfill-blocks <post-id>
//
// Safe to re-run on the same page: it always regenerates post_content from
// the CURRENT blocks JSON (the source of truth), overwriting whatever
// Gutenberg markup was there before — same idempotency posture as the
// wordpress/seed-*.mjs scripts elsewhere in this repo.
if (!defined('WP_CLI') || !WP_CLI) return;

WP_CLI::add_command('webx backfill-blocks', function ($args) {
    $post_id = (int) ($args[0] ?? 0);
    $post = $post_id ? get_post($post_id) : null;
    if (!$post) WP_CLI::error('No post with that id.');

    $raw = get_field('blocks', $post_id);
    $blocks = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($blocks)) WP_CLI::error('post.acf.blocks is empty or not valid JSON — nothing to backfill.');

    // webx-blocks-sync.php's merge-back-in logic matches a Gutenberg save's
    // blocks against the existing page.acf.blocks array BY ID — a block
    // with no `id` here can never be matched on a later save (it always
    // reads as "new", since the synced copy gets a freshly-minted id every
    // time), so every subsequent edit would append a duplicate instead of
    // updating in place. Many ORST/RoyalSociety blocks were authored
    // without an id (only ones needing a DOM anchor got one) — so backfill
    // mints and PERSISTS a real id for exactly the blocks it's about to
    // hand to Gutenberg, writing it back into page.acf.blocks itself (not
    // just into the generated post_content), so both representations share
    // the same identity from this point on.
    $minted = false;
    foreach ($blocks as &$b) {
        if (in_array($b['type'] ?? null, [
            'notice', 'faq', 'card-grid', 'cta-band', 'logo-marquee', 'steps', 'stats-steps', 'feature-list', 'mission-grid',
            'page-hero', 'stat-row', 'link-list', 'list-panel', 'media-grid', 'contact-info', 'trust-strip', 'timeline', 'vm-strip',
            'rich-text', 'contact-hero', 'home-hero', 'about-hero', 'intro-feature',
            'contact-form', 'news-feed', 'recommended-carousel', 'feature-directory', 'table',
            'media-tabs', 'news-tabs', 'service-hub', 'org-structure', 'service-gateway', 'two-column',
        ], true) && empty($b['id'])) {
            $b['id'] = wp_generate_uuid4();
            $minted = true;
        }
    }
    unset($b);
    if ($minted) update_field('blocks', wp_json_encode($blocks, JSON_UNESCAPED_UNICODE), $post_id);

    // "card-grid" is ambiguous on its own: ORST's and RoyalSociety's items
    // carry different fields (icon/tag/meta vs image), so it needs a
    // DIFFERENT Gutenberg block per template even though both templates'
    // own JSON still just says `type: "card-grid"` — see webx-blocks.php's
    // own comment on why they can't be one shared block. Resolve which
    // template this post belongs to via the same wtenant-term helper
    // custom-role-enforcement.php already defines (tenant key == template
    // name for both of these tenants).
    $tenant = function_exists('webx_crp_post_tenant_key') ? webx_crp_post_tenant_key($post_id) : null;

    $gutenberg = array_values(array_filter(array_map(
        fn($b) => webx_blocks_backfill_to_gutenberg($b, $tenant),
        $blocks
    )));
    if (!$gutenberg) WP_CLI::error('None of the blocks in this page are one of the types webx-blocks-sync.php understands yet — nothing to backfill.');

    $content = serialize_blocks($gutenberg);
    // wp_update_post() unslashes its input on the assumption it came from a
    // slashed source (like $_POST) — without wp_slash() here, that strips
    // the protective backslash core's own serialize_block_attributes() just
    // added in front of &/</>/-- escapes, corrupting
    // any text field containing &, <, >, or "--" (e.g. "Knowledge & Services"
    // silently became the literal text "Knowledge u0026 Services"). Found
    // live while backfilling feature-directory's eyebrow field.
    wp_update_post(wp_slash(['ID' => $post_id, 'post_content' => $content]));
    WP_CLI::success('Backfilled ' . count($gutenberg) . ' of ' . count($blocks) . ' block(s) from page.acf.blocks into post_content for post ' . $post_id . '.');
});

/** The inverse of webx-blocks-sync.php's webx_blocks_sync_map_block() — one
 * {type,id,...} JSON block -> a parse_blocks()-shaped array, ready for
 * serialize_block()/serialize_blocks(). Returns null for a block type this
 * mu-plugin doesn't (yet) have a Gutenberg block for, so the rest of the
 * page's blocks — which stay exactly as they are in page.acf.blocks, this
 * only touches post_content — still backfill correctly even though a type
 * like "hero" or "table" is silently skipped here. `$tenant` disambiguates
 * "card-grid", the one type with a different Gutenberg block per template. */
function webx_blocks_backfill_to_gutenberg(array $b, ?string $tenant): ?array
{
    switch ($b['type'] ?? null) {
        case 'notice':
            $attrs = ['blockId' => $b['id'] ?? '', 'variant' => $b['variant'] ?? '', 'title' => $b['title'] ?? '', 'body' => $b['body'] ?? '', 'tone' => $b['tone'] ?? 'info'];
            return ['blockName' => 'webx/notice', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];

        case 'faq':
            $children = array_map(function ($it) {
                $attrs = ['q' => $it['q'] ?? '', 'a' => $it['a'] ?? ''];
                return ['blockName' => 'webx/faq-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'variant' => $b['variant'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? ''];
            return ['blockName' => 'webx/faq', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'card-grid':
            if ($tenant === 'royalsociety') {
                $children = array_map(function ($it) {
                    $attrs = ['title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'image' => $it['image'] ?? '', 'href' => $it['href'] ?? '#'];
                    return ['blockName' => 'webx/rs-card-grid-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
                }, $b['items'] ?? []);
                $attrs = [
                    'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                    'columns' => (string) ($b['columns'] ?? '3'), 'flat' => ($b['variant'] ?? '') === 'flat', 'linkLabel' => $b['linkLabel'] ?? '',
                ];
                return ['blockName' => 'webx/rs-card-grid', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];
            }

            $children = array_map(function ($it) {
                $attrs = ['icon' => $it['icon'] ?? '', 'tag' => $it['tag'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'meta' => $it['meta'] ?? '', 'href' => $it['href'] ?? '#'];
                return ['blockName' => 'webx/card-grid-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $src = $b['source'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'variant' => $b['variant'] ?? '',
                'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'columns' => (string) ($b['columns'] ?? '3'),
                'sourceEnabled' => !empty($src), 'sourcePostType' => $src['postType'] ?? 'service', 'sourceMap' => $src['map'] ?? 'card',
                'sourceIcon' => $src['icon'] ?? '', 'sourceTag' => $src['tag'] ?? '', 'sourceLimit' => $src['limit'] ?? 0, 'sourceOffset' => $src['offset'] ?? 0,
            ];
            return ['blockName' => 'webx/card-grid', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'cta-band':
            $children = array_map(function ($it) {
                $attrs = ['label' => $it['label'] ?? '', 'href' => $it['href'] ?? '#', 'ghost' => ($it['variant'] ?? '') === 'ghost'];
                return ['blockName' => 'webx/cta-band-action', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['actions'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'body' => $b['body'] ?? ''];
            return ['blockName' => 'webx/cta-band', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'logo-marquee':
            $children = array_map(function ($it) {
                $attrs = ['name' => $it['name'] ?? '', 'image' => $it['image'] ?? '', 'href' => $it['href'] ?? '#'];
                return ['blockName' => 'webx/logo-marquee-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'viewAllLabel' => $b['viewAllLabel'] ?? '', 'viewAllUrl' => $b['viewAllUrl'] ?? '',
            ];
            return ['blockName' => 'webx/logo-marquee', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'steps':
            $children = array_map(function ($it) {
                $attrs = ['title' => $it['title'] ?? '', 'body' => $it['body'] ?? ''];
                return ['blockName' => 'webx/steps-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? ''];
            return ['blockName' => 'webx/steps', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'stats-steps':
            // Scalar items — a plain string array in the JSON, not objects.
            $children = array_map(function ($label) {
                return ['blockName' => 'webx/stats-steps-item', 'attrs' => ['label' => is_string($label) ? $label : ''], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? ''];
            return ['blockName' => 'webx/stats-steps', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'feature-list':
            $children = array_map(function ($it) {
                $attrs = ['icon' => $it['icon'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? ''];
                return ['blockName' => 'webx/feature-list-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '', 'columns' => (string) ($b['columns'] ?? '3')];
            return ['blockName' => 'webx/feature-list', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'mission-grid':
            $children = array_map(function ($it) {
                $attrs = ['icon' => $it['icon'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? ''];
                return ['blockName' => 'webx/mission-grid-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $src = $b['source'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'linkLabel' => $b['linkLabel'] ?? '', 'linkHref' => $b['linkHref'] ?? '',
                'sourceEnabled' => !empty($src), 'sourcePostType' => $src['postType'] ?? 'mission', 'sourceMap' => $src['map'] ?? 'mission',
            ];
            return ['blockName' => 'webx/mission-grid', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'page-hero':
            // Ambiguous like "card-grid" — ORST's shape has action buttons and
            // no variant, RoyalSociety's has a deep-style variant and no
            // buttons — see webx-blocks.php's comment on why they're separate blocks.
            if ($tenant === 'royalsociety') {
                $attrs = [
                    'blockId' => $b['id'] ?? '', 'deep' => ($b['variant'] ?? '') === 'deep',
                    'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                ];
                return ['blockName' => 'webx/rs-page-hero', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }
            $children = array_map(function ($it) {
                $attrs = ['label' => $it['label'] ?? '', 'href' => $it['href'] ?? '#', 'ghost' => ($it['variant'] ?? '') === 'ghost'];
                return ['blockName' => 'webx/page-hero-action', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['actions'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? ''];
            return ['blockName' => 'webx/page-hero', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'stat-row':
            $children = array_map(function ($it) {
                $attrs = ['value' => $it['value'] ?? '', 'label' => $it['label'] ?? '', 'note' => $it['note'] ?? ''];
                return ['blockName' => 'webx/stat-row-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? ''];
            return ['blockName' => 'webx/stat-row', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'link-list':
            $children = array_map(function ($it) {
                $attrs = ['icon' => $it['icon'] ?? '', 'title' => $it['title'] ?? '', 'desc' => $it['desc'] ?? '', 'tag' => $it['tag'] ?? '', 'meta' => $it['meta'] ?? '', 'href' => $it['href'] ?? '#'];
                return ['blockName' => 'webx/link-list-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $src = $b['source'] ?? [];
            $act = $b['action'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'actionLabel' => $act['label'] ?? '', 'actionUrl' => $act['href'] ?? '',
                'sourceEnabled' => !empty($src), 'sourcePostType' => $src['postType'] ?? 'publication', 'sourceMap' => $src['map'] ?? 'link',
            ];
            return ['blockName' => 'webx/link-list', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'list-panel':
            $children = array_map(function ($it) {
                $attrs = ['date' => $it['date'] ?? '', 'tag' => $it['tag'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'href' => $it['href'] ?? '#'];
                return ['blockName' => 'webx/list-panel-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $src = $b['source'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'sourceEnabled' => !empty($src), 'sourcePostType' => $src['postType'] ?? 'news', 'sourceMap' => $src['map'] ?? 'dated',
            ];
            return ['blockName' => 'webx/list-panel', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'media-grid':
            $children = array_map(function ($it) {
                $attrs = ['image' => $it['image'] ?? '', 'alt' => $it['alt'] ?? '', 'title' => $it['title'] ?? '', 'desc' => $it['desc'] ?? '', 'tag' => $it['tag'] ?? '', 'href' => $it['href'] ?? ''];
                return ['blockName' => 'webx/media-grid-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $act = $b['action'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '', 'columns' => (string) ($b['columns'] ?? '3'),
                'actionLabel' => $act['label'] ?? '', 'actionUrl' => $act['href'] ?? '',
            ];
            return ['blockName' => 'webx/media-grid', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'contact-info':
            // Ambiguous like "card-grid"/"page-hero" — RoyalSociety's shape
            // has a heading, ORST's has a map embed — see webx-blocks.php's
            // comment on why they're separate blocks.
            if ($tenant === 'royalsociety') {
                $attrs = [
                    'blockId' => $b['id'] ?? '', 'heading' => $b['heading'] ?? '', 'address' => $b['address'] ?? '',
                    'phone' => $b['phone'] ?? '', 'email' => $b['email'] ?? '', 'hours' => $b['hours'] ?? '',
                ];
                return ['blockName' => 'webx/rs-contact-info', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }
            $attrs = [
                'blockId' => $b['id'] ?? '', 'address' => $b['address'] ?? '', 'phone' => $b['phone'] ?? '',
                'email' => $b['email'] ?? '', 'hours' => $b['hours'] ?? '', 'mapEmbed' => $b['mapEmbed'] ?? '',
            ];
            return ['blockName' => 'webx/contact-info', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];

        case 'trust-strip':
            $children = array_map(function ($it) {
                $attrs = ['icon' => $it['icon'] ?? '', 'title' => $it['title'] ?? ''];
                return ['blockName' => 'webx/trust-strip-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? ''];
            return ['blockName' => 'webx/trust-strip', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'timeline':
            $children = array_map(function ($it) {
                $attrs = ['year' => $it['year'] ?? '', 'statusLabel' => $it['statusLabel'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? ''];
                return ['blockName' => 'webx/timeline-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $src = $b['source'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'sourceEnabled' => !empty($src), 'sourcePostType' => $src['postType'] ?? 'timeline', 'sourceMap' => $src['map'] ?? 'timeline',
            ];
            return ['blockName' => 'webx/timeline', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'vm-strip':
            // Scalar items — a plain string array in the JSON, not objects.
            $children = array_map(function ($label) {
                return ['blockName' => 'webx/vm-strip-item', 'attrs' => ['label' => is_string($label) ? $label : ''], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? ''];
            return ['blockName' => 'webx/vm-strip', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'rich-text':
            // If this rich-text block is using the raw-`html` path (a
            // bespoke server-side merge, not admin-typed content — see
            // rich-text/block.json's own comment), there's no `paragraphs`
            // array to backfill from and no safe way to synthesize one, so
            // skip it entirely rather than backfilling an empty shell that
            // would silently look editable in Gutenberg but isn't the real
            // content.
            if (!empty($b['html']) && empty($b['paragraphs'])) return null;
            $children = array_map(function ($p) {
                return ['blockName' => 'webx/rich-text-item', 'attrs' => ['text' => is_string($p) ? $p : ''], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['paragraphs'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '', 'full' => ($b['width'] ?? '') === 'full'];
            return ['blockName' => 'webx/rich-text', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'contact-hero':
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'cta1Label' => $b['cta1Label'] ?? '', 'cta1Url' => $b['cta1Url'] ?? '', 'cta2Label' => $b['cta2Label'] ?? '', 'cta2Url' => $b['cta2Url'] ?? '',
                'officeHours' => $b['officeHours'] ?? '', 'phone' => $b['phone'] ?? '', 'email' => $b['email'] ?? '', 'address' => $b['address'] ?? '',
            ];
            return ['blockName' => 'webx/contact-hero', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];

        case 'home-hero':
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? ''];
            return ['blockName' => 'webx/home-hero', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];

        case 'about-hero':
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'subtitle' => $b['subtitle'] ?? '', 'lead' => $b['lead'] ?? '',
                'action1Label' => $b['action1Label'] ?? '', 'action1Href' => $b['action1Href'] ?? '',
                'action2Label' => $b['action2Label'] ?? '', 'action2Href' => $b['action2Href'] ?? '', 'image' => $b['image'] ?? '',
            ];
            return ['blockName' => 'webx/about-hero', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];

        case 'intro-feature':
            $children = array_map(function ($it) {
                $attrs = ['label' => $it['label'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? ''];
                return ['blockName' => 'webx/intro-feature-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'highlightLabel' => $b['highlightLabel'] ?? '', 'highlightText' => $b['highlightText'] ?? ''];
            return ['blockName' => 'webx/intro-feature', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'contact-form':
            // Ambiguous like "card-grid"/"page-hero"/"contact-info" —
            // ORST's framing fields are kicker/intro, RoyalSociety's are
            // eyebrow/lead — see webx-blocks.php's comment on why they're
            // separate blocks.
            if ($tenant === 'royalsociety') {
                $attrs = ['blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? ''];
                return ['blockName' => 'webx/rs-contact-form', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }
            $attrs = ['blockId' => $b['id'] ?? '', 'kicker' => $b['kicker'] ?? '', 'heading' => $b['heading'] ?? '', 'intro' => $b['intro'] ?? ''];
            return ['blockName' => 'webx/contact-form', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];

        case 'news-feed':
            $children = array_map(function ($it) {
                $attrs = ['date' => $it['date'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'href' => $it['href'] ?? '#'];
                return ['blockName' => 'webx/news-feed-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'viewAllLabel' => $b['viewAllLabel'] ?? '', 'viewAllUrl' => $b['viewAllUrl'] ?? '',
            ];
            return ['blockName' => 'webx/news-feed', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'recommended-carousel':
            $children = array_map(function ($it) {
                $attrs = [
                    'image' => $it['image'] ?? '', 'type' => $it['type'] ?? '', 'category' => $it['category'] ?? '',
                    'title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'href' => $it['href'] ?? '#', 'linkLabel' => $it['linkLabel'] ?? '',
                ];
                return ['blockName' => 'webx/recommended-carousel-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'viewAllLabel' => $b['viewAllLabel'] ?? '', 'viewAllUrl' => $b['viewAllUrl'] ?? '',
            ];
            return ['blockName' => 'webx/recommended-carousel', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'feature-directory':
            $children = array_map(function ($it) {
                $attrs = ['title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'href' => $it['href'] ?? '#', 'linkLabel' => $it['linkLabel'] ?? ''];
                return ['blockName' => 'webx/feature-directory-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'variant' => $b['variant'] ?? '',
                'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'linkLabel' => $b['linkLabel'] ?? '',
                'featureLabel' => $b['featureLabel'] ?? '', 'featureTitle' => $b['featureTitle'] ?? '',
                'featureBody' => $b['featureBody'] ?? '', 'featureLinkLabel' => $b['featureLinkLabel'] ?? '', 'featureLinkUrl' => $b['featureLinkUrl'] ?? '',
            ];
            return ['blockName' => 'webx/feature-directory', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'table':
            $columns = array_map(function ($c) {
                return ['blockName' => 'webx/table-column', 'attrs' => ['label' => $c], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['columns'] ?? []);
            $rows = array_map(function ($row) {
                $cells = array_map(function ($c) {
                    return ['blockName' => 'webx/table-cell', 'attrs' => ['value' => $c], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
                }, $row);
                return ['blockName' => 'webx/table-row', 'attrs' => [], 'innerBlocks' => $cells, 'innerHTML' => '', 'innerContent' => array_fill(0, count($cells), null)];
            }, $b['rows'] ?? []);
            $children = array_merge($columns, $rows);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'variant' => $b['variant'] ?? '',
                'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'caption' => $b['caption'] ?? '',
            ];
            return ['blockName' => 'webx/table', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'media-tabs':
            $tabs = array_map(function ($t) {
                $items = array_map(function ($it) {
                    $attrs = ['image' => $it['image'] ?? '', 'caption' => $it['caption'] ?? '', 'tag' => $it['tag'] ?? '', 'title' => $it['title'] ?? ''];
                    return ['blockName' => 'webx/media-tabs-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
                }, $t['items'] ?? []);
                $attrs = ['tabId' => $t['id'] ?? '', 'label' => $t['label'] ?? '', 'kind' => $t['kind'] ?? 'pub'];
                return ['blockName' => 'webx/media-tabs-tab', 'attrs' => $attrs, 'innerBlocks' => $items, 'innerHTML' => '', 'innerContent' => array_fill(0, count($items), null)];
            }, $b['tabs'] ?? []);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'viewAllLabel' => $b['viewAllLabel'] ?? '', 'viewAllUrl' => $b['viewAllUrl'] ?? '',
            ];
            return ['blockName' => 'webx/media-tabs', 'attrs' => $attrs, 'innerBlocks' => $tabs, 'innerHTML' => '', 'innerContent' => array_fill(0, count($tabs), null)];

        case 'news-tabs':
            $tabs = array_map(function ($t) {
                $side = array_map(function ($it) {
                    $attrs = ['image' => $it['image'] ?? '', 'type' => $it['type'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? ''];
                    return ['blockName' => 'webx/news-tabs-side-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
                }, $t['side'] ?? []);
                $f = $t['featured'] ?? [];
                $attrs = [
                    'tabId' => $t['id'] ?? '', 'label' => $t['label'] ?? '',
                    'featuredImage' => $f['image'] ?? '', 'featuredBadge' => $f['badge'] ?? '', 'featuredDate' => $f['date'] ?? '',
                    'featuredCategory' => $f['category'] ?? '', 'featuredTitle' => $f['title'] ?? '', 'featuredBody' => $f['body'] ?? '', 'featuredCtaLabel' => $f['ctaLabel'] ?? '',
                ];
                return ['blockName' => 'webx/news-tabs-tab', 'attrs' => $attrs, 'innerBlocks' => $side, 'innerHTML' => '', 'innerContent' => array_fill(0, count($side), null)];
            }, $b['tabs'] ?? []);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'viewAllLabel' => $b['viewAllLabel'] ?? '', 'viewAllUrl' => $b['viewAllUrl'] ?? '',
            ];
            return ['blockName' => 'webx/news-tabs', 'attrs' => $attrs, 'innerBlocks' => $tabs, 'innerHTML' => '', 'innerContent' => array_fill(0, count($tabs), null)];

        case 'service-hub':
            $steps = array_map(function ($s) {
                return ['blockName' => 'webx/service-hub-step', 'attrs' => ['label' => $s['label'] ?? ''], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['steps'] ?? []);
            $items = array_map(function ($it) {
                $attrs = [
                    'badge' => $it['badge'] ?? '', 'time' => $it['time'] ?? '',
                    'title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'buttonLabel' => $it['buttonLabel'] ?? '',
                ];
                return ['blockName' => 'webx/service-hub-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $children = array_merge($steps, $items);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'viewAllLabel' => $b['viewAllLabel'] ?? '', 'viewAllUrl' => $b['viewAllUrl'] ?? '',
                'introLabel' => $b['introLabel'] ?? '', 'introHeading' => $b['introHeading'] ?? '', 'introLead' => $b['introLead'] ?? '',
            ];
            return ['blockName' => 'webx/service-hub', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'org-structure':
            $children = array_map(function ($it) {
                $attrs = ['title' => $it['title'] ?? '', 'body' => $it['body'] ?? ''];
                return ['blockName' => 'webx/org-structure-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $src = $b['source'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '', 'image' => $b['image'] ?? '',
                'councilLabel' => $b['councilLabel'] ?? '', 'councilTitle' => $b['councilTitle'] ?? '', 'councilBody' => $b['councilBody'] ?? '',
                'officeLabel' => $b['officeLabel'] ?? '', 'officeTitle' => $b['officeTitle'] ?? '', 'officeBody' => $b['officeBody'] ?? '',
                'schoolsHeading' => $b['schoolsHeading'] ?? '', 'schoolsLead' => $b['schoolsLead'] ?? '',
                'sourceEnabled' => !empty($src), 'sourcePostType' => $src['postType'] ?? 'org-unit', 'sourceMap' => $src['map'] ?? 'orgunit',
            ];
            return ['blockName' => 'webx/org-structure', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'service-gateway':
            $items = array_map(function ($it) {
                $attrs = ['label' => $it['label'] ?? '', 'title' => $it['title'] ?? '', 'body' => $it['body'] ?? '', 'href' => $it['href'] ?? '#'];
                return ['blockName' => 'webx/service-gateway-item', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['items'] ?? []);
            $steps = array_map(function ($s) {
                return ['blockName' => 'webx/service-gateway-step', 'attrs' => ['label' => $s], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['steps'] ?? []);
            $children = array_merge($items, $steps);
            $attrs = [
                'blockId' => $b['id'] ?? '', 'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'viewAllLabel' => $b['viewAllLabel'] ?? '', 'viewAllUrl' => $b['viewAllUrl'] ?? '',
                'mainLabel' => $b['mainLabel'] ?? '', 'mainTitle' => $b['mainTitle'] ?? '', 'mainBody' => $b['mainBody'] ?? '',
                'mainActionLabel' => $b['mainActionLabel'] ?? '', 'mainHref' => $b['mainHref'] ?? '', 'processLabel' => $b['processLabel'] ?? '',
            ];
            return ['blockName' => 'webx/service-gateway', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        case 'two-column':
            $paragraphs = array_map(function ($p) {
                return ['blockName' => 'webx/two-column-paragraph', 'attrs' => ['text' => $p], 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['paragraphs'] ?? []);
            $actionBlocks = array_map(function ($a) {
                $attrs = ['label' => $a['label'] ?? '', 'href' => $a['href'] ?? '#', 'variant' => $a['variant'] ?? ''];
                return ['blockName' => 'webx/two-column-action', 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => []];
            }, $b['actions'] ?? []);
            $children = array_merge($paragraphs, $actionBlocks);
            $act = $b['action'] ?? [];
            $attrs = [
                'blockId' => $b['id'] ?? '', 'variant' => $b['variant'] ?? '',
                'eyebrow' => $b['eyebrow'] ?? '', 'heading' => $b['heading'] ?? '', 'lead' => $b['lead'] ?? '',
                'actionLabel' => $act['label'] ?? '', 'actionUrl' => $act['href'] ?? '',
                'subheading' => $b['subheading'] ?? '', 'image' => $b['image'] ?? '', 'imageAlt' => $b['imageAlt'] ?? '',
                'imageSide' => $b['imageSide'] ?? 'right',
            ];
            return ['blockName' => 'webx/two-column', 'attrs' => $attrs, 'innerBlocks' => $children, 'innerHTML' => '', 'innerContent' => array_fill(0, count($children), null)];

        default:
            return null;
    }
}
