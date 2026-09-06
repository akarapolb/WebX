import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { icon, tag, title, body, meta, href } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--card-grid-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Icon id', 'webx-blocks')} value={icon} onChange={(v) => setAttributes({ icon: v })} />
			<TextControl label={__('Tag', 'webx-blocks')} value={tag} onChange={(v) => setAttributes({ tag: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
			<TextControl label={__('Meta', 'webx-blocks')} value={meta} onChange={(v) => setAttributes({ meta: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
		</div>
	);
}
