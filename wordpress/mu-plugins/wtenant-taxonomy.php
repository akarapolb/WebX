<?php
// Multi-tenancy for WordPress content — Phase 5 of the Engine Adapter
// Blueprint. WordPress has no native tenant concept, so this registers a
// `wtenant` taxonomy with show_in_rest true, which gives the REST
// API native ?wtenant=<termId> read-filtering and {wtenant:[id]} write
// support with zero custom REST code. webx-studio's governance.ts is what
// actually enforces scoping (stamping on write, filtering on read) — this
// plugin only makes the field exist and be REST-visible, mirroring how
// Strapi's own tenant relation is just a schema field with enforcement
// living in code, not in the engine.
//
// Extended to every public post type below, not just `post` (TOR gap
// audit — wiring real site search for ORST/RoyalSociety needed a way to
// scope WordPress's own native /wp/v2/search endpoint per tenant; that
// endpoint already covers every post type here, but ?wtenant= filtering
// only existed for `post` until now, and neither tenant's real content —
// pages, documents, services, etc. — is a plain `post`). `page` covers the
// actual site pages; the rest mirror custom-post-types.php's own list.
add_action('init', function () {
    register_taxonomy('wtenant', ['post', 'page', 'service', 'publication', 'faq', 'resource', 'timeline-event', 'mission-item', 'org-unit', 'document'], [
        'label' => 'Tenant',
        'public' => false,
        'hierarchical' => false,
        'show_in_rest' => true,
        'rest_base' => 'wtenant',
        'show_admin_column' => true,
    ]);
});

// The ?wtenant= filter above (`rest_query_vars`, wired automatically by
// show_in_rest) only reaches per-post-type endpoints like /wp/v2/pages —
// WP_REST_Search_Controller (the aggregate /wp/v2/search endpoint each
// tenant's own site-search box now calls) builds its own WP_Query and
// ignores arbitrary query vars entirely. Confirmed live: ?wtenant=6 on
// /wp/v2/search still returned both tenants' results unfiltered. This hooks
// the one filter that controller does expose for its underlying query.
add_filter('rest_post_search_query', function ($args, $request) {
    $wtenant = $request->get_param('wtenant');
    if ($wtenant) {
        // Every OTHER ?wtenant= usage in this codebase (the per-post-type
        // filtering above, webx-studio's own reads) passes the numeric term
        // id — kept consistent here too, but also accepts the tenant's own
        // slug ("orst"/"royalsociety") since that's what a public-site
        // search box actually knows about itself at build time, with no
        // reason to make it fetch+cache a term id first just to search.
        $field = is_numeric($wtenant) ? 'term_id' : 'slug';
        $args['tax_query'] = [[
            'taxonomy' => 'wtenant',
            'field' => $field,
            'terms' => $field === 'term_id' ? array_map('intval', (array) $wtenant) : (array) $wtenant,
        ]];
    }
    return $args;
}, 10, 2);
