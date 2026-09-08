<?php
// Phase 7 — native WordPress custom post types for features that previously
// ran entirely on a separate Strapi-backed service (poll/complaint/
// contact-message/job/application/breaking-news). See public-forms-api.php
// for the public REST write endpoints, public-forms-acf.php for the field
// groups. Same registration shape and same wtenant-taxonomy hookup pattern
// as custom-post-types.php's event/member (priority 20 — must run after
// wtenant-taxonomy.php's own default-priority init registers the taxonomy
// itself).
//
// public:false on every type here (unlike service/publication/etc) — none
// of these are ever rendered as a WordPress front-end page; they're pure
// data records read/written exclusively through REST.
add_action('init', function () {
    register_post_type('poll', [
        'label' => 'Poll',
        'public' => false,
        'show_in_rest' => true,
        'rest_base' => 'poll',
        'supports' => ['title'], // title = the poll question
        'has_archive' => false,
        'menu_icon' => 'dashicons-chart-bar',
    ]);
    register_post_type('complaint', [
        'label' => 'Complaint',
        'public' => false,
        'show_in_rest' => true,
        'rest_base' => 'complaint',
        'supports' => ['title'], // title = the generated ref number
        'has_archive' => false,
        'menu_icon' => 'dashicons-warning',
    ]);
    register_post_type('contact_message', [
        'label' => 'Contact Message',
        'public' => false,
        'show_in_rest' => true,
        'rest_base' => 'contact-message',
        'supports' => ['title'], // title = the sender's name
        'has_archive' => false,
        'menu_icon' => 'dashicons-email',
    ]);
    register_post_type('job', [
        'label' => 'Job',
        'public' => false,
        'show_in_rest' => true,
        'rest_base' => 'job',
        'supports' => ['title'], // title = the job title
        'has_archive' => false,
        'menu_icon' => 'dashicons-businessperson',
    ]);
    register_post_type('application', [
        'label' => 'Application',
        'public' => false,
        'show_in_rest' => true,
        'rest_base' => 'application',
        'supports' => ['title'], // title = the generated ref number
        'has_archive' => false,
        'menu_icon' => 'dashicons-id',
    ]);
    register_post_type('breaking_news', [
        'label' => 'Breaking News Alert',
        'public' => false,
        'show_in_rest' => true,
        'rest_base' => 'breaking-news',
        'supports' => ['title'], // title unused in practice — always exactly one active row per tenant, by convention (same as the Strapi schema this replaces)
        'has_archive' => false,
        'menu_icon' => 'dashicons-megaphone',
    ]);

    register_taxonomy_for_object_type('wtenant', 'poll');
    register_taxonomy_for_object_type('wtenant', 'complaint');
    register_taxonomy_for_object_type('wtenant', 'contact_message');
    register_taxonomy_for_object_type('wtenant', 'job');
    register_taxonomy_for_object_type('wtenant', 'application');
    register_taxonomy_for_object_type('wtenant', 'breaking_news');
}, 20);

// WordPress's native REST filtering has no equivalent of Strapi's
// `filters[active][$eq]=true` for an ACF true_false field — BreakingNewsBanner.tsx
// needs exactly that (find the one active alert for a tenant). Translates a
// plain ?active=1 query param into the meta_query ACF's true_false field
// actually needs, following the same "translate a simple REST query param
// into the WP_Query shape a field needs" pattern wtenant-taxonomy.php's own
// rest_post_search_query filter already establishes for wtenant.
add_filter('rest_breaking_news_query', function ($args, $request) {
    $active = $request->get_param('active');
    if ($active !== null && $active !== '') {
        $args['meta_query'] = [[
            'key' => 'active',
            'value' => $active ? '1' : '0',
            'compare' => '=',
        ]];
    }
    return $args;
}, 10, 2);
