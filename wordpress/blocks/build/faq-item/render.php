<?php
// See notice/render.php's comment — same reasoning, never seen by a real visitor.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--faq-item']); ?>>
    <?php if (!empty($attributes['q'])) : ?><strong><?php echo esc_html($attributes['q']); ?></strong><?php endif; ?>
    <?php if (!empty($attributes['a'])) : ?><p><?php echo esc_html($attributes['a']); ?></p><?php endif; ?>
</div>
