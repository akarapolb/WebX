<?php
// See notice/render.php's comment — never seen by a real visitor.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--contact-info']); ?>>
    <?php echo esc_html($attributes['address'] ?? ''); ?>
</div>
