<?php
// See notice/render.php's comment — never seen by a real visitor.
?>
<span <?php echo get_block_wrapper_attributes(['class' => 'webx-block webx-block--table-cell']); ?>><?php echo esc_html($attributes['value'] ?? ''); ?></span>
