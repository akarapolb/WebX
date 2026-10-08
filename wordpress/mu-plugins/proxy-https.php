<?php
// Behind a TLS-terminating reverse proxy (the `site` Caddy) WordPress itself
// only ever sees plain HTTP, so is_ssl() is false: wp-admin builds http://
// links, cookies are not marked secure, and Application Passwords — which
// WordPress refuses over plain HTTP — are unavailable.
//
// Opt-in (WP_TRUST_PROXY_HTTPS=1) because X-Forwarded-Proto is a client-supplied
// header unless a proxy you control overwrites it. Caddy does overwrite it, so
// this is safe only while the wordpress container is reachable through that
// proxy alone (docker-compose.yml binds its host port to 127.0.0.1 for exactly
// this reason). Never enable it on an instance that is directly reachable.
if (getenv('WP_TRUST_PROXY_HTTPS') === '1'
    && strtolower(trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')[0])) === 'https') {
    $_SERVER['HTTPS'] = 'on';
}
