<?php
// Multi-tenancy for WordPress content — Phase 5 of the Engine Adapter
// Blueprint. WordPress has no native tenant concept, so this registers a
// `wtenant` taxonomy on `post` with show_in_rest true, which gives the REST
// API native ?wtenant=<termId> read-filtering and {wtenant:[id]} write
// support with zero custom REST code. webx-studio's governance.ts is what
// actually enforces scoping (stamping on write, filtering on read) — this
// plugin only makes the field exist and be REST-visible, mirroring how
// Strapi's own tenant relation is just a schema field with enforcement
// living in code, not in the engine.
add_action('init', function () {
    register_taxonomy('wtenant', 'post', [
        'label' => 'Tenant',
        'public' => false,
        'hierarchical' => false,
        'show_in_rest' => true,
        'rest_base' => 'wtenant',
        'show_admin_column' => true,
    ]);
});
