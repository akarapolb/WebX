import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { image, type, category, title, body, href, linkLabel } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--recommended-carousel-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Image URL', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
			<TextControl label={__('Type', 'webx-blocks')} value={type} onChange={(v) => setAttributes({ type: v })} />
			<TextControl label={__('Category', 'webx-blocks')} value={category} onChange={(v) => setAttributes({ category: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
			<TextControl label={__('Link label', 'webx-blocks')} value={linkLabel} onChange={(v) => setAttributes({ linkLabel: v })} />
		</div>
	);
}
