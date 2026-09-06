import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { date, tag, title, body, href } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--list-panel-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Date', 'webx-blocks')} value={date} onChange={(v) => setAttributes({ date: v })} />
			<TextControl label={__('Tag', 'webx-blocks')} value={tag} onChange={(v) => setAttributes({ tag: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
		</div>
	);
}
