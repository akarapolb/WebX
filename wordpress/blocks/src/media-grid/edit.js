import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, SelectControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/media-grid-item'];
const TEMPLATE = [['webx/media-grid-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, lead, columns, actionLabel, actionUrl } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--media-grid' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Media grid settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<SelectControl label={__('Columns', 'webx-blocks')} value={columns} options={['1', '2', '3', '4'].map((n) => ({ label: n, value: n }))} onChange={(v) => setAttributes({ columns: v })} />
					<TextControl label={__('"View all" label', 'webx-blocks')} value={actionLabel} onChange={(v) => setAttributes({ actionLabel: v })} />
					<TextControl label={__('"View all" URL', 'webx-blocks')} value={actionUrl} onChange={(v) => setAttributes({ actionUrl: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Media cards:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
