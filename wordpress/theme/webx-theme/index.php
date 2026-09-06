<?php
/**
 * The one and only front-end template this theme has — this WordPress
 * instance is a headless content backend (see style.css's own header
 * comment): the real public site is the separate Next.js app, not anything
 * this theme renders. A visit here almost certainly means someone navigated
 * to the WordPress origin directly rather than the real site, so this is an
 * honest notice + a link, not an attempt to reproduce the actual design.
 */
get_header();
?>
<div class="webx-notice">
	<h1><?php bloginfo( 'name' ); ?></h1>
	<p>This is the content backend for <?php bloginfo( 'name' ); ?> — not the public website.</p>
	<p><a href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Return to the site', 'webx-theme' ); ?></a></p>
</div>
<?php
get_footer();
