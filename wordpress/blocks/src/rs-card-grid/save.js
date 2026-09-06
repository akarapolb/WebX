import { InnerBlocks } from '@wordpress/block-editor';

// Dynamic block (see notice/save.js's comment for why) — no wrapper markup,
// so the stored comment always matches what webx-blocks-backfill.php builds.
export default function save() {
	return <InnerBlocks.Content />;
}
