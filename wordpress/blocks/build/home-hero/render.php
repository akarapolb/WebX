<?php
// See notice/render.php's comment — never seen by a real visitor.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--home-hero']); ?>>
    <?php if (!empty($attributes['heading'])) : ?><h1><?php echo esc_html($attributes['heading']); ?></h1><?php endif; ?>
</div>
