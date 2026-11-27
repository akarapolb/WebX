<?php
// Field filters and sorting for Studio's lists of WordPress content. The engine contract's entries.list takes eq, ne,
// contains, gte and lte filters and a "field:asc|desc" sort (docs/engine-contract.md section 8); WordPress's REST API
// filters posts by its own parameters only, so the adapter (webx-studio/lib/cms/wordpress.ts) dropped every other
// filter, could sort by title or date only, and a filtered list held every entry of the tenant. Found by the engine
// conformance suite's WordPress run (2026-11-27). The adapter now also sends the filters as `webx_filter` (JSON, a list
// of {field, op, value}) and a sort WordPress has no orderby for as `webx_sort` ("field:asc"); this adds them to the
// query.
//
// Only for a signed-in user who may edit posts (Studio's requests always are): what a visitor's read returns stays as
// WordPress serves it. Only the title and the type's own ACF fields can be filtered or sorted on; any other field is
// ignored, as before, so no other post meta can be probed through here.

/** The ACF fields of a post type, name => ACF field type. */
function webx_lf_fields(string $post_type): array
{
    if (!function_exists('acf_get_field_groups') || !function_exists('acf_get_fields')) return [];
    $out = [];
    foreach (acf_get_field_groups(['post_type' => $post_type]) as $group) {
        foreach ((array) acf_get_fields($group) as $field) {
            if (!empty($field['name'])) $out[$field['name']] = $field['type'] ?? 'text';
        }
    }
    return $out;
}

/** rest_{type}_query: turns webx_filter and webx_sort into WP_Query arguments. */
function webx_lf_apply(array $args, WP_REST_Request $request): array
{
    $raw_filter = $request->get_param('webx_filter');
    $raw_sort = $request->get_param('webx_sort');
    if ($raw_filter === null && $raw_sort === null) return $args;
    if (!current_user_can('edit_posts')) return $args;
    $post_type = $args['post_type'] ?? '';
    if (!is_string($post_type) || $post_type === '') return $args;
    $acf = webx_lf_fields($post_type);

    $filters = is_string($raw_filter) ? json_decode($raw_filter, true) : $raw_filter;
    foreach (is_array($filters) ? $filters : [] as $f) {
        if (!is_array($f) || !isset($f['field'], $f['op']) || !array_key_exists('value', $f)) continue;
        $value = $f['value'];
        if (is_array($value) || is_object($value) || $value === null) continue;
        $value = is_bool($value) ? ($value ? '1' : '0') : (string) $value;
        $field = (string) $f['field'];
        $op = (string) $f['op'];
        if ($field === 'title') {
            if (in_array($op, ['eq', 'ne', 'contains'], true)) $args['webx_title'][] = [$op, $value]; // see posts_where below
            continue;
        }
        if (!isset($acf[$field])) continue; // not a field of this type: ignored, as WordPress always did
        $compare = ['eq' => '=', 'ne' => '!=', 'contains' => 'LIKE', 'gte' => '>=', 'lte' => '<='][$op] ?? null;
        if ($compare === null) continue;
        $clause = ['key' => $field, 'value' => $value, 'compare' => $compare];
        if ($acf[$field] === 'number' && $op !== 'contains' && is_numeric($value)) $clause['type'] = 'NUMERIC';
        // a post without the field is "not equal" too
        if ($op === 'ne') $clause = ['relation' => 'OR', $clause, ['key' => $field, 'compare' => 'NOT EXISTS']];
        $args['meta_query'][] = $clause;
    }

    if (is_string($raw_sort) && preg_match('/^([A-Za-z0-9_]+):(asc|desc)$/i', $raw_sort, $m)) {
        $field = $m[1];
        $dir = strtoupper($m[2]);
        if ($field === 'title') {
            $args['orderby'] = 'title';
            $args['order'] = $dir;
        } elseif (isset($acf[$field])) {
            $args['meta_key'] = $field;
            $args['orderby'] = $acf[$field] === 'number' ? 'meta_value_num' : 'meta_value';
            $args['order'] = $dir;
        }
    }
    return $args;
}

// The title is a column, not meta: eq, ne and contains on it, from the webx_title query var set above.
add_filter('posts_where', function (string $where, WP_Query $query) {
    $conditions = $query->get('webx_title');
    if (!is_array($conditions) || !$conditions) return $where;
    global $wpdb;
    foreach ($conditions as $c) {
        if (!is_array($c) || count($c) !== 2) continue;
        [$op, $value] = $c;
        if ($op === 'eq') $where .= $wpdb->prepare(" AND {$wpdb->posts}.post_title = %s", $value);
        elseif ($op === 'ne') $where .= $wpdb->prepare(" AND {$wpdb->posts}.post_title <> %s", $value);
        elseif ($op === 'contains') $where .= $wpdb->prepare(" AND {$wpdb->posts}.post_title LIKE %s", '%' . $wpdb->esc_like($value) . '%');
    }
    return $where;
}, 10, 2);

add_action('rest_api_init', function () {
    // the types WebX governs (custom-role-enforcement.php), the ones Studio's adapter lists
    if (!function_exists('webx_crp_governed_post_types')) return;
    foreach (webx_crp_governed_post_types() as $type) {
        add_filter("rest_{$type}_query", 'webx_lf_apply', 10, 2);
    }
});
