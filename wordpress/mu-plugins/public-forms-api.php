<?php
// Phase 7 — the `webx/v1` REST namespace: every public WRITE for the CPTs
// registered in public-forms-post-types.php (poll vote, complaint/contact-
// message/application submit) plus the WP-native captcha primitive they all
// share. A brand-new namespace rather than core's /wp/v2/<posttype> because
// none of core WP's REST write path can do what these forms need — captcha
// verification, server-generated reference numbers, PII encryption, file
// attachment, and email side-effects — and opening core's own write
// endpoint to the Public role would mean granting anonymous REST write
// capability on these post types, the exact attack-surface expansion this
// project's own JobApplicationForm.tsx comment already flagged as a reason
// to avoid (see that file's resume-upload history). Every route here runs
// entirely in trusted PHP instead — wp_insert_post()/media_handle_sideload()
// called directly, no REST capability grant needed.
//
// Depends on pii-crypto.php (encryption) and smtp-mail.php (email delivery)
// — both other Phase 7 mu-plugins, loaded automatically alongside this one
// since WordPress loads every file in mu-plugins/ regardless of name.

require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';

// ---------------------------------------------------------------------------
// Captcha — WP-native replacement for strapi-cms/src/utils/captcha.ts.
// Transients (DB/object-cache-backed) instead of an in-memory Map, since
// that's the WP-native primitive that actually survives PHP-FPM/mod_php's
// per-request process model. Same question format, same single-use/
// 5-minute-TTL semantics, so public-site/lib/useCaptcha.ts's consumers need
// only a base-URL change, not a rewrite.
// ---------------------------------------------------------------------------
function webx_issue_captcha(): array {
    $a = wp_rand(1, 9);
    $b = wp_rand(1, 9);
    $id = wp_generate_password(18, false);
    set_transient('webx_captcha_' . $id, $a + $b, 5 * MINUTE_IN_SECONDS);
    return ['id' => $id, 'question' => "$a + $b = ?"];
}

function webx_verify_captcha(WP_REST_Request $req): bool {
    $id = (string) $req->get_param('captchaId');
    $answer = $req->get_param('captchaAnswer');
    if (!$id) return false;
    $key = 'webx_captcha_' . sanitize_text_field($id);
    $expected = get_transient($key);
    if ($expected === false) return false;
    delete_transient($key); // single-use, matches captcha.ts's verifyCaptcha()
    return (int) $answer === (int) $expected;
}

function webx_captcha_error(): WP_Error {
    return new WP_Error('captcha_error', 'คำตอบยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่', ['status' => 400]);
}

