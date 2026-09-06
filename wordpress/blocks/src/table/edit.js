import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/table-column', 'webx/table-row'];
const TEMPLATE = [
	['webx/table-column', {}],
	['webx/table-column', {}],
	['webx/table-row', {}],
];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, variant, eyebrow, heading, caption } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--table' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Table settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<SelectControl
						label={__('Section background', 'webx-blocks')}
						value={variant}
						options={[
							{ label: __('Default', 'webx-blocks'), value: '' },
							{ label: __('Alt', 'webx-blocks'), value: 'alt' },
						]}
						onChange={(v) => setAttributes({ variant: v })}
					/>
					<TextControl label={__('Caption', 'webx-blocks')} value={caption} onChange={(v) => setAttributes({ caption: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<p className="webx-block__hint">
					{__('Add "Table column" blocks for the header row, then "Table row" blocks (each containing "Table cell" blocks, one per column, in order):', 'webx-blocks')}
				</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
