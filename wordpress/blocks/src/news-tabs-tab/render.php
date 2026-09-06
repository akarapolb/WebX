<?php
// See notice/render.php's comment — never seen by a real visitor.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--news-tabs-tab']); ?>>
    <?php if (!empty($attributes['featuredTitle'])) : ?><h3><?php echo esc_html($attributes['featuredTitle']); ?></h3><?php endif; ?>
    <?php echo $content; ?>
</div>
