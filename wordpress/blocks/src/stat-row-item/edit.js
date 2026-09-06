import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { value, label, note } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--stat-row-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Value', 'webx-blocks')} value={value} onChange={(v) => setAttributes({ value: v })} />
			<TextControl label={__('Label', 'webx-blocks')} value={label} onChange={(v) => setAttributes({ label: v })} />
			<TextControl label={__('Note', 'webx-blocks')} value={note} onChange={(v) => setAttributes({ note: v })} />
		</div>
	);
}
