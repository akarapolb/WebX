<?php
// See notice/render.php's comment — never seen by a real visitor.
?>
<a <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--list-panel-item']); ?> href="<?php echo esc_url($attributes['href'] ?? '#'); ?>">
    <?php echo esc_html($attributes['title'] ?? ''); ?>
</a>
