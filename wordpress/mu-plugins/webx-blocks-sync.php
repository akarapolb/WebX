<?php
// Syncs the native Gutenberg blocks registered in webx-blocks.php into
// page.acf.blocks — the one JSON field public-site's renderer
// (templates/orst|royalsociety/Blocks.tsx) and webx-studio's Visual Builder
// both already read/write. Gutenberg becomes a second AUTHORING surface for
// that same data, never a second source of truth: public-site and the
// Visual Builder need zero changes because of this file.
//
// Hook choice: rest_after_insert_page fires after wp_insert_post() AND
// ACF's own field-save have both already run for this request (confirmed by
// reading WP core's REST controller — it runs right before the REST
// response is built), which matters because this hook calls update_field()
// itself; hooking any earlier risks ACF's own save clobbering this write
// right back out. It fires for every /wp/v2/pages write, including
// Gutenberg's own "Update" button and webx-studio's own writes (both go
// through the identical REST route) — both already passed through
// custom-role-enforcement.php's rest_request_before_callbacks filter by the
// time this runs, so tenant-scoping/create-update-delete permission checks
// are already enforced identically for either save path; this file only
// adds the two hazards below, which that filter can't see (it inspects the
// REQUEST payload, not the saved post's resulting post_content).
// A THIRD hazard, discovered live rather than anticipated in the original
// design: ACF free registers group_page_layout's "Blocks (JSON)" field as a
// classic meta box, and the block editor keeps a hidden classic <form> for
// exactly this kind of legacy meta box — clicking Publish/Update submits
// BOTH the REST save (where this file's own hook runs) AND, moments later,
// that classic form via a separate `post.php?...&meta-box-loader=1` POST.
// The classic form always resubmits whatever was in the textarea at PAGE
// LOAD, which is stale the instant this hook writes a fresh value — so that
// second submission was silently overwriting this sync back to empty on
// every single save, 100% reproducibly. Confirmed live via a debug
// error_log() in this file: the sync itself always ran and always returned
// true, but the field read back empty a moment later regardless. Removing
// the meta box removes that second, always-losing save path entirely — this
// field was never meant to be hand-edited from wp-admin's classic UI anyway
// (see its own "Managed by the WebX Visual Builder" instructions).
add_action('add_meta_boxes_page', function () {
    remove_meta_box('acf-group_page_layout', 'page', 'normal');
}, 20);

