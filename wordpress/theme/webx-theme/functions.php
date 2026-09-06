<?php
/**
 * WebX Editorial — theme setup.
 *
 * The one real functional payoff of this theme (see style.css's own header
 * comment for why a headless deployment needs a theme at all): correctly
 * styling the Gutenberg block-editor preview via add_editor_style(), which
 * had no styling at all before this — every custom post type's editor
 * (service/org-unit/mission-item/faq/member/event/document/...) fell back
 * to WordPress's own bare default typography, visibly disconnected from
 * what the content actually looks like on the real (Next.js) site.
 */

add_action( 'after_setup_theme', function () {
	load_theme_textdomain( 'webx-theme', get_template_directory() . '/languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );

	// Real Gutenberg editor styling — the actual point of this theme, see
	// this file's own header comment.
	add_theme_support( 'editor-styles' );
	add_editor_style( array(
		'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Noto+Serif+Thai:wght@600;700&display=swap',
		'editor-style.css',
	) );

	// Every custom post type here is genuinely simple (title/editor/excerpt/
	// thumbnail — see wordpress/mu-plugins/custom-post-types.php), so a wide
	// editor canvas matching this project's real reading measure is more
	// useful than Gutenberg's default centered/narrow one.
	add_theme_support( 'align-wide' );
} );

add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style(
		'webx-theme-style',
		get_stylesheet_uri(),
		array(),
		wp_get_theme()->get( 'Version' )
	);
} );
