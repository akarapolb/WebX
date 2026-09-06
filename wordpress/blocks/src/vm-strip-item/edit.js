import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { label } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--vm-strip-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Statement', 'webx-blocks')} value={label} onChange={(v) => setAttributes({ label: v })} />
		</div>
	);
}