// $post is deliberately untyped: WP's own REST controller passes whatever
// get_post() returns after the write, which is NULL if anything removed the
// post mid-request (custom-role-enforcement.php's own save_post backstop used
// to do exactly that on every REST create). A strict `WP_Post $post` turned
// that into an uncaught TypeError — a 500 on the whole request, masking the
// real cause. Bail quietly instead: there is nothing to sync for a post that
// no longer exists.
add_action('rest_after_insert_page', function ($post, WP_REST_Request $request, bool $creating) {
    if (!$post instanceof WP_Post) return;
    $parsed = parse_blocks($post->post_content);
    $webx_blocks = array_values(array_filter($parsed, function ($b) {
        return !empty($b['blockName']) && str_starts_with($b['blockName'], 'webx/');
    }));

    // Hazard: an unrelated save (title-only Quick Edit, or a page whose
    // layout was built entirely via the Visual Builder and has never been
    // opened in Gutenberg at all — post_content is empty either way) must
    // NOT wipe the existing `blocks` JSON to "[]". Only sync when this save
    // actually contains recognized layout blocks — same reasoning as
    // wordpress.ts's encodeJsonFields() skipping absent keys on the
    // webx-studio side of this exact field.
    if (!$webx_blocks) return;

    // A FOURTH hazard, also only found live: even when $webx_blocks IS
    // non-empty, this phase only has 3 of the ~45 block types as real
    // Gutenberg blocks (see the plan's own "Non-goals"). A real page nearly
    // always mixes a couple of Gutenberg-editable types with several that
    // have no Gutenberg block yet (steps/link-list/feature-list/cta-band/
    // page-hero/table/...) — post_content only ever contains the FORMER, so
    // naively replacing the whole `blocks` array with what was parsed here
    // silently discards every block type this phase doesn't cover yet.
    // Confirmed live against a real 7-block ORST page: a save after editing
    // just the 2 backfilled blocks (card-grid, notice) collapsed the page to
    // those 2 blocks alone. Fix: merge by id into the EXISTING array instead
    // of replacing it — update in place whatever this save's Gutenberg
    // blocks match by id, leave every other existing entry untouched, and
    // append any Gutenberg block whose id has no existing counterpart (a
    // block authored purely in Gutenberg, never backfilled from anywhere).

    // Hazard: a custom role that marks `blocks` hidden/readonly (meant to
    // stop that user editing layout at all — see acf-fields.php's own
    // comment on group_page_layout) is enforced today by
    // custom-role-enforcement.php stripping `request.acf.blocks` before the
    // route callback runs. This sync writes `blocks` through a DIFFERENT
    // path (update_field(), not the request param), so it must re-run that
    // same check itself or it would silently reopen exactly the hole that
    // readonly flag exists to close.
    $user = wp_get_current_user();
    if ($user && $user->exists() && !empty($user->user_email) && function_exists('webx_crp_fetch')) {
        $perms = webx_crp_fetch(strtolower($user->user_email), 'wp:page');
        // webx_crp_forbidden_fields() — shared with custom-role-enforcement.php's
        // own REST write filter (M18, 2026-09-12 audit finding: this was an
        // independently re-implemented copy of the same one-liner).
        if (function_exists('webx_crp_forbidden_fields') && in_array('blocks', webx_crp_forbidden_fields($perms), true)) return;
    }

    $synced = array_values(array_filter(array_map('webx_blocks_sync_map_block', $webx_blocks)));
    $synced_by_id = [];
    foreach ($synced as $b) { $synced_by_id[$b['id']] = $b; }

    $raw = get_field('blocks', $post->ID);
    $existing = is_string($raw) ? (json_decode($raw, true) ?: []) : [];
    $seen = [];
    $merged = array_map(function ($b) use ($synced_by_id, &$seen) {
        $id = $b['id'] ?? null;
        if ($id !== null && isset($synced_by_id[$id])) {
            $seen[$id] = true;
            $s = $synced_by_id[$id];
            // Fields the Visual Builder owns that have no Gutenberg
            // representation at all — component moves/resizes (boxes.ts),
            // per-component colour/size/background (styles.ts) and the
            // editor's own name for the block. Carry them over rather than
            // let a wp-admin save silently throw them away.
            foreach (['boxes', 'styles', '__label'] as $k) {
                if (isset($b[$k]) && !isset($s[$k])) $s[$k] = $b[$k];
            }
            return $s;
        }
        return $b;
    }, $existing);
    foreach ($synced as $b) {
        if (empty($seen[$b['id']])) $merged[] = $b; // a block authored purely in Gutenberg, no existing entry to match — append
    }

    update_field('blocks', wp_json_encode($merged, JSON_UNESCAPED_UNICODE), $post->ID);

    $url = getenv('WEBX_STUDIO_INTERNAL_URL');
    $secret = getenv('WEBX_SCHEDULER_SECRET');
    if ($url && $secret) {
        wp_remote_post(rtrim($url, '/') . '/api/internal/rebuild', [
            'headers' => ['x-internal-secret' => $secret],
            'timeout' => 3,
            'blocking' => false, // fire-and-forget, matches requestPublicSiteRebuild()'s own "never block the caller" design
        ]);
    }
}, 10, 3);

/** One parsed top-level webx/* block -> the exact {type,id,...} shape
 * Blocks.tsx/VisualBuilder.tsx already expect. Returns null for a block
 * type this mu-plugin doesn't (yet) know how to map, so a stray/future
 * block name never crashes the sync — it's just silently excluded from
 * this save (same "don't touch what you don't understand" posture as
 * everything else in this governance layer). */
