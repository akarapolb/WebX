import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { title, body, href, linkLabel } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--feature-directory-item' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Title', 'webx-blocks')} value={title} onChange={(v) => setAttributes({ title: v })} />
			<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
			<TextControl
				label={__('Link label', 'webx-blocks')}
				help={__('Optional — overrides the block-level default link label (knowledge variant only).', 'webx-blocks')}
				value={linkLabel}
				onChange={(v) => setAttributes({ linkLabel: v })}
			/>
		</div>
	);
}
