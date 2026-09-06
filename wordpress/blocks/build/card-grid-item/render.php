<?php
// See notice/render.php's comment — same reasoning, never seen by a real visitor.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--card-grid-item']); ?>>
    <?php if (!empty($attributes['title'])) : ?><a href="<?php echo esc_url($attributes['href'] ?? '#'); ?>"><?php echo esc_html($attributes['title']); ?></a><?php endif; ?>
    <?php if (!empty($attributes['body'])) : ?><p><?php echo esc_html($attributes['body']); ?></p><?php endif; ?>
</div>
