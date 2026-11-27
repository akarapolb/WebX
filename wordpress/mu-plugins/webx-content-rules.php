<?php
// A content rule WebX's engine contract asks of every engine (docs/engine-contract.md section 8) that WordPress does
// not keep by itself: a draft may be saved incomplete, but an entry missing a required field is never published. The
// adapter declares `title` required for every type it manages (webx-studio/lib/cms/wordpress.ts, listContentTypes), so
// publishing a post (status publish or future) through REST with an empty title, or emptying the title of a published
// post, is refused with 400. Any other edit goes through as before, so an older untitled post can still be changed.
//
// Found by the engine conformance suite's WordPress run (2026-11-27), where a post with no title was published.
// Only REST writes to the types WebX governs are checked (Studio's and the API's); public form submissions are made
// with wp_insert_post() and a title of their own (public-forms-api.php), and wp-admin is left as WordPress has it.

function webx_rules_is_publishing(string $status): bool
{
    return in_array($status, ['publish', 'future'], true);
}

/** rest_pre_insert_{type}: $prepared holds only what the request sets, so an absent title or status is the post's own. */
function webx_rules_title_required($prepared, WP_REST_Request $request)
{
    if (is_wp_error($prepared)) return $prepared;
    $existing = !empty($prepared->ID) ? get_post((int) $prepared->ID) : null;
    $title = property_exists($prepared, 'post_title') ? (string) $prepared->post_title : ($existing ? (string) $existing->post_title : '');
    $status = property_exists($prepared, 'post_status') ? (string) $prepared->post_status : ($existing ? (string) $existing->post_status : 'draft');
    if (!webx_rules_is_publishing($status)) return $prepared;
    // publishing now, or changing the title of what is published
    if (!$request->has_param('status') && !$request->has_param('title')) return $prepared;
    if (trim(wp_strip_all_tags($title)) === '') {
        return new WP_Error('webx_title_required', 'A title is required to publish this entry', ['status' => 400]);
    }
    return $prepared;
}

add_action('rest_api_init', function () {
    // the types WebX governs (custom-role-enforcement.php), the ones Studio's adapter manages
    if (!function_exists('webx_crp_governed_post_types')) return;
    foreach (webx_crp_governed_post_types() as $type) {
        add_filter("rest_pre_insert_{$type}", 'webx_rules_title_required', 10, 2);
    }
});
