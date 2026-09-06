import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { icon, title } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--trust-strip-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Icon id', 'webx-blocks')} value={icon} onChange={(v) => setAttributes({ icon: v })} />
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
		</div>
	);
}
