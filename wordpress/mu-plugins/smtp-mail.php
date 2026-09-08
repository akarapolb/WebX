<?php
// Real SMTP delivery for wp_mail() — needed by public-forms-api.php's staff-
// notify/citizen-acknowledgement emails (Phase 7: WordPress-native
// complaints/applications). WordPress's default mail transport is PHP's
// mail()/a local MTA, which this container has never had configured (no
// prior wp_mail() usage anywhere in this codebase before Phase 7) — without
// this, wp_mail() just returns false silently, no exception, no visible
// failure anywhere.
//
// Reads the SAME env var names Strapi's own SMTP config already uses
// (strapi-cms/config/plugins.ts's email plugin: SMTP_HOST/PORT/USER/PASS/
// FROM) via getenv(), matching the getenv()-for-WP-side-secrets precedent
// hardening.php's WEBX_ADMIN_LOGIN_KEY already set. If SMTP_HOST is unset,
// this file does nothing and WordPress falls back to its own default
// (still non-functional in this environment, but no different from today).
add_action('phpmailer_init', function ($phpmailer) {
    $host = getenv('SMTP_HOST');
    if (!$host) return;
    $phpmailer->isSMTP();
    $phpmailer->Host = $host;
    $phpmailer->Port = (int) (getenv('SMTP_PORT') ?: 587);
    $user = getenv('SMTP_USER');
    if ($user) {
        $phpmailer->SMTPAuth = true;
        $phpmailer->Username = $user;
        $phpmailer->Password = getenv('SMTP_PASS') ?: '';
    } else {
        $phpmailer->SMTPAuth = false;
    }
    $secure = getenv('SMTP_SECURE');
    $phpmailer->SMTPSecure = $secure === 'true' ? 'ssl' : 'tls';
    $from = getenv('SMTP_FROM') ?: 'no-reply@orst.go.th';
    $phpmailer->setFrom($from, get_bloginfo('name'));
});
