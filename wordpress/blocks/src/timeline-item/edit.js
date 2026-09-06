import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { year, statusLabel, title, body } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--timeline-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Year', 'webx-blocks')} value={year} onChange={(v) => setAttributes({ year: v })} />
			<TextControl label={__('Status label', 'webx-blocks')} value={statusLabel} onChange={(v) => setAttributes({ statusLabel: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
		</div>
	);
}
