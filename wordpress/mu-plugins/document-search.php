<?php
// PDF/DOCX/XLSX full-text search for WordPress documents (TOR gap audit —
// see acf-fields.php's field_doc_content_text comment: WordPress's native
// search only matches the post_title/post_excerpt/post_content COLUMNS,
// never the text extracted from an uploaded PDF/DOCX/XLSX file — unlike
// Strapi's ebook/download content types, which already index this via
// strapi-cms/src/utils/extract-text.ts. `content_text` (an ACF field on the
// `document` post type, populated by strapi-cms/scripts/index-wp-documents.mjs)
// is now ALSO matched, broadening — never replacing — the existing title/
// excerpt/content match.
//
// Scoped to exactly the same /wp/v2/search endpoint wtenant-taxonomy.php's
// own rest_post_search_query hook already extends (the one this project's
// site-search boxes actually call, see lib/useSiteSearch.ts) rather than
// every WP_Query sitewide, via a private query var only that hook sets.

add_filter('rest_post_search_query', function ($args) {
    if (!empty($args['s'])) {
        $args['webx_content_text_search'] = $args['s'];
    }
    return $args;
});

add_filter('posts_search', function ($search, $query) {
    $term = $query->get('webx_content_text_search');
    if (!$term || !$search) return $search;
    global $wpdb;
    $like = '%' . $wpdb->esc_like($term) . '%';
    $extra = $wpdb->prepare(
        "OR (EXISTS (SELECT 1 FROM {$wpdb->postmeta} pm WHERE pm.post_id = {$wpdb->posts}.ID AND pm.meta_key = 'content_text' AND pm.meta_value LIKE %s))",
        $like
    );
    // Found live: an earlier version of this regex grabbed from the first
    // "(" all the way to the LAST ")" in $search — which also swallowed a
    // TRAILING, unrelated clause core appends to the same string (a
    // post_password check), so the EXISTS addition ended up OR'd onto THAT
    // clause instead of the actual title/excerpt/content match — a document
    // whose only match was its content_text still came back empty, since
    // the real search group was untouched. Targeted fix: match each
    // "{posts_table}.post_content LIKE '...'）" occurrence specifically
    // (the last column WP's own per-term group always checks — one
    // occurrence per search term, all still inside that term's own
    // parens) and insert the EXISTS clause right after each one's closing
    // paren, leaving everything else in $search (including that trailing
    // clause) completely untouched.
    $pattern = '/(' . preg_quote($wpdb->posts, '/') . '\.post_content\s+LIKE\s+\'[^\']*\'\))/';
    $count = 0;
    $new = preg_replace($pattern, '$1 ' . $extra, $search, -1, $count);
    if ($count > 0) $search = $new;
    return $search;
}, 10, 2);
