<?php
// WordPress-side backstop for two related things webx-studio's governance.ts
// already enforces for every write that goes THROUGH it, but which someone
// with a valid Application Password hitting this REST API directly bypasses
// entirely: (1) custom-role permissions, and (2) plain tenant scoping — a
// native WP editor/administrator account provisioned for one tenant writing
// content into ANOTHER tenant's wtenant scope. This plugin closes both the
// same way strapi-cms/src/index.ts's own write hook closes them for
// direct-to-Strapi access.
//
// Both are WebX/Strapi-side concepts — nothing in WordPress's own
// user/capability system reflects a "tenant" or a "custom role" at all, so
// neither can be resolved locally. It calls out to Strapi's secret-protected
// /api/internal/custom-role-permissions endpoint on every governed write,
// cached for 15s via a transient (not a static PHP variable — PHP's
// per-request interpreter model means nothing survives between requests
// except what's actually persisted). That endpoint's response already
// carries a bare tenantKey for ANY WebX-provisioned admin (Tenant.adminEmails
// membership), custom role or not — this plugin previously only read it when
// hasCustomRole was true; it now uses it unconditionally for the tenant
// check, and only gates on the finer-grained create/update/delete/publish/
// hidden/readonly permissions when hasCustomRole is true (a plain editor's
// native WP capabilities are the only action-level gate they've ever had).
//
// Reads are deliberately still untouched (see the method filter below) —
// WordPress content is fetched unauthenticated by the public site itself;
// tenant-scoping reads here would break that, not just close a gap.
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
    //
    // poll/complaint/contact-message/job/application/breaking-news were
    // added here in a full-codebase audit (2026-09-12) — they're registered
    // in public-forms-post-types.php and already known to POST_TYPES in
    // wordpress.ts, but were never added to this map, so neither this map
    // nor webx_crp_governed_post_types() below ever recognized them: they
    // fell through both the cross-tenant write filter and the read-scoping
    // filter entirely. Any WP user with ordinary edit_others_posts (any
    // Editor/Administrator, regardless of which tenant they were
    // provisioned for) could read/write every tenant's complaints/
    // applications/contact-messages (PII-bearing) and publish a
    // breaking-news alert onto a tenant they don't own.
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
        'poll' => 'wp:poll',
        'complaint' => 'wp:complaint',
        'contact-message' => 'wp:contact-message',
        'job' => 'wp:job',
        'application' => 'wp:application',
        'breaking-news' => 'wp:breaking-news',
    ];
}

/** Same governed set as webx_crp_post_type_uid_map(), but keyed by the WP
 * post_type slug rather than the REST rest_base — the two differ for
 * 'post'/'posts', 'page'/'pages', and 'contact_message'/'contact-message'
 * and 'breaking_news'/'breaking-news' (WP post_type slugs use underscores,
 * their rest_base overrides use hyphens); every other type's post_type and
 * rest_base are identical strings. See webx_crp_post_type_uid_map()'s
 * comment for why the six public-forms types below were added. */
function webx_crp_governed_post_types(): array
{
    return [
        'post', 'page', 'service', 'publication', 'faq', 'resource', 'timeline-event', 'mission-item', 'org-unit', 'document',
        'poll', 'complaint', 'contact_message', 'job', 'application', 'breaking_news',
    ];
}

/** The inverse of the three post_type/rest_base spellings that actually
 * differ (see webx_crp_governed_post_types()'s own comment) — needed by the
 * map_meta_cap/save_post backstop below, which only has the post_type slug
 * (from a WP_Post) to work with, not the REST route's rest_base. */
function webx_crp_post_type_to_rest_base(string $post_type): string
{
    $overrides = ['post' => 'posts', 'page' => 'pages', 'contact_message' => 'contact-message', 'breaking_news' => 'breaking-news'];
    return $overrides[$post_type] ?? $post_type;
}