function webx_blocks_sync_map_block(array $block): ?array
{
    $a = $block['attrs'] ?? [];
    $id = !empty($a['blockId']) ? $a['blockId'] : wp_generate_uuid4();

    switch ($block['blockName']) {
        case 'webx/notice':
            return [
                'type' => 'notice', 'id' => $id,
                'variant' => $a['variant'] ?? '', 'title' => $a['title'] ?? '',
                'body' => $a['body'] ?? '', 'tone' => $a['tone'] ?? 'info',
            ];

        case 'webx/faq':
            return [
                'type' => 'faq', 'id' => $id, 'variant' => $a['variant'] ?? '',
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/faq-item'
                        ? ['q' => $ib['attrs']['q'] ?? '', 'a' => $ib['attrs']['a'] ?? '']
                        : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/card-grid':
            $out = [
                'type' => 'card-grid', 'id' => $id, 'variant' => $a['variant'] ?? '',
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'columns' => $a['columns'] ?? '3',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/card-grid-item' ? [
                        'icon' => $ib['attrs']['icon'] ?? '', 'tag' => $ib['attrs']['tag'] ?? '',
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '',
                        'meta' => $ib['attrs']['meta'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            if (!empty($a['sourceEnabled'])) {
                $out['source'] = array_filter([
                    'kind' => 'wp',
                    'postType' => $a['sourcePostType'] ?? 'service',
                    'map' => $a['sourceMap'] ?? 'card',
                    'icon' => $a['sourceIcon'] ?? '',
                    'tag' => $a['sourceTag'] ?? '',
                    'limit' => $a['sourceLimit'] ?? 0,
                    'offset' => $a['sourceOffset'] ?? 0,
                ], fn($v) => $v !== '' && $v !== 0);
                $out['source']['kind'] = 'wp'; // array_filter above would drop this if 'wp' were ever falsy — it isn't, but keep intent explicit
            }
            return $out;

        case 'webx/rs-card-grid':
            return [
                'type' => 'card-grid', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'columns' => $a['columns'] ?? '3', 'variant' => !empty($a['flat']) ? 'flat' : '',
                'linkLabel' => $a['linkLabel'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/rs-card-grid-item' ? [
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '',
                        'image' => $ib['attrs']['image'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/cta-band':
            return [
                'type' => 'cta-band', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'body' => $a['body'] ?? '',
                'actions' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/cta-band-action' ? [
                        'label' => $ib['attrs']['label'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                        'variant' => !empty($ib['attrs']['ghost']) ? 'ghost' : '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/logo-marquee':
            return [
                'type' => 'logo-marquee', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'viewAllLabel' => $a['viewAllLabel'] ?? '', 'viewAllUrl' => $a['viewAllUrl'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/logo-marquee-item' ? [
                        'name' => $ib['attrs']['name'] ?? '', 'image' => $ib['attrs']['image'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/steps':
            return [
                'type' => 'steps', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/steps-item' ? ['title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? ''] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/stats-steps':
            return [
                'type' => 'stats-steps', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                // Scalar items (a plain string array in the JSON, not objects) — see stats-steps-item's own comment.
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/stats-steps-item' ? ($ib['attrs']['label'] ?? '') : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/feature-list':
            return [
                'type' => 'feature-list', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'columns' => $a['columns'] ?? '3',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/feature-list-item' ? [
                        'icon' => $ib['attrs']['icon'] ?? '', 'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/mission-grid':
            $out = [
                'type' => 'mission-grid', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'linkLabel' => $a['linkLabel'] ?? '', 'linkHref' => $a['linkHref'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/mission-grid-item' ? [
                        'icon' => $ib['attrs']['icon'] ?? '', 'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            if (!empty($a['sourceEnabled'])) {
                $out['source'] = ['kind' => 'wp', 'postType' => $a['sourcePostType'] ?? 'mission', 'map' => $a['sourceMap'] ?? 'mission'];
            }
            return $out;

        case 'webx/page-hero':
            return [
                'type' => 'page-hero', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'actions' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/page-hero-action' ? [
                        'label' => $ib['attrs']['label'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                        'variant' => !empty($ib['attrs']['ghost']) ? 'ghost' : '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/rs-page-hero':
            return [
                'type' => 'page-hero', 'id' => $id, 'variant' => !empty($a['deep']) ? 'deep' : '',
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
            ];

        case 'webx/stat-row':
            return [
                'type' => 'stat-row', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/stat-row-item' ? [
                        'value' => $ib['attrs']['value'] ?? '', 'label' => $ib['attrs']['label'] ?? '', 'note' => $ib['attrs']['note'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/link-list':
            $out = [
                'type' => 'link-list', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/link-list-item' ? [
                        'icon' => $ib['attrs']['icon'] ?? '', 'title' => $ib['attrs']['title'] ?? '', 'desc' => $ib['attrs']['desc'] ?? '',
                        'tag' => $ib['attrs']['tag'] ?? '', 'meta' => $ib['attrs']['meta'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            if (!empty($a['sourceEnabled'])) {
                $out['source'] = ['kind' => 'wp', 'postType' => $a['sourcePostType'] ?? 'publication', 'map' => $a['sourceMap'] ?? 'link'];
            }
            // Found live while researching two-column: the generic Section
            // wrapper's optional top-right "view all" link (`action:
            // {label,href}`) was never represented as a Gutenberg attribute
            // on link-list or media-grid, and the sync hook's merge-by-id
            // logic fully REPLACES a matched block rather than deep-merging
            // — so any Gutenberg save on orst-news' or orst-publications'
            // real link-list/media-grid blocks would have silently deleted
            // their existing `action` field. Fixed here and in media-grid's
            // case below by flattening it into actionLabel/actionUrl, same
            // technique as every other single-object sub-field in this file.
            if (!empty($a['actionLabel']) || !empty($a['actionUrl'])) {
                $out['action'] = ['label' => $a['actionLabel'] ?? '', 'href' => $a['actionUrl'] ?? '#'];
            }
            return $out;

        case 'webx/list-panel':
            $out = [
                'type' => 'list-panel', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/list-panel-item' ? [
                        'date' => $ib['attrs']['date'] ?? '', 'tag' => $ib['attrs']['tag'] ?? '',
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            if (!empty($a['sourceEnabled'])) {
                $out['source'] = ['kind' => 'wp', 'postType' => $a['sourcePostType'] ?? 'news', 'map' => $a['sourceMap'] ?? 'dated'];
            }
            return $out;

        case 'webx/media-grid':
            $out = [
                'type' => 'media-grid', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'columns' => $a['columns'] ?? '3',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/media-grid-item' ? [
                        'image' => $ib['attrs']['image'] ?? '', 'alt' => $ib['attrs']['alt'] ?? '', 'title' => $ib['attrs']['title'] ?? '',
                        'desc' => $ib['attrs']['desc'] ?? '', 'tag' => $ib['attrs']['tag'] ?? '', 'href' => $ib['attrs']['href'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            // See link-list's own comment above on why this exists.
            if (!empty($a['actionLabel']) || !empty($a['actionUrl'])) {
                $out['action'] = ['label' => $a['actionLabel'] ?? '', 'href' => $a['actionUrl'] ?? '#'];
            }
            return $out;

        case 'webx/contact-info':
            return [
                'type' => 'contact-info', 'id' => $id,
                'address' => $a['address'] ?? '', 'phone' => $a['phone'] ?? '', 'email' => $a['email'] ?? '',
                'hours' => $a['hours'] ?? '', 'mapEmbed' => $a['mapEmbed'] ?? '',
            ];

        case 'webx/rs-contact-info':
            return [
                'type' => 'contact-info', 'id' => $id,
                'heading' => $a['heading'] ?? '', 'address' => $a['address'] ?? '', 'phone' => $a['phone'] ?? '',
                'email' => $a['email'] ?? '', 'hours' => $a['hours'] ?? '',
            ];

        case 'webx/trust-strip':
            return [
                'type' => 'trust-strip', 'id' => $id, 'eyebrow' => $a['eyebrow'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/trust-strip-item' ? ['icon' => $ib['attrs']['icon'] ?? '', 'title' => $ib['attrs']['title'] ?? ''] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/timeline':
            $out = [
                'type' => 'timeline', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/timeline-item' ? [
                        'year' => $ib['attrs']['year'] ?? '', 'statusLabel' => $ib['attrs']['statusLabel'] ?? '',
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            if (!empty($a['sourceEnabled'])) {
                $out['source'] = ['kind' => 'wp', 'postType' => $a['sourcePostType'] ?? 'timeline', 'map' => $a['sourceMap'] ?? 'timeline'];
            }
            return $out;

        case 'webx/vm-strip':
            return [
                'type' => 'vm-strip', 'id' => $id,
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/vm-strip-item' ? ($ib['attrs']['label'] ?? '') : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/rich-text':
            return [
                'type' => 'rich-text', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'width' => !empty($a['full']) ? 'full' : '',
                // Deliberately never sets `html` — that field only ever
                // comes from the server-side merge this block's own
                // block.json comment documents; a Gutenberg-authored
                // rich-text block always uses the escaped paragraphs path.
                'paragraphs' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/rich-text-item' ? ($ib['attrs']['text'] ?? '') : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/contact-hero':
            return [
                'type' => 'contact-hero', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'cta1Label' => $a['cta1Label'] ?? '', 'cta1Url' => $a['cta1Url'] ?? '',
                'cta2Label' => $a['cta2Label'] ?? '', 'cta2Url' => $a['cta2Url'] ?? '',
                'officeHours' => $a['officeHours'] ?? '', 'phone' => $a['phone'] ?? '', 'email' => $a['email'] ?? '', 'address' => $a['address'] ?? '',
            ];

        case 'webx/home-hero':
            return [
                'type' => 'home-hero', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
            ];

        case 'webx/about-hero':
            return [
                'type' => 'about-hero', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'subtitle' => $a['subtitle'] ?? '', 'lead' => $a['lead'] ?? '',
                'action1Label' => $a['action1Label'] ?? '', 'action1Href' => $a['action1Href'] ?? '',
                'action2Label' => $a['action2Label'] ?? '', 'action2Href' => $a['action2Href'] ?? '', 'image' => $a['image'] ?? '',
            ];

        case 'webx/intro-feature':
            return [
                'type' => 'intro-feature', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '',
                'highlightLabel' => $a['highlightLabel'] ?? '', 'highlightText' => $a['highlightText'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/intro-feature-item' ? [
                        'label' => $ib['attrs']['label'] ?? '', 'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/contact-form':
            return [
                'type' => 'contact-form', 'id' => $id,
                'kicker' => $a['kicker'] ?? '', 'heading' => $a['heading'] ?? '', 'intro' => $a['intro'] ?? '',
            ];

        case 'webx/rs-contact-form':
            return [
                'type' => 'contact-form', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
            ];

        case 'webx/news-feed':
            return [
                'type' => 'news-feed', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'viewAllLabel' => $a['viewAllLabel'] ?? '', 'viewAllUrl' => $a['viewAllUrl'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/news-feed-item' ? [
                        'date' => $ib['attrs']['date'] ?? '', 'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/recommended-carousel':
            return [
                'type' => 'recommended-carousel', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'viewAllLabel' => $a['viewAllLabel'] ?? '', 'viewAllUrl' => $a['viewAllUrl'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/recommended-carousel-item' ? [
                        'image' => $ib['attrs']['image'] ?? '', 'type' => $ib['attrs']['type'] ?? '', 'category' => $ib['attrs']['category'] ?? '',
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '', 'href' => $ib['attrs']['href'] ?? '#', 'linkLabel' => $ib['attrs']['linkLabel'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/feature-directory':
            return [
                'type' => 'feature-directory', 'id' => $id, 'variant' => $a['variant'] ?? '',
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'linkLabel' => $a['linkLabel'] ?? '',
                'featureLabel' => $a['featureLabel'] ?? '', 'featureTitle' => $a['featureTitle'] ?? '',
                'featureBody' => $a['featureBody'] ?? '', 'featureLinkLabel' => $a['featureLinkLabel'] ?? '', 'featureLinkUrl' => $a['featureLinkUrl'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/feature-directory-item' ? [
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '', 'href' => $ib['attrs']['href'] ?? '#', 'linkLabel' => $ib['attrs']['linkLabel'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/table':
            return [
                'type' => 'table', 'id' => $id, 'variant' => $a['variant'] ?? '',
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'caption' => $a['caption'] ?? '',
                // Scalar columns (plain string array) — same convention as stats-steps/vm-strip's own comment.
                'columns' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/table-column' ? ($ib['attrs']['label'] ?? '') : null,
                    $block['innerBlocks'] ?? []
                ))),
                // Genuinely nested: each row is itself a parent block whose own
                // innerBlocks are the cells — a real 2D InnerBlocks repeater, the
                // first one in this codebase with 3 levels of nesting. The outer
                // filter uses an explicit `!== null` callback (not the default
                // truthy check array_filter uses elsewhere) because a row with
                // zero cells maps to `[]`, which default array_filter would
                // wrongly treat as falsy and drop.
                'rows' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/table-row'
                        ? array_values(array_filter(array_map(
                            fn($ic) => $ic['blockName'] === 'webx/table-cell' ? ($ic['attrs']['value'] ?? '') : null,
                            $ib['innerBlocks'] ?? []
                        )))
                        : null,
                    $block['innerBlocks'] ?? []
                ), fn($v) => $v !== null)),
            ];

        case 'webx/media-tabs':
            return [
                'type' => 'media-tabs', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'viewAllLabel' => $a['viewAllLabel'] ?? '', 'viewAllUrl' => $a['viewAllUrl'] ?? '',
                // Three levels deep, like table's row/cell nesting: each tab is
                // itself a parent block whose own innerBlocks are its items.
                'tabs' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/media-tabs-tab' ? [
                        'id' => $ib['attrs']['tabId'] ?? '', 'label' => $ib['attrs']['label'] ?? '', 'kind' => $ib['attrs']['kind'] ?? 'pub',
                        'items' => array_values(array_filter(array_map(
                            fn($ic) => $ic['blockName'] === 'webx/media-tabs-item' ? [
                                'image' => $ic['attrs']['image'] ?? '', 'caption' => $ic['attrs']['caption'] ?? '',
                                'tag' => $ic['attrs']['tag'] ?? '', 'title' => $ic['attrs']['title'] ?? '',
                            ] : null,
                            $ib['innerBlocks'] ?? []
                        ))),
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/news-tabs':
            return [
                'type' => 'news-tabs', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'viewAllLabel' => $a['viewAllLabel'] ?? '', 'viewAllUrl' => $a['viewAllUrl'] ?? '',
                // Each tab has ONE fixed "featured" object (not a repeatable
                // list) — flattened into featured*-prefixed scalar attrs on the
                // tab block itself, same technique feature-directory already
                // uses for its single "feature card" sub-object — plus a real
                // repeatable "side" items list as nested innerBlocks.
                'tabs' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/news-tabs-tab' ? [
                        'id' => $ib['attrs']['tabId'] ?? '', 'label' => $ib['attrs']['label'] ?? '',
                        'featured' => [
                            'image' => $ib['attrs']['featuredImage'] ?? '', 'badge' => $ib['attrs']['featuredBadge'] ?? '',
                            'date' => $ib['attrs']['featuredDate'] ?? '', 'category' => $ib['attrs']['featuredCategory'] ?? '',
                            'title' => $ib['attrs']['featuredTitle'] ?? '', 'body' => $ib['attrs']['featuredBody'] ?? '',
                            'ctaLabel' => $ib['attrs']['featuredCtaLabel'] ?? '',
                        ],
                        'side' => array_values(array_filter(array_map(
                            fn($ic) => $ic['blockName'] === 'webx/news-tabs-side-item' ? [
                                'image' => $ic['attrs']['image'] ?? '', 'type' => $ic['attrs']['type'] ?? '',
                                'title' => $ic['attrs']['title'] ?? '', 'body' => $ic['attrs']['body'] ?? '',
                            ] : null,
                            $ib['innerBlocks'] ?? []
                        ))),
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/service-hub':
            return [
                'type' => 'service-hub', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'viewAllLabel' => $a['viewAllLabel'] ?? '', 'viewAllUrl' => $a['viewAllUrl'] ?? '',
                'introLabel' => $a['introLabel'] ?? '', 'introHeading' => $a['introHeading'] ?? '', 'introLead' => $a['introLead'] ?? '',
                // Two different child block types side by side under one
                // parent — same "mixed sibling InnerBlocks" pattern table's
                // columns/rows already established, just one level shallower
                // (both children here are leaves, not further nested).
                'steps' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/service-hub-step' ? ['label' => $ib['attrs']['label'] ?? ''] : null,
                    $block['innerBlocks'] ?? []
                ))),
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/service-hub-item' ? [
                        'badge' => $ib['attrs']['badge'] ?? '', 'time' => $ib['attrs']['time'] ?? '',
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '', 'buttonLabel' => $ib['attrs']['buttonLabel'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/org-structure':
            $out = [
                'type' => 'org-structure', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '', 'image' => $a['image'] ?? '',
                'councilLabel' => $a['councilLabel'] ?? '', 'councilTitle' => $a['councilTitle'] ?? '', 'councilBody' => $a['councilBody'] ?? '',
                'officeLabel' => $a['officeLabel'] ?? '', 'officeTitle' => $a['officeTitle'] ?? '', 'officeBody' => $a['officeBody'] ?? '',
                'schoolsHeading' => $a['schoolsHeading'] ?? '', 'schoolsLead' => $a['schoolsLead'] ?? '',
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/org-structure-item' ? [
                        'title' => $ib['attrs']['title'] ?? '', 'body' => $ib['attrs']['body'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            // Same optional live-feed binding as card-grid, flattened the same
            // way (sourceEnabled toggle + source*-prefixed scalar attrs).
            if (!empty($a['sourceEnabled'])) {
                $out['source'] = [
                    'kind' => 'wp',
                    'postType' => $a['sourcePostType'] ?? 'org-unit',
                    'map' => $a['sourceMap'] ?? 'orgunit',
                ];
            }
            return $out;

        case 'webx/service-gateway':
            return [
                'type' => 'service-gateway', 'id' => $id,
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'viewAllLabel' => $a['viewAllLabel'] ?? '', 'viewAllUrl' => $a['viewAllUrl'] ?? '',
                'mainLabel' => $a['mainLabel'] ?? '', 'mainTitle' => $a['mainTitle'] ?? '', 'mainBody' => $a['mainBody'] ?? '',
                'mainActionLabel' => $a['mainActionLabel'] ?? '', 'mainHref' => $a['mainHref'] ?? '', 'processLabel' => $a['processLabel'] ?? '',
                // Two different child block types side by side, same pattern as
                // service-hub's step/item mix — `items` is object-shaped,
                // `steps` is a plain string array like stats-steps/vm-strip.
                'items' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/service-gateway-item' ? [
                        'label' => $ib['attrs']['label'] ?? '', 'title' => $ib['attrs']['title'] ?? '',
                        'body' => $ib['attrs']['body'] ?? '', 'href' => $ib['attrs']['href'] ?? '#',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
                'steps' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/service-gateway-step' ? ($ib['attrs']['label'] ?? '') : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];

        case 'webx/two-column':
            $out = [
                'type' => 'two-column', 'id' => $id, 'variant' => $a['variant'] ?? '',
                'eyebrow' => $a['eyebrow'] ?? '', 'heading' => $a['heading'] ?? '', 'lead' => $a['lead'] ?? '',
                'subheading' => $a['subheading'] ?? '', 'image' => $a['image'] ?? '', 'imageAlt' => $a['imageAlt'] ?? '',
                'imageSide' => $a['imageSide'] ?? 'right',
                // Two different child block types side by side, same
                // established pattern as table/service-hub/service-gateway —
                // `paragraphs` is a plain string array like stats-steps,
                // `actions` is object-shaped like every other item list.
                'paragraphs' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/two-column-paragraph' ? ($ib['attrs']['text'] ?? '') : null,
                    $block['innerBlocks'] ?? []
                ))),
                'actions' => array_values(array_filter(array_map(
                    fn($ib) => $ib['blockName'] === 'webx/two-column-action' ? [
                        'label' => $ib['attrs']['label'] ?? '', 'href' => $ib['attrs']['href'] ?? '#', 'variant' => $ib['attrs']['variant'] ?? '',
                    ] : null,
                    $block['innerBlocks'] ?? []
                ))),
            ];
            if (!empty($a['actionLabel']) || !empty($a['actionUrl'])) {
                $out['action'] = ['label' => $a['actionLabel'] ?? '', 'href' => $a['actionUrl'] ?? '#'];
            }
            return $out;

        default:
            return null;
    }
}
