<?php
// See notice/render.php's comment — never seen by a real visitor. Escaped
// text only, on purpose — see rich-text/block.json's own comment.
?>
<p <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--rich-text-item']); ?>>
    <?php echo esc_html($attributes['text'] ?? ''); ?>
</p>
