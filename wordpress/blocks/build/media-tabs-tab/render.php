<?php
// See notice/render.php's comment — never seen by a real visitor.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--media-tabs-tab']); ?>>
    <?php if (!empty($attributes['label'])) : ?><h3><?php echo esc_html($attributes['label']); ?></h3><?php endif; ?>
    <?php echo $content; ?>
</div>
