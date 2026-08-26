<?php
// Standard fix for Apache/mod_php environments that only forward the
// Authorization header as REDIRECT_HTTP_AUTHORIZATION after an internal
// mod_rewrite redirect — required for Basic-auth (Application Passwords) to
// reach WP's REST API at all, in every environment. Safe everywhere.
if (empty($_SERVER['HTTP_AUTHORIZATION']) && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
}

// WordPress disables Application Passwords unless the site is served over
// HTTPS — correct, and left alone by default. A real deployment should
// terminate TLS in front of WordPress and never need this. Forcing the
// check on is ONLY for a plain-HTTP dev/proof instance (this repo's
// docker-compose.wordpress.yml sets WP_ALLOW_HTTP_APP_PASSWORDS=1) — opt-in
// so a production deploy can't inherit this security bypass by accident.
if (getenv('WP_ALLOW_HTTP_APP_PASSWORDS') === '1') {
    add_filter('wp_is_application_passwords_available', '__return_true');
}
