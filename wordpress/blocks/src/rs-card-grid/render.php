<?php
// See notice/render.php's comment — never seen by a real visitor. $content
// is WP core's own pre-rendered InnerBlocks markup (each child
// webx/rs-card-grid-item's own render.php output).
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--rs-card-grid']); ?>>
    <?php if (!empty($attributes['eyebrow'])) : ?><span class="webx-eyebrow"><?php echo esc_html($attributes['eyebrow']); ?></span><?php endif; ?>
    <?php if (!empty($attributes['heading'])) : ?><h2><?php echo esc_html($attributes['heading']); ?></h2><?php endif; ?>
    <?php if (!empty($attributes['lead'])) : ?><p><?php echo esc_html($attributes['lead']); ?></p><?php endif; ?>
    <?php echo $content; ?>
</div>
