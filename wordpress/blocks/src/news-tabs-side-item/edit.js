import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { image, type, title, body } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--news-tabs-side-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Image URL', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
			<TextControl label={__('Type', 'webx-blocks')} value={type} onChange={(v) => setAttributes({ type: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
		</div>
	);
}
