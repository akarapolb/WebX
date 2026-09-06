import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { badge, time, title, body, buttonLabel } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--service-hub-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Badge', 'webx-blocks')} value={badge} onChange={(v) => setAttributes({ badge: v })} />
			<TextControl label={__('Time', 'webx-blocks')} value={time} onChange={(v) => setAttributes({ time: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
			<TextControl label={__('Button label', 'webx-blocks')} value={buttonLabel} onChange={(v) => setAttributes({ buttonLabel: v })} />
		</div>
	);
}
