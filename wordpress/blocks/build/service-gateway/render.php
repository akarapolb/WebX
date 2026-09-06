<?php
// See notice/render.php's comment — never seen by a real visitor.
?>
<div <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--service-gateway']); ?>>
    <?php if (!empty($attributes['heading'])) : ?><h2><?php echo esc_html($attributes['heading']); ?></h2><?php endif; ?>
    <?php echo $content; ?>
</div>
