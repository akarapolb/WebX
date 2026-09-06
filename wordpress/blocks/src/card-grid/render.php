<?php
// See faq/render.php's comment — same reasoning, including $content.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--card-grid']); ?>>
    <?php if (!empty($attributes['eyebrow'])) : ?><span class="webx-eyebrow"><?php echo esc_html($attributes['eyebrow']); ?></span><?php endif; ?>
    <?php if (!empty($attributes['heading'])) : ?><h2><?php echo esc_html($attributes['heading']); ?></h2><?php endif; ?>
    <?php if (!empty($attributes['lead'])) : ?><p><?php echo esc_html($attributes['lead']); ?></p><?php endif; ?>
    <?php echo $content; ?>
</div>
