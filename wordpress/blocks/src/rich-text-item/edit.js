import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { text } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--rich-text-item' });
	return (
		<div {...blockProps}>
			<TextareaControl label={__('Paragraph', 'webx-blocks')} value={text} onChange={(v) => setAttributes({ text: v })} />
		</div>
	);
}
