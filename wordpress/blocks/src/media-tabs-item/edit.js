import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { image, caption, tag, title } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--media-tabs-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Image URL', 'webx-blocks')} help={__('Leave blank for a text card (tag/title) instead of a photo card.', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
			<TextControl label={__('Caption', 'webx-blocks')} value={caption} onChange={(v) => setAttributes({ caption: v })} />
			<TextControl label={__('Tag', 'webx-blocks')} help={__('Text-card only.', 'webx-blocks')} value={tag} onChange={(v) => setAttributes({ tag: v })} />
			<TextControl label={__('Title', 'webx-blocks')} help={__('Text-card only.', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
		</div>
	);
}
