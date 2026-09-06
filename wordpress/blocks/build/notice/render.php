<?php
// Server-side render for the dynamic webx/notice block (see save.js's
// comment for why this is dynamic). This markup is never seen by a real
// site visitor — public-site renders the actual page from page.acf.blocks,
// not from WordPress's own front end — so it only needs to be good enough
// for wp-admin's own "View Page"/preview and to avoid a PHP notice.
$tone = in_array($attributes['tone'] ?? 'info', ['info', 'warn', 'success'], true) ? $attributes['tone'] : 'info';
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--notice is-' . esc_attr($tone)]); ?>>
    <?php if (!empty($attributes['title'])) : ?><strong><?php echo esc_html($attributes['title']); ?></strong><?php endif; ?>
    <?php if (!empty($attributes['body'])) : ?><p><?php echo esc_html($attributes['body']); ?></p><?php endif; ?>
</div>
