import { InnerBlocks } from '@wordpress/block-editor';

// Dynamic block (see notice/save.js's comment for why) — the parent's OWN
// scalar attributes (eyebrow/heading/lead) render server-side via
// render.php, not here. save() renders ONLY the InnerBlocks passthrough,
// with no extra wrapper markup around it, so what gets stored always
// matches what wordpress/mu-plugins/webx-blocks-backfill.php constructs
// byte-for-byte (empty innerHTML, one null slot per child) — anything else
// here would reintroduce the exact "Block contains unexpected or invalid
// content" mismatch this whole file exists to avoid.
export default function save() {
	return <InnerBlocks.Content />;
}
