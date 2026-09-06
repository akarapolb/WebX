import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { image, alt, title, desc, tag, href } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--media-grid-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Image URL', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
			<TextControl label={__('Alt text', 'webx-blocks')} value={alt} onChange={(v) => setAttributes({ alt: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Description', 'webx-blocks')} value={desc} onChange={(v) => setAttributes({ desc: v })} />
			<TextControl label={__('Tag', 'webx-blocks')} value={tag} onChange={(v) => setAttributes({ tag: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
		</div>
	);
}