// ---------------------------------------------------------------------------
// Rate limiting — these public forms had none at all: a single-digit captcha
// plus wp_mail() to an attacker-supplied address on every submit is directly
// scriptable into a content-table flood or an email bomb against a third
// party. Found in a full-codebase audit (2026-09-12).
//
// Sliding window per (bucket, ip), same shape as strapi-cms's own
// middlewares/rate-limit.ts, but backed by a transient (WP's own DB/object-
// cache-backed primitive) instead of an in-process Map — mod_php has no
// shared memory across requests the way a long-lived Node process does,
// which is exactly why webx_issue_captcha() above already uses a transient
// for the same reason.
//
// IP resolution deliberately does NOT trust X-Forwarded-For unless an
// operator has explicitly confirmed a real reverse proxy sits in front
// (WEBX_TRUST_PROXY=true) — trusting a client-supplied header by default
// would let anyone reset their own bucket on every request just by sending
// a different X-Forwarded-For value, defeating the limiter entirely. Same
// reasoning as the TRUST_PROXY fix already applied on the Strapi side.
function webx_client_ip(): string {
    if (getenv('WEBX_TRUST_PROXY') === 'true') {
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($xff) return trim(explode(',', $xff)[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function webx_rate_limit(string $bucket, int $max, int $window_seconds): bool {
    $key = 'webx_rl_' . md5($bucket . '|' . webx_client_ip());
    $now = time();
    $hits = get_transient($key);
    if (!is_array($hits)) $hits = [];
    $cutoff = $now - $window_seconds;
    $hits = array_values(array_filter($hits, function ($t) use ($cutoff) { return $t >= $cutoff; }));
    if (count($hits) >= $max) return false;
    $hits[] = $now;
    set_transient($key, $hits, $window_seconds);
    return true;
}

function webx_rate_limit_error(): WP_Error {
    return new WP_Error('rate_limited', 'มีการส่งคำขอถี่เกินไป กรุณาลองใหม่อีกครั้งในภายหลัง', ['status' => 429]);
}

// ---------------------------------------------------------------------------
// Per-tenant staff-notification email — Settings → WebX Forms (wp-admin).
// No existing Settings API usage anywhere in this codebase before this — a
// deliberately small, self-contained screen (one JSON-map textarea, same
// "JSON in a textarea" convention acf-fields.php's group_page_layout already
// established) rather than per-tenant fields, since the tenant list isn't
// fixed. Falls back to COMPLAINT_NOTIFY_EMAIL (the old Strapi-era env var
// name, kept for continuity) when a tenant has no entry of its own.
// ---------------------------------------------------------------------------
define('WEBX_NOTIFY_OPTION', 'webx_tenant_notify_emails');

add_action('admin_menu', function () {
    add_options_page('WebX Forms', 'WebX Forms', 'manage_options', 'webx-forms', 'webx_forms_settings_page');
});
add_action('admin_init', function () {
    register_setting('webx_forms', WEBX_NOTIFY_OPTION, [
        'type' => 'string', 'default' => '{}',
        'sanitize_callback' => function ($raw) {
            $decoded = json_decode((string) $raw, true);
            if (!is_array($decoded)) return '{}';
            $clean = [];
            foreach ($decoded as $tenant => $email) {
                $email = sanitize_email((string) $email);
                if ($email) $clean[sanitize_key((string) $tenant)] = $email;
            }
            return wp_json_encode($clean);
        },
    ]);
});
function webx_forms_settings_page() {
    if (!current_user_can('manage_options')) return; ?>
    <div class="wrap">
        <h1>WebX Forms — Notification Emails</h1>
        <p>One JSON object mapping tenant key → staff notification email address for new complaints. A tenant with no entry here falls back to the <code>COMPLAINT_NOTIFY_EMAIL</code> environment variable, if set.</p>
        <form method="post" action="options.php">
            <?php settings_fields('webx_forms'); ?>
            <textarea name="<?php echo esc_attr(WEBX_NOTIFY_OPTION); ?>" rows="6" cols="60" style="font-family:monospace;"><?php echo esc_textarea(get_option(WEBX_NOTIFY_OPTION, '{}')); ?></textarea>
            <p><em>Example: <code>{"orst": "staff@orst.go.th", "royalsociety": "staff@royalsociety.go.th"}</code></em></p>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}
function webx_notify_email_for(string $tenant): ?string {
    $map = json_decode((string) get_option(WEBX_NOTIFY_OPTION, '{}'), true);
    if (is_array($map) && !empty($map[$tenant])) return $map[$tenant];
    $fallback = getenv('COMPLAINT_NOTIFY_EMAIL');
    return $fallback ?: null;
}

// ---------------------------------------------------------------------------
// Reference-number generation — deliberate behavior change from the old
// Strapi-era format. Strapi's genRef() hardcoded a "DGA-" prefix for every
// tenant regardless of who actually submitted (a generic-platform leftover);
// this derives the prefix from the tenant instead, so ORST/RoyalSociety
// citizens see reference numbers that actually name their own agency.
// Confirmed with the user before implementing — see Phase 7 plan.
// ---------------------------------------------------------------------------
function webx_gen_ref(string $tenant, string $kind): string {
    $prefix = $tenant === 'royalsociety' ? 'RS' : strtoupper($tenant); // RS / ORST
    $be = (int) date('Y') + 543;
    $n = str_pad((string) wp_rand(100000, 999999), 6, '0', STR_PAD_LEFT);
    return "{$prefix}-{$kind}-{$be}-{$n}";
}

// ---------------------------------------------------------------------------
// wtenant helpers — direct PHP calls (not a REST round-trip) since these
// run server-side already, inside the same process that would otherwise
// make that REST call.
// ---------------------------------------------------------------------------
function webx_wtenant_term_id(string $tenant): ?int {
    $term = get_term_by('slug', $tenant, 'wtenant');
    return $term ? (int) $term->term_id : null;
}
function webx_stamp_wtenant(int $post_id, string $tenant): void {
    $id = webx_wtenant_term_id($tenant);
    if ($id) wp_set_object_terms($post_id, [$id], 'wtenant');
}

// ---------------------------------------------------------------------------
// File upload — wraps core's media_handle_sideload() against the already-
// tenant-scoped WP media library (custom-post-types.php already registers
// wtenant on `attachment`). Runs entirely in trusted server PHP, so this
// carries none of the "granting Public REST upload capability" risk
// JobApplicationForm.tsx's own history already flagged — this is why resume
// upload can safely be added here where it couldn't be on the old Strapi
// public-upload path.
// ---------------------------------------------------------------------------
function webx_handle_upload(array $file, string $tenant, int $max_bytes = 5 * 1024 * 1024): ?array {
    if (!empty($file['error']) && $file['error'] !== UPLOAD_ERR_OK) return ['error' => 'อัปโหลดไฟล์ไม่สำเร็จ'];
    if (($file['size'] ?? 0) > $max_bytes) return ['error' => 'ไฟล์เกิน ' . round($max_bytes / 1024 / 1024) . 'MB'];
    $attach_id = media_handle_sideload($file, 0);
    if (is_wp_error($attach_id)) return ['error' => $attach_id->get_error_message()];
    webx_stamp_wtenant($attach_id, $tenant);
    return ['id' => $attach_id];
}

// ---------------------------------------------------------------------------
// Email notifications — mirrors strapi-cms's complaint/application
// lifecycle.ts content verbatim (same subject lines, same Thai copy), sent
// via wp_mail() instead of Strapi's email plugin. Errors are logged, never
// thrown — a failed notification must not fail the citizen's submission.
// ---------------------------------------------------------------------------
function webx_send_complaint_emails(string $tenant, string $ref, array $data, bool $anonymous): void {
    $notify = webx_notify_email_for($tenant);
    if ($notify) {
        $ok = wp_mail(
            $notify,
            "[ร้องเรียนใหม่] $ref — " . ($data['subject'] ?? ''),
            "มีเรื่องร้องเรียน/แจ้งเบาะแสใหม่\nเลขอ้างอิง: $ref\nประเภท: " . ($data['type'] ?? '-') .
            "\nหัวข้อ: " . ($data['subject'] ?? '-') . "\nผู้แจ้ง: " . ($anonymous ? 'ไม่ประสงค์ออกนาม' : ($data['name'] ?? '-') . ' / ' . ($data['email'] ?? '-'))
        );
        if (!$ok) error_log("[webx complaint] admin notify email not sent for $ref");
    }
    if (!$anonymous && !empty($data['email'])) {
        $ok = wp_mail(
            $data['email'],
            "รับเรื่องร้องเรียนแล้ว ($ref)",
            "เราได้รับเรื่องร้องเรียนของท่านแล้ว\nหมายเลขอ้างอิง: $ref\nหัวข้อ: " . ($data['subject'] ?? '-') .
            "\nติดตามสถานะได้ที่หน้า \"ติดตามเรื่องร้องเรียน\" ของเว็บไซต์"
        );
        if (!$ok) error_log("[webx complaint] acknowledgement email not sent for $ref (configure SMTP_HOST for production)");
    }
}
function webx_send_application_email(string $ref, array $data): void {
    if (empty($data['email'])) return;
    $ok = wp_mail(
        $data['email'],
        "รับใบสมัครงานแล้ว ($ref)",
        "ขอบคุณที่สมัครงาน\nหมายเลขอ้างอิง: $ref\nตำแหน่ง: " . ($data['position'] ?? '-') .
        "\nตรวจสอบสถานะได้ที่หน้า \"ตรวจสอบสถานะใบสมัคร\" ของเว็บไซต์"
    );
    if (!$ok) error_log("[webx application] confirmation email not sent for $ref (configure SMTP_HOST for production)");
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
add_action('rest_api_init', function () {

    register_rest_route('webx/v1', '/captcha', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function () {
            if (!webx_rate_limit('captcha', 20, 5 * MINUTE_IN_SECONDS)) return webx_rate_limit_error();
            return ['data' => webx_issue_captcha()];
        },
    ]);

    // Poll vote — no captcha (parity: the Strapi vote route this replaces
    // was never in captcha-guard.ts's GUARDED set either, confirmed during
    // Phase 7 investigation).
    register_rest_route('webx/v1', '/polls/(?P<id>\d+)/vote', [
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $req) {
            global $wpdb;
            $id = (int) $req['id'];
            $option_index = (int) $req->get_param('optionIndex');
            $post = get_post($id);
            if (!$post || $post->post_type !== 'poll' || $post->post_status !== 'publish') {
                return new WP_Error('not_found', 'poll not found', ['status' => 404]);
            }
            if (!get_field('active', $id)) return new WP_Error('not_found', 'poll not found', ['status' => 404]);

            // A plain PHP read-modify-write (get_field → mutate → update_field)
            // let two concurrent votes both read the same options, increment
            // locally, then the later write clobber the earlier vote (lost
            // update). Found in a full-codebase audit (2026-09-12).
            //
            // Two earlier attempts at a fix — both abandoned after load-
            // testing against a real running instance disproved them, not
            // just from reading the code:
            //  1. A MySQL named lock (GET_LOCK/RELEASE_LOCK) around the
            //     critical section: still lost updates under concurrency,
            //     with zero lock-timeout rejections.
            //  2. flock() on a local file around the same PHP read-modify-
            //     write: debug logging proved the lock's mutual exclusion
            //     itself was working correctly (a waiting request only
            //     proceeded after the holder released) — but get_field()
            //     still returned a value that predated another request's
            //     already-committed update_field() from moments earlier.
            //     Serializing access to a caching layer that can itself
            //     serve stale reads doesn't help; the read path (ACF's
            //     get_field(), whatever it does under the hood in this
            //     environment) was the actual problem, not the absence of
            //     mutual exclusion.
            // Real fix: increment the specific option's vote count with a
            // single atomic SQL statement (MySQL's own row lock during the
            // UPDATE is what actually serializes this, and the read and
            // write happen in the same statement — no PHP-level gap for a
            // stale value to slip into). Bypasses get_field()/update_field()
            // for this one hot path entirely; ACF's own `_options` field-key
            // reference row is untouched, so get_field() elsewhere still
            // resolves the type correctly afterward. Load-tested: 20 truly
            // concurrent votes landed exactly +20, repeatedly, after
            // switching to this.
            $current = $wpdb->get_var($wpdb->prepare(
                "SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = 'options'", $id
            ));
            $options = json_decode((string) $current, true);
            if (!is_array($options) || !isset($options[$option_index])) {
                return new WP_Error('bad_request', 'invalid option', ['status' => 400]);
            }
            $json_path = '$[' . $option_index . '].votes';
            $wpdb->query($wpdb->prepare(
                "UPDATE {$wpdb->postmeta} SET meta_value = JSON_SET(meta_value, %s, CAST(COALESCE(JSON_EXTRACT(meta_value, %s), 0) AS UNSIGNED) + 1) WHERE post_id = %d AND meta_key = 'options'",
                $json_path, $json_path, $id
            ));
            // Re-read the just-updated row (same connection, sees its own
            // write immediately) to report accurate options/total back, and
            // to keep the total_votes convenience field roughly in sync —
            // this one recompute-and-overwrite still has a narrow window
            // under heavy concurrency (two requests could race on whose
            // total lands last), but it's a derived display aggregate, not
            // the source of truth: each option's own vote count above is
            // exactly correct regardless, and total_votes self-corrects on
            // the very next vote either way.
            $updated_raw = $wpdb->get_var($wpdb->prepare(
                "SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = 'options'", $id
            ));
            $options = json_decode((string) $updated_raw, true);
            $total = array_sum(array_column($options, 'votes'));
            $wpdb->update($wpdb->postmeta, ['meta_value' => $total], ['post_id' => $id, 'meta_key' => 'total_votes']);
            return ['data' => ['question' => get_field('question', $id), 'options' => $options, 'totalVotes' => $total]];
        },
    ]);

    // Complaint submit — one handler for both the plain-JSON and multipart
    // (with attachment) cases; WP's REST server already dispatches both to
    // the same callback ($request->get_file_params() is simply empty on a
    // JSON request), so no need to keep Strapi's historical JSON-vs-multipart
    // route split.
    $submit_complaint = function (WP_REST_Request $req) {
        if (!webx_rate_limit('complaints', 5, 10 * MINUTE_IN_SECONDS)) return webx_rate_limit_error();
        if (!webx_verify_captcha($req)) return webx_captcha_error();
        $tenant = sanitize_key((string) $req->get_param('tenant'));
        $anonymous = filter_var($req->get_param('anonymous'), FILTER_VALIDATE_BOOLEAN);
        $ref = webx_gen_ref($tenant ?: 'orst', 'CMP');

        $post_id = wp_insert_post(['post_type' => 'complaint', 'post_status' => 'publish', 'post_title' => $ref], true);
        if (is_wp_error($post_id)) return new WP_Error('server_error', 'submit failed', ['status' => 500]);
        webx_stamp_wtenant($post_id, $tenant);

        update_field('ref', $ref, $post_id);
        update_field('type', sanitize_text_field((string) $req->get_param('type')), $post_id);
        update_field('subject', sanitize_text_field((string) $req->get_param('subject')), $post_id);
        update_field('agency', sanitize_text_field((string) $req->get_param('agency')), $post_id);
        update_field('detail', sanitize_textarea_field((string) $req->get_param('detail')), $post_id);
        update_field('anonymous', $anonymous, $post_id);
        update_field('name', webx_pii_encrypt_if_needed($anonymous ? '' : (string) $req->get_param('name')), $post_id);
        update_field('email', webx_pii_encrypt_if_needed($anonymous ? '' : (string) $req->get_param('email')), $post_id);
        update_field('phone', webx_pii_encrypt_if_needed($anonymous ? '' : (string) $req->get_param('phone')), $post_id);
        update_field('stage', 0, $post_id);
        update_field('date', sanitize_text_field((string) $req->get_param('date')) ?: gmdate('c'), $post_id);

        $data = ['type' => $req->get_param('type'), 'subject' => $req->get_param('subject'), 'name' => $req->get_param('name'), 'email' => $req->get_param('email')];

        $files = $req->get_file_params();
        if (!empty($files['attachment'])) {
            $result = webx_handle_upload($files['attachment'], $tenant);
            if (isset($result['error'])) return new WP_Error('bad_request', $result['error'], ['status' => 400]);
            if (isset($result['id'])) update_field('attachment', $result['id'], $post_id);
        }

        webx_send_complaint_emails($tenant, $ref, $data, $anonymous);
        return ['data' => ['ref' => $ref]];
    };
    register_rest_route('webx/v1', '/complaints', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => $submit_complaint]);
    register_rest_route('webx/v1', '/complaints/submit', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => $submit_complaint]);

    register_rest_route('webx/v1', '/complaints/track/(?P<ref>[\w-]+)', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $req) {
            $ref = strtoupper(sanitize_text_field($req['ref']));
            $posts = get_posts(['post_type' => 'complaint', 'title' => $ref, 'post_status' => 'publish', 'numberposts' => 1]);
            if (!$posts) return new WP_Error('not_found', 'complaint not found', ['status' => 404]);
            $id = $posts[0]->ID;
            return ['data' => [
                'ref' => $ref, 'type' => get_field('type', $id), 'subject' => get_field('subject', $id),
                'date' => get_field('date', $id), 'stage' => get_field('stage', $id), 'steps' => get_field('steps', $id),
            ]];
        },
    ]);

    register_rest_route('webx/v1', '/contact-messages', [
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $req) {
            if (!webx_rate_limit('contact-messages', 5, 10 * MINUTE_IN_SECONDS)) return webx_rate_limit_error();
            if (!webx_verify_captcha($req)) return webx_captcha_error();
            $tenant = sanitize_key((string) $req->get_param('tenant'));
            $name = sanitize_text_field((string) $req->get_param('name'));
            $post_id = wp_insert_post(['post_type' => 'contact_message', 'post_status' => 'publish', 'post_title' => $name ?: 'ไม่ระบุชื่อ'], true);
            if (is_wp_error($post_id)) return new WP_Error('server_error', 'submit failed', ['status' => 500]);
            webx_stamp_wtenant($post_id, $tenant);
            update_field('email', webx_pii_encrypt_if_needed((string) $req->get_param('email')), $post_id);
            update_field('phone', webx_pii_encrypt_if_needed((string) $req->get_param('phone')), $post_id);
            update_field('subject', sanitize_text_field((string) $req->get_param('subject')), $post_id);
            update_field('message', sanitize_textarea_field((string) $req->get_param('message')), $post_id);
            update_field('handled', false, $post_id);
            // No email sent — parity with the Strapi contact-message content
            // type, which never had a lifecycle email either.
            return ['data' => ['ok' => true]];
        },
    ]);

    register_rest_route('webx/v1', '/applications', [
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => function (WP_REST_Request $req) {
            if (!webx_rate_limit('applications', 5, 10 * MINUTE_IN_SECONDS)) return webx_rate_limit_error();
            if (!webx_verify_captcha($req)) return webx_captcha_error();
            $tenant = sanitize_key((string) $req->get_param('tenant'));
            $ref = webx_gen_ref($tenant ?: 'orst', 'APP');

            $post_id = wp_insert_post(['post_type' => 'application', 'post_status' => 'publish', 'post_title' => $ref], true);
            if (is_wp_error($post_id)) return new WP_Error('server_error', 'submit failed', ['status' => 500]);
            webx_stamp_wtenant($post_id, $tenant);

            $position = sanitize_text_field((string) $req->get_param('position'));
            update_field('ref', $ref, $post_id);
            update_field('jobId', sanitize_text_field((string) $req->get_param('jobId')), $post_id);
            update_field('position', $position, $post_id);
            update_field('name', webx_pii_encrypt_if_needed((string) $req->get_param('name')), $post_id);
            update_field('email', webx_pii_encrypt_if_needed((string) $req->get_param('email')), $post_id);
            update_field('phone', webx_pii_encrypt_if_needed((string) $req->get_param('phone')), $post_id);
            update_field('note', sanitize_textarea_field((string) $req->get_param('note')), $post_id);
            update_field('stage', 0, $post_id);
            update_field('date', gmdate('c'), $post_id);

            $files = $req->get_file_params();
            if (!empty($files['resume'])) {
                $result = webx_handle_upload($files['resume'], $tenant);
                if (isset($result['error'])) return new WP_Error('bad_request', $result['error'], ['status' => 400]);
                if (isset($result['id'])) update_field('resume', $result['id'], $post_id);
            }

            webx_send_application_email($ref, ['email' => $req->get_param('email'), 'position' => $position]);
            return ['data' => ['ref' => $ref]];
        },
    ]);
});
