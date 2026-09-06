<?php
// Phase 10 — ACF (free tier) field groups for the structured content types
// registered in custom-post-types.php. Deliberately simple field types only
// (text/number/url) — no Repeater/Flexible Content, which are ACF Pro-only;
// each "repeatable section" is instead its own post type (see that file's
// comment + the Phase 10 plan). `show_in_rest => 1` on every group so values
// appear under an `acf` key in the WP REST response — no extra plugin
// needed, this has been core ACF (free) behavior since 5.11.
//
// Registered on 'acf/init' (ACF's own recommended hook, not the generic
// 'init' used by custom-post-types.php) so this only runs once ACF itself
// is fully loaded — acf_add_local_field_group() doesn't exist before that.
add_action('acf/init', function () {
    if (!function_exists('acf_add_local_field_group')) return;

    acf_add_local_field_group([
        'key' => 'group_timeline_event',
        'title' => 'Timeline Event Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_te_year', 'label' => 'Year', 'name' => 'year', 'type' => 'text',
                'instructions' => 'e.g. "พ.ศ. ๒๔๖๙" — kept as text since Thai Buddhist-era years use Thai numerals.'],
            ['key' => 'field_te_status', 'label' => 'Status Label', 'name' => 'status_label', 'type' => 'text',
                'instructions' => 'Optional highlight badge, e.g. "จุดเริ่มต้น". Leave blank for a plain entry.'],
            ['key' => 'field_te_order', 'label' => 'Order', 'name' => 'order', 'type' => 'number', 'default_value' => 0],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'timeline-event']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_mission_item',
        'title' => 'Mission Item Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_mi_icon', 'label' => 'Icon', 'name' => 'icon', 'type' => 'text',
                'instructions' => 'Icon-sprite id, e.g. "i-book" — must match a <symbol id> already defined in the tenant\'s icon sprite.'],
            ['key' => 'field_mi_order', 'label' => 'Order', 'name' => 'order', 'type' => 'number', 'default_value' => 0],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'mission-item']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_org_unit',
        'title' => 'Org Unit Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_ou_order', 'label' => 'Order', 'name' => 'order', 'type' => 'number', 'default_value' => 0],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'org-unit']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_document',
        'title' => 'Document Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_doc_tag', 'label' => 'Tag', 'name' => 'tag', 'type' => 'text',
                'instructions' => 'File-type badge, e.g. "PDF".'],
            ['key' => 'field_doc_fiscal_year', 'label' => 'Fiscal Year', 'name' => 'fiscal_year', 'type' => 'text'],
            ['key' => 'field_doc_file_url', 'label' => 'File URL', 'name' => 'file_url', 'type' => 'url',
                'instructions' => 'Leave blank until the real document is available — do not link a placeholder file.'],
            ['key' => 'field_doc_order', 'label' => 'Order', 'name' => 'order', 'type' => 'number', 'default_value' => 0],
            ['key' => 'field_doc_content_text', 'label' => 'Extracted Text (for search)', 'name' => 'content_text',
                'type' => 'textarea', 'rows' => 6, 'readonly' => 1,
                'instructions' => 'Bilingual/search gap (TOR gap audit) — the PDF/DOCX/XLSX text content extracted from this document\'s File URL, so a search for a word INSIDE the file (not just its title) can find it. Populated by strapi-cms/scripts/index-wp-documents.mjs, which downloads File URL and runs the same pdf-parse/mammoth/xlsx extraction Strapi\'s own ebook/download content types already use — re-run it after changing File URL. Read-only here for the same reason "Blocks (JSON)" above is: a script manages it, hand-editing risks it drifting out of sync with the actual file. Made searchable via wordpress/mu-plugins/document-search.php\'s posts_search filter.'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'document']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_event',
        'title' => 'Event Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_event_date', 'label' => 'Date', 'name' => 'event_date', 'type' => 'date_picker',
                'display_format' => 'd/m/Y', 'return_format' => 'Ymd',
                'instructions' => 'The calendar day this event appears on.'],
            ['key' => 'field_event_time', 'label' => 'Time', 'name' => 'event_time', 'type' => 'text',
                'instructions' => 'Free text, e.g. "09:00 - 12:00 น." — event times are often described as a range or "ตลอดวัน", not one instant.'],
            ['key' => 'field_event_location', 'label' => 'Location', 'name' => 'location', 'type' => 'text'],
            ['key' => 'field_event_category', 'label' => 'Category', 'name' => 'category', 'type' => 'text',
                'instructions' => 'Short label, e.g. "ประชุมวิชาการ", "กิจกรรมสาธารณะ", "นิทรรศการ" — shown as the event\'s calendar tag.'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'event']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_member',
        'title' => 'Member Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_member_tier', 'label' => 'Tier', 'name' => 'tier', 'type' => 'text',
                'instructions' => 'e.g. "ราชบัณฑิต" (Fellow) or "ภาคีสมาชิก" (Associate Member) — shown as the directory card\'s badge.'],
            ['key' => 'field_member_division', 'label' => 'Division', 'name' => 'division', 'type' => 'text',
                'instructions' => 'The สำนัก (bureau) they belong to — matches this tenant\'s org-unit names, e.g. "สำนักศิลปกรรม".'],
            ['key' => 'field_member_order', 'label' => 'Order', 'name' => 'order', 'type' => 'number', 'default_value' => 0],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'member']]],
    ]);

    // Media library gap (TOR — search/tag/reuse/crop/caption). Caption and
    // alt text are already native WP media fields (post_excerpt/alt_text
    // meta) — the REST API and every existing upload UI already read/write
    // them; only "tags" needed a new field, and only on the native
    // `attachment` type (matching the `page` type's own precedent above of
    // an ACF group targeting a WP CORE type, not just this file's custom
    // ones).
    acf_add_local_field_group([
        'key' => 'group_attachment_tags',
        'title' => 'Media Tags',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_attachment_tags', 'label' => 'Tags', 'name' => 'tags', 'type' => 'text',
                'instructions' => 'Comma-separated — searchable in the media library alongside filename/caption/alt text.'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'attachment']]],
    ]);

    // Bilingual EN (TOR gap — no locale/translation mechanism existed
    // anywhere in WordPress; public-site/lib/cms.ts's own comment used to
    // say "Thai locale only for this proof"). ACF free has no per-locale
    // entry model the way Strapi's i18n plugin does, so each translatable
    // CPT gets a sibling "_en" field instead — same additive-field pattern
    // already used everywhere else in this file (icon/tags), not a
    // structural change. Only the 5 CPTs actually rendered on the pages
    // made bilingual (home/about/contact/services) get this group; news/
    // publications/knowledge/dictionary/timeline/document/event stay
    // Thai-only for now (see the bilingual-EN plan writeup for why).
    // Falls back to the Thai title/excerpt whenever left blank — never
    // silently renders empty, never machine-translated.
    acf_add_local_field_group([
        'key' => 'group_i18n_en',
        'title' => 'English Translation',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_i18n_title_en', 'label' => 'Title (English)', 'name' => 'title_en', 'type' => 'text',
                'instructions' => 'Optional — falls back to the Thai title if left blank.'],
            ['key' => 'field_i18n_excerpt_en', 'label' => 'Body / Excerpt (English)', 'name' => 'excerpt_en', 'type' => 'textarea',
                'rows' => 3, 'instructions' => 'Optional — falls back to the Thai excerpt/body if left blank.'],
        ],
        'location' => [
            [['param' => 'post_type', 'operator' => '==', 'value' => 'service']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'org-unit']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'mission-item']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'faq']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'member']],
        ],
    ]);

    // A consistent icon system for the existing simple types too — the
    // Phase 10 redesign needs real per-entry icons instead of hardcoded
    // per-block icon choices in the React templates.
    acf_add_local_field_group([
        'key' => 'group_icon',
        'title' => 'Display Icon',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_icon', 'label' => 'Icon', 'name' => 'icon', 'type' => 'text',
                'instructions' => 'Icon-sprite id, e.g. "i-book" — must match a <symbol id> already defined in the tenant\'s icon sprite. Optional.'],
        ],
        'location' => [
            [['param' => 'post_type', 'operator' => '==', 'value' => 'service']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'publication']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'resource']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'faq']],
        ],
    ]);

    // The Visual Builder's WordPress-backed page layout (see
    // webx-studio/lib/cms/wordpress.ts's ACF_JSON_FIELDS and
    // public-site/lib/cms.ts's parseBlocks). ACF free has no Repeater/
    // Flexible Content field, so a JSON-encoded block array rides in a plain
    // textarea instead — the block schema itself lives in TypeScript next to
    // the renderer (templates/orst/Blocks.tsx), not duplicated here as PHP
    // field groups per block type. `show_in_rest` exposes it under `acf` on
    // BOTH authenticated and anonymous reads (same mechanism already proven
    // for timeline/mission/org-unit/document above) — public-site's WP reads
    // are always anonymous, so this is required, not incidental.
    //
    // Targets `page` globally (every tenant's WP pages, not just orst) since
    // ACF free has no per-taxonomy-term location rule. Harmless on tenants
    // that don't use it yet (e.g. royalsociety) — the field defaults to
    // empty and callers that don't look at `blocks` never see it.
    acf_add_local_field_group([
        'key' => 'group_page_layout',
        'title' => 'Page Layout',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_page_blocks', 'label' => 'Blocks (JSON)', 'name' => 'blocks',
                'type' => 'textarea', 'rows' => 20, 'default_value' => '', 'readonly' => 1,
                'instructions' => 'Managed by the WebX Visual Builder — edit the page there, not here. This field is read-only in wp-admin on purpose: a block\'s "id" is a join key the public site uses to merge in live content (services/FAQs/etc), and hand-editing risks breaking that silently. `readonly` here is a UI-only attribute — it disables the wp-admin form control but does NOT affect REST API writes (verified: PUT /wp/v2/pages/<id> with a new acf.blocks value round-trips exactly the same before and after this flag), so the Visual Builder is unaffected.'],
            ['key' => 'field_page_blocks_en', 'label' => 'Blocks — English (JSON)', 'name' => 'blocks_en',
                'type' => 'textarea', 'rows' => 20, 'default_value' => '', 'readonly' => 1,
                'instructions' => 'Bilingual EN (TOR gap) — the English-language layout for this same page, same block-array shape as "Blocks (JSON)" above, seeded by wordpress/seed-en-content-blocks.mjs. Read-only for the same reason as that field. Empty on any page that hasn\'t been made bilingual yet — the /en/ route falls back to that page\'s static content/en/*.json in that case.'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'page']]],
    ]);
}, 10);
