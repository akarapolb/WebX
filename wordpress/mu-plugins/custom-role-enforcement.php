<?php
// WordPress-side backstop for WebX's custom-role permission builder — the
// same reasoning wtenant-taxonomy.php gives for tenant scoping applies here:
// webx-studio's governance.ts already enforces custom-role permissions for
// every write that goes THROUGH it, but someone with a valid Application
// Password hitting this REST API directly bypasses that entirely. This
// plugin closes that gap the same way strapi-cms/src/index.ts's own write
// hook closes it for direct-to-Strapi access.
//
// Custom roles are a WebX/Strapi-side concept (Tenant.customRoleAssignments
// + the custom-role content type) — nothing in WordPress's own user/capability
// system reflects them at all, so this can't be resolved locally. It calls
// out to Strapi's secret-protected /api/internal/custom-role-permissions
// endpoint on every governed write, cached for 15s via a transient (not a
// static PHP variable — PHP's per-request interpreter model means nothing
// survives between requests except what's actually persisted).
//
// Fails OPEN on a lookup error (Strapi unreachable, bad response): this hook
// fires for webx-studio's OWN WordPress traffic too (lib/cms/wordpress.ts
// carries no bypass header — adding one to skip this check would just be a
// spoofable hole, not a real optimization), so failing closed here would
// make an outage of this backstop stricter than the primary enforcement
// layer, which already fails open the same way (see getCustomRoles() in
// strapi-cms's own resolver).
//
// Deployment note: adding/changing this file needs a manual step on an
// EXISTING deployment beyond an image rebuild — see DEPLOY.md's WordPress
// engine checklist item and the comment on the Dockerfile's COPY line.

function webx_crp_post_type_uid_map(): array
{
    // Mirrors POST_TYPES in webx-studio/lib/cms/wordpress.ts (inverted:
    // rest_base -> uid). No shared package between PHP and TS — kept in
    // sync by hand, same as SCOPED already is between strapi-cms/src/index.ts
    // and webx-studio/lib/cms/governance.ts.
    return [
        'posts' => 'wp:post',
        'pages' => 'wp:page',
        'service' => 'wp:service',
        'publication' => 'wp:publication',
        'faq' => 'wp:faq',
        'resource' => 'wp:resource',
        'timeline-event' => 'wp:timeline',
        'mission-item' => 'wp:mission',
        'org-unit' => 'wp:org-unit',
        'document' => 'wp:document',
    ];
}

/** Fetches (and caches) the acting user's custom-role permissions for one
 * content type from Strapi. Returns null on any failure or "no custom role
 * assigned" — both mean "don't intervene", the caller treats them alike. */
function webx_crp_fetch(string $email, string $uid): ?array
{
    $cache_key = 'webx_crp_' . md5($email . '|' . $uid);
    $cached = get_transient($cache_key);
    if ($cached !== false) return $cached;

    $base = rtrim((string) getenv('STRAPI_INTERNAL_URL'), '/');
    $secret = getenv('WEBX_INTERNAL_SECRET');
    if (!$base || !$secret) {
        error_log('[webx-custom-role] STRAPI_INTERNAL_URL/WEBX_INTERNAL_SECRET not configured — failing open');
        return null;
    }

    $url = $base . '/api/internal/custom-role-permissions?email=' . rawurlencode($email) . '&uid=' . rawurlencode($uid);
    $resp = wp_remote_get($url, ['timeout' => 3, 'headers' => ['X-Internal-Secret' => $secret]]);
    if (is_wp_error($resp)) {
        error_log('[webx-custom-role] internal lookup failed: ' . $resp->get_error_message());
        return null;
    }
    if (wp_remote_retrieve_response_code($resp) !== 200) {
        error_log('[webx-custom-role] internal lookup returned HTTP ' . wp_remote_retrieve_response_code($resp));
        return null;
    }
    $data = json_decode(wp_remote_retrieve_body($resp), true);
    if (!is_array($data)) return null;

    set_transient($cache_key, $data, 15); // matches the 15s TTL used by every other custom-role cache in this system
    return $data;
}

/** The tenant a post currently belongs to, via its own wtenant term — same
 * source of truth governance.ts's tenantGuard() reads for WordPress content. */
function webx_crp_post_tenant_key(int $post_id): ?string
{
    $terms = wp_get_post_terms($post_id, 'wtenant', ['fields' => 'slugs']);
    if (is_wp_error($terms) || empty($terms)) return null;
    return $terms[0];
}

/** The tenant a NEW post is being submitted into, via the request's own
 * submitted wtenant term id — there's no existing post to read it from yet. */
