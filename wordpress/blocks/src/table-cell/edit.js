import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { value } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--table-cell' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Cell', 'webx-blocks')} value={value} onChange={(v) => setAttributes({ value: v })} />
		</div>
	);
}
