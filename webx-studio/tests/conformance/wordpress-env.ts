// Imported first by wordpress.conformance.test.ts: lib/config.ts reads WORDPRESS_URL
// once, when the adapter is loaded, so the conformance URL has to be in the
// environment before that.
if (process.env.CONFORMANCE_WP_URL) process.env.WORDPRESS_URL = process.env.CONFORMANCE_WP_URL;
export {};