/** Fetches (and caches) the acting user's tenant + (if any) custom-role
 * permissions for one content type from Strapi. Returns null only on a
 * lookup failure (network/HTTP/JSON error) — that and "not a WebX-provisioned
 * admin of any tenant" (tenantKey === null in a successful response) both
 * mean "don't intervene", but the caller distinguishes them from "resolved
 * to a tenant, no custom role" (tenantKey set, hasCustomRole false), which
 * now still needs the tenant-scoping check applied. */
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
    if ($perms === null) return $response; // lookup unavailable — fail open, same posture as every other resolver in this system
    $caller_tenant = $perms['tenantKey'] ?? null;
    if ($caller_tenant === null) return $response; // not a WebX-provisioned admin of any tenant — nothing to scope against
    $has_custom_role = !empty($perms['hasCustomRole']);

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

    // Tenant scoping applies to EVERY WebX-provisioned admin, custom role or
    // not — this is the general backstop, closing the gap where a plain
    // per-tenant editor account could otherwise write into another tenant's
    // content by hitting this REST API directly instead of going through
    // webx-studio. Requiring a tenant on create (rather than only rejecting
    // an explicit mismatch) matters here specifically: without it, a
    // tenant-less create followed by a later update would never trip the
    // mismatch check at all (an update's target_tenant comes from the
    // existing post's OWN term, which would still be null).
    if ($action === 'create' && $target_tenant === null) {
        return new WP_Error('webx_forbidden', 'A tenant scope is required for this content type.', ['status' => 403]);
    }
    if ($target_tenant !== null && $target_tenant !== $caller_tenant) {
        return new WP_Error('webx_forbidden', 'Cross-tenant operation not permitted', ['status' => 403]);
    }

    // Everything past this point is custom-role-specific — a plain
    // editor/administrator's native WP capabilities are the only
    // action-level gate they've ever had, and $perms carries no
    // create/update/delete/publish/hidden/readonly keys at all when
    // hasCustomRole is false.
    if (!$has_custom_role) return $response;

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

// --- non-REST write backstop (classic editor / Quick Edit / bulk edit / WP-CLI) ---
// The filter above only fires for rest_request_before_callbacks, i.e. only
// for /wp/v2/* REST writes. custom-post-types.php explicitly routes
// 'org-unit', 'mission-item', 'timeline-event', and 'document' to the
// classic editor (a documented Gutenberg-bug workaround), and Quick
// Edit/bulk edit call wp_update_post() straight from admin-ajax.php's
// inline-save handler — none of that goes through the REST route at all,
// so a WebX-provisioned tenant editor logged into wp-admin directly could
// edit, publish, or delete another tenant's content through either path
// with zero enforcement. Found in a full-codebase audit (2026-09-12).
//
// map_meta_cap is WordPress's own single choke point for "can this user
// edit/delete/publish THIS post" — current_user_can('edit_post', $id) (and
// delete_post/publish_post) resolves through it everywhere: the classic
// editor's post.php save handler checks it before accepting the submitted
// form, Quick Edit/bulk edit's ajax handler checks it before calling
// wp_update_post(), and even the REST API's own default permission_callback
// for /wp/v2/<type>/<id> checks it before our custom filter above ever
// runs. Denying here rejects the action BEFORE anything is written, the
// same posture as the REST filter — no revert-after-the-fact needed for
// edit/delete/publish on an EXISTING post.
add_filter('map_meta_cap', function (array $caps, string $cap, int $user_id, array $args) {
    if (!in_array($cap, ['edit_post', 'delete_post', 'publish_post'], true)) return $caps;
    $post_id = (int) ($args[0] ?? 0);
    if (!$post_id) return $caps; // no post id yet (e.g. the "Add New" screen) — nothing to scope against here, see the save_post hook below for create
    $post = get_post($post_id);
    if (!$post || !in_array($post->post_type, webx_crp_governed_post_types(), true)) return $caps;

    $user = get_userdata($user_id);
    if (!$user || empty($user->user_email)) return $caps;
    $email = strtolower($user->user_email);
    $uid = webx_crp_post_type_uid_map()[webx_crp_post_type_to_rest_base($post->post_type)] ?? null;
    if (!$uid) return $caps;

    $perms = webx_crp_fetch($email, $uid);
    if ($perms === null) return $caps; // lookup unavailable — fail open, same posture as the REST filter
    $caller_tenant = $perms['tenantKey'] ?? null;
    if ($caller_tenant === null) return $caps; // not a WebX-provisioned admin of any tenant

    $target_tenant = webx_crp_post_tenant_key($post_id);
    if ($target_tenant !== null && $target_tenant !== $caller_tenant) {
        return ['do_not_allow'];
    }

    if (!empty($perms['hasCustomRole'])) {
        $action = $cap === 'delete_post' ? 'delete' : ($cap === 'publish_post' ? 'publish' : 'update');
        if (empty($perms[$action])) return ['do_not_allow'];
    }
    return $caps;
}, 10, 4);

