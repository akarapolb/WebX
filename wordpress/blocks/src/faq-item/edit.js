import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { q, a } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--faq-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Question', 'webx-blocks')} value={q} onChange={(v) => setAttributes({ q: v })} />
			<TextareaControl label={__('Answer', 'webx-blocks')} value={a} onChange={(v) => setAttributes({ a: v })} />
		</div>
	);
}
