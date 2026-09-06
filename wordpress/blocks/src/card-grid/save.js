import { InnerBlocks } from '@wordpress/block-editor';

// See faq/save.js's comment — identical reasoning.
export default function save() {
	return <InnerBlocks.Content />;
}
