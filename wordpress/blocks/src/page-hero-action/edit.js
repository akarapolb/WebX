import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, ToggleControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { label, href, ghost } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--page-hero-action' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Label', 'webx-blocks')} value={label} onChange={(v) => setAttributes({ label: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
			<ToggleControl label={__('Ghost style', 'webx-blocks')} checked={ghost} onChange={(v) => setAttributes({ ghost: v })} />
		</div>
	);
}
