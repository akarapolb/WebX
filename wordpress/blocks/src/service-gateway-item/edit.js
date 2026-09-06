import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { label, title, body, href } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--service-gateway-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Label', 'webx-blocks')} value={label} onChange={(v) => setAttributes({ label: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
		</div>
	);
}
