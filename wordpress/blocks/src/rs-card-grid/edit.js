import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, SelectControl, ToggleControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/rs-card-grid-item'];
const TEMPLATE = [['webx/rs-card-grid-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, lead, columns, flat, linkLabel } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--rs-card-grid' });

	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Card grid settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<SelectControl label={__('Columns', 'webx-blocks')} value={columns} options={['2', '3', '4'].map((n) => ({ label: n, value: n }))} onChange={(v) => setAttributes({ columns: v })} />
					<ToggleControl label={__('Flat style (no image)', 'webx-blocks')} checked={flat} onChange={(v) => setAttributes({ flat: v })} />
					<TextControl label={__('Card link label', 'webx-blocks')} value={linkLabel} onChange={(v) => setAttributes({ linkLabel: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Cards:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