// map_meta_cap is checked by every UI-driven path (classic editor's
// post.php, Quick Edit/bulk edit's ajax handler, REST's own
// permission_callback) but NOT by WP-CLI's `wp post update`/`wp post
// create` — confirmed live: `wp post update <id> --user=<tenant-editor>`
// on another tenant's post went straight through with zero enforcement,
// even with --user set to a real WebX-provisioned account, because these
// commands call wp_update_post()/wp_insert_post() directly without ever
// checking current_user_can(). That's exactly the third path H13 named
// (classic editor and Quick Edit are the other two, both closed by
// map_meta_cap above). Since there's no reliable pre-write veto point that
// fires for a raw wp_update_post()/wp_insert_post() call, this backstop
// works post-hoc instead: snapshot the pre-write state, then revert in
// save_post if the write turns out to have been cross-tenant.
//
// pre_post_update fires only for updates (not inserts), with the OLD row
// still in the database — the only point where "what was this post's
// tenant/content BEFORE this write" is still readable.
add_action('pre_post_update', function (int $post_id) {
    $existing = get_post($post_id);
    if (!$existing) return;
    set_transient('webx_crp_snapshot_' . $post_id, [
        'tenant' => webx_crp_post_tenant_key($post_id) ?? '',
        'post_title' => $existing->post_title,
        'post_content' => $existing->post_content,
        'post_excerpt' => $existing->post_excerpt,
        'post_status' => $existing->post_status,
    ], MINUTE_IN_SECONDS);
}, 10, 1);

add_action('save_post', function (int $post_id, WP_Post $post, bool $update) {
    static $reverting = [];
    if (!empty($reverting[$post_id])) return; // this save_post firing is our OWN revert call below — don't re-enter
    if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) return;
    if (!in_array($post->post_type, webx_crp_governed_post_types(), true)) return;

    $uid = webx_crp_post_type_uid_map()[webx_crp_post_type_to_rest_base($post->post_type)] ?? null;
    if (!$uid) return;

    $user = wp_get_current_user();
    if (!$user || !$user->exists() || empty($user->user_email)) return; // no WebX-provisioned identity in play (e.g. WP-CLI with no --user at all) — out of this backstop's scope, same as every other resolver here
    $email = strtolower($user->user_email);

    $perms = webx_crp_fetch($email, $uid);
    if ($perms === null) return; // fail open, same posture as the REST filter
    $caller_tenant = $perms['tenantKey'] ?? null;
    if ($caller_tenant === null) return;

    if (!$update) {
        // New post: no prior legitimate state to preserve, so a bad tenant
        // (missing, or already reassigned away from the creator's own via
        // the classic editor's taxonomy meta box) is a clean delete — same
        // "tenant required on create" rule as the REST filter's create path.
        $target_tenant = webx_crp_post_tenant_key($post_id);
        if ($target_tenant === null || $target_tenant !== $caller_tenant) {
            error_log("[webx-custom-role] deleted post $post_id ($post->post_type) — created by $email outside their own tenant via a non-REST path");
            $reverting[$post_id] = true;
            wp_delete_post($post_id, true);
            $reverting[$post_id] = false;
        }
        return;
    }

    // Update: check against the tenant the post belonged to BEFORE this
    // write (the pre_post_update snapshot), not its tenant now — an update
    // that both edits content AND reassigns the wtenant term to the
    // caller's own tenant would otherwise launder itself past a post-write
    // tenant check.
    $snapshot = get_transient('webx_crp_snapshot_' . $post_id);
    delete_transient('webx_crp_snapshot_' . $post_id);
    if (!is_array($snapshot)) return; // no snapshot (e.g. this hook was only just added) — nothing to compare against, fail open
    $prior_tenant = $snapshot['tenant'];
    if ($prior_tenant === '' || $prior_tenant === $caller_tenant) return; // untenanted, or already the caller's own — fine

    error_log("[webx-custom-role] reverted update to post $post_id ($post->post_type) by $email — cross-tenant via non-REST path");
    $reverting[$post_id] = true;
    wp_update_post([
        'ID' => $post_id,
        'post_title' => $snapshot['post_title'],
        'post_content' => $snapshot['post_content'],
        'post_excerpt' => $snapshot['post_excerpt'],
        'post_status' => $snapshot['post_status'],
    ]);
    $term = get_term_by('slug', $prior_tenant, 'wtenant');
    if ($term && !is_wp_error($term)) wp_set_post_terms($post_id, [$term->term_id], 'wtenant');
    $reverting[$post_id] = false;
}, 20, 3); // priority 20: run after ACF/taxonomy meta boxes (default priority 10) have saved whatever was submitted, so the create-path check above sees the tenant that was actually submitted

