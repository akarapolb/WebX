import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl, SelectControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { label, href, variant } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--two-column-action' });
	return (
		<div {...blockProps}>
			<TextControl label={__('Label', 'webx-blocks')} value={label} onChange={(v) => setAttributes({ label: v })} />
			<TextControl label={__('Link', 'webx-blocks')} value={href} onChange={(v) => setAttributes({ href: v })} />
			<SelectControl
				label={__('Style', 'webx-blocks')}
				value={variant}
				options={[{ label: 'Solid', value: '' }, { label: 'Ghost', value: 'ghost' }]}
				onChange={(v) => setAttributes({ variant: v })}
			/>
		</div>
	);
}
