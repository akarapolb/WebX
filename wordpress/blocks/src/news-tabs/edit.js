import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/news-tabs-tab'];
const TEMPLATE = [['webx/news-tabs-tab', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, lead, viewAllLabel, viewAllUrl } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--news-tabs' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('News tabs settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('"View all" label', 'webx-blocks')} value={viewAllLabel} onChange={(v) => setAttributes({ viewAllLabel: v })} />
					<TextControl label={__('"View all" URL', 'webx-blocks')} value={viewAllUrl} onChange={(v) => setAttributes({ viewAllUrl: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Tabs (add "News tab" blocks, each with its own featured story and side items):', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