// --- wp-admin list-screen tenant scoping --------------------------------
// The REST write-side check above deliberately leaves reads untouched (see
// its own header comment): the public site fetches PUBLISHED content
// unauthenticated, and tenant-scoping that would just break it. wp-admin's
// list screens are a different audience, though — they also surface
// draft/pending posts, which the public site never sees at all. Without
// this, any WebX-provisioned tenant editor who logs into wp-admin directly
// sees every OTHER tenant's unpublished drafts mixed into every governed
// post type's list table (Posts, Pages, Services, Publications, …) — a real
// pre-publication confidentiality gap, not just a tidiness one. Writes to
// that foreign content already 403 via the filter above; this closes the
// matching read side, scoped to wp-admin screens only (is_admin() is false
// for REST requests, so the public site and webx-studio's own REST reads
// are both untouched).
add_action('pre_get_posts', function (WP_Query $query) {
    if (!is_admin() || !$query->is_main_query()) return;

    $post_type = $query->get('post_type');
    if (is_array($post_type)) return; // multi-type queries (e.g. admin-wide search) — leave alone
    if ($post_type === '' || $post_type === false) $post_type = 'post'; // edit.php's own default
    if (!in_array($post_type, webx_crp_governed_post_types(), true)) return;

    $user = wp_get_current_user();
    if (!$user || !$user->exists() || empty($user->user_email)) return;
    $email = strtolower($user->user_email);

    // The uid only selects which content type's custom-role PERMISSIONS come
    // back (create/update/hidden/…), which this read-side check doesn't use
    // — tenantKey itself is resolved from the admin's email alone
    // (Tenant.adminEmails), the same regardless of uid. 'wp:page' is just a
    // fixed, always-registered choice to satisfy the function's signature.
    $perms = webx_crp_fetch($email, 'wp:page');
    if ($perms === null) return; // lookup unavailable — fail open, same posture as the write-side check
    $tenant_key = $perms['tenantKey'] ?? null;
    if ($tenant_key === null) return; // not a WebX-provisioned admin (e.g. a genuine WP super-admin) — nothing to scope

    $term = get_term_by('slug', $tenant_key, 'wtenant');
    if (!$term || is_wp_error($term)) {
        // Tenant resolved but its wtenant term doesn't exist — a
        // data-integrity state, not a transient lookup outage, so this one
        // fails CLOSED (show nothing) rather than open (show everything).
        $query->set('post__in', [0]);
        return;
    }

    $tax_query = $query->get('tax_query');
    $tax_query = is_array($tax_query) ? $tax_query : [];
    $tax_query[] = ['taxonomy' => 'wtenant', 'field' => 'term_id', 'terms' => [$term->term_id]];
    $query->set('tax_query', $tax_query);
}, 20);
