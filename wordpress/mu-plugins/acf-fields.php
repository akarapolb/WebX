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
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'document']]],
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
}, 10);
