// Dynamic block: front-end/editor-preview HTML is rendered server-side (see
// render.php in this same directory), so save() returns null and nothing
// gets stored in post_content beyond the attributes themselves. This is
// deliberate, not a placeholder — it sidesteps Gutenberg's own content
// validation entirely (which otherwise diffs stored HTML against a fresh
// save() render and flags any mismatch as "invalid content"), which matters
// here specifically because wordpress/mu-plugins/webx-blocks-backfill.php
// constructs block markup in PHP without a JS runtime to compute save()'s
// exact output — a static save() and a hand-built backfill can never be
// made to agree byte-for-byte, but a dynamic block has nothing to disagree
// about in the first place.
export default function save() {
	return null;
}