function webx_crp_submitted_tenant_key(WP_REST_Request $request): ?string
{
    $wtenant = $request->get_param('wtenant');
    $term_id = is_array($wtenant) ? ($wtenant[0] ?? null) : $wtenant;
    if (!$term_id) return null;
    $term = get_term((int) $term_id, 'wtenant');
    return ($term && !is_wp_error($term)) ? $term->slug : null;
}

// Hook choice note: rest_pre_dispatch looked like the natural single-choke-
// point mirror of strapi-cms's own documents.use() hook, and its own core
// docblock says returning a non-empty value "hijacks" the request — but
// empirically, on this WordPress version, a WP_Error returned from it does
// NOT actually stop the write from being processed (confirmed live: an
// unconditional diagnostic block still let a DELETE through with a 200).
// rest_request_before_callbacks (WP_REST_Server::respond_to_request(), fires
// after routing/permission_callback, right before the route's own callback)
// explicitly checks is_wp_error($response) and skips calling the handler
// when true — the actual reliable interception point in this WP version.
add_filter('rest_request_before_callbacks', function ($response, $handler, WP_REST_Request $request) {
    if (is_wp_error($response)) return $response; // an earlier check already rejected this — don't override it

    // Reads are never enforced anywhere in this system ("view" is stored on
    // a custom role but deliberately not server-enforced yet) — skip the
    // large majority of traffic before doing any route parsing at all.
    $method = $request->get_method();
    if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return $response;

    $route = $request->get_route(); // e.g. "/wp/v2/service/123" or "/wp/v2/posts"
    if (!preg_match('#^/wp/v2/([a-z-]+)(?:/(\d+))?/?$#', $route, $m)) return $response;
    $map = webx_crp_post_type_uid_map();
    if (!isset($map[$m[1]])) return $response; // media, users, comments, wtenant terms, etc. — never governed by custom roles
    $uid = $map[$m[1]];
    $post_id = isset($m[2]) ? (int) $m[2] : null;

    $user = wp_get_current_user();
    if (!$user || !$user->exists() || empty($user->user_email)) return $response; // anonymous/invalid — WP's own auth handles this
    $email = strtolower($user->user_email);

    $perms = webx_crp_fetch($email, $uid);
    if ($perms === null || empty($perms['hasCustomRole'])) return $response; // no custom role in play, or lookup unavailable — don't intervene

    // Determine the action + target tenant.
    if ($method === 'DELETE') {
        $action = 'delete';
        $target_tenant = $post_id !== null ? webx_crp_post_tenant_key($post_id) : null;
    } elseif ($post_id === null) {
        $action = 'create';
        $target_tenant = webx_crp_submitted_tenant_key($request);
    } else {
        $existing = get_post($post_id);
        if (!$existing) return $response; // unknown id — let WP's own 404 handling take over
        $target_tenant = webx_crp_post_tenant_key($post_id);
        $incoming_status = $request->get_param('status');
        $was_published = $existing->post_status === 'publish';
        // A status transition into OR out of "publish" needs the publish
        // flag — one flag covers both directions, matching the same
        // convention used everywhere else in this system (there's no
        // separate "unpublish" permission).
        $action = ($incoming_status !== null && ($incoming_status === 'publish') !== $was_published) ? 'publish' : 'update';
    }

    if ($action === 'create' && $target_tenant === null) {
        return new WP_Error('webx_forbidden', 'A tenant scope is required for this content type.', ['status' => 403]);
    }
    if ($target_tenant !== null && $target_tenant !== $perms['tenantKey']) {
        return new WP_Error('webx_forbidden', 'Cross-tenant operation not permitted', ['status' => 403]);
    }
    if (empty($perms[$action])) {
        return new WP_Error('webx_forbidden', 'This custom role does not permit this action on this content type.', ['status' => 403]);
    }

    // Allowed — strip any hidden/readonly fields before letting the request
    // proceed to WP's own normal dispatch (including its native
    // permission_callback, which still runs after this filter). ACF fields
    // ship nested under acf:{...} on the wire, so check both locations for
    // each forbidden field name.
    if (in_array($action, ['create', 'update'], true)) {
        $forbidden = array_merge($perms['hidden'] ?? [], $perms['readonly'] ?? []);
        foreach ($forbidden as $field) {
            unset($request[$field]);
            $acf = $request->get_param('acf');
            if (is_array($acf) && array_key_exists($field, $acf)) {
                unset($acf[$field]);
                $request->set_param('acf', $acf);
            }
        }
    }

    return $response; // unchanged (null) — proceed to the route's own callback
}, 10, 3);
