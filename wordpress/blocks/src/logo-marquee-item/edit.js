import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { name, image, href } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--logo-marquee-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Name', 'webx-blocks')} value={name} onChange={(v) => setAttributes({ name: v })} />
			<TextControl label={__('Image URL', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
		</div>
	);
}
