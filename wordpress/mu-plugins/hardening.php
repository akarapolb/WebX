<?php
// Server/application hardening — TOR §4.4 explicitly requires this (ปิด
// XML-RPC, เปลี่ยน Login URL, ซ่อน Version) as a precondition of the
// "ห้ามใช้ Theme สำเร็จรูป... ต้องทำ Hardening" clause. None of this
// existed anywhere in mu-plugins/ before (TOR gap audit).

// 1) Disable XML-RPC — a long-standing brute-force/pingback-amplification
// attack surface (system.multicall lets one request try many password
// combinations; pingback.ping is a known DDoS-relay vector) that this
// install has no legitimate use for (webx-studio and every public form
// here talk to the REST API, never XML-RPC). Safe to disable outright, no
// opt-out needed — unlike the login-URL change below, nothing legitimate
// depends on this being reachable.
add_filter('xmlrpc_enabled', '__return_false');
// The filter above stops XML-RPC *requests* from doing anything, but
// xmlrpc.php itself still returns 200 with a capability-advertisement
// response unless the endpoint is refused outright — closing it at the
// HTTP layer removes the attack surface entirely, not just the RPC handler.
add_action('init', function () {
    if (strpos($_SERVER['REQUEST_URI'] ?? '', 'xmlrpc.php') !== false) {
        http_response_code(403);
        exit('XML-RPC is disabled.');
    }
});
// Same reasoning — these three all advertise/support XML-RPC in ways the
// filter above doesn't reach.
remove_action('wp_head', 'rsd_link');                                    // <link rel="EditURI"> RSD discovery
remove_action('wp_head', 'wlwmanifest_link');                            // Windows Live Writer manifest
add_filter('wp_headers', function ($headers) {
    unset($headers['X-Pingback']);
    return $headers;
});

// 2) Hide WordPress version disclosure — a version number in response
// headers/markup/asset query-strings tells an attacker exactly which known
// CVEs to try; none of that information serves a real visitor.
remove_action('wp_head', 'wp_generator');                                // <meta name="generator">
add_filter('the_generator', '__return_empty_string');                    // RSS/Atom feed generator tag
add_filter('style_loader_src', 'webx_strip_version_query', 9999);
add_filter('script_loader_src', 'webx_strip_version_query', 9999);
function webx_strip_version_query($src) {
    if (is_string($src) && strpos($src, 'ver=')) {
        $src = remove_query_arg('ver', $src);
    }
    return $src;
}

// 3) Gate the login form behind a shared secret — OFF by default (nothing
// below runs unless WEBX_ADMIN_LOGIN_KEY is actually set), since a wrong
// move here means locking out every real admin, including the
// scheduler/webx-studio's own WordPress-engine login path. Deliberately
// NOT set in docker-compose.wordpress.yml's own dev environment — this
// session's e2e suite (wp-admin.spec.ts) and every live test this whole
// project has done navigate straight to /wp-login.php; a real deployment
// opts in explicitly once ready, and must bookmark the resulting URL
// (there's no separate "forgot the key" recovery path — that's the point).
//
// Deliberately a query-param GATE on the existing /wp-login.php URL
// (?webx_key=<secret> required, else bounced to the homepage — bots
// scanning for a bare /wp-login.php never see a login form at all) rather
// than a rewritten URL/slug. add_rewrite_rule()-based "change the login
// slug" plugins need a permalink flush (writing .htaccess, or the
// equivalent nginx config reload this Apache-based image doesn't have a
// hook for) to actually take effect, and silently 404 the login page
// entirely until that happens — a much worse failure mode than this one
// query param, which needs no server-level rewrite config at all and fails
// safe (worst case: the gate is misconfigured and blocks everyone
// equally, not "some requests reach a live login form nobody bookmarked").
// The secret still travels in a URL (server logs, browser history), same
// caveat any of these techniques share; TLS in front (see DEPLOY.md) is
// what actually protects it in transit.
$webx_login_key = getenv('WEBX_ADMIN_LOGIN_KEY');
if ($webx_login_key) {
    add_action('login_init', function () use ($webx_login_key) {
        // Only the login FORM itself is gated — POSTing valid credentials,
        // password-reset links, and an already-authenticated session all
        // still work through their normal wp-login.php actions untouched;
        // only an anonymous GET without the right key gets bounced.
        $action = $_REQUEST['action'] ?? 'login';
        if ($action !== 'login' || is_user_logged_in()) return;
        $given = $_GET['webx_key'] ?? '';
        if (!hash_equals($webx_login_key, (string) $given)) {
            wp_safe_redirect(home_url('/'));
            exit;
        }
    }, 1);
}
