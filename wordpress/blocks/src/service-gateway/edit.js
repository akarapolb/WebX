import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/service-gateway-item', 'webx/service-gateway-step'];
const TEMPLATE = [
	['webx/service-gateway-item', {}],
	['webx/service-gateway-step', {}],
];

export default function Edit({ attributes, setAttributes }) {
	const {
		blockId, eyebrow, heading, lead, viewAllLabel, viewAllUrl,
		mainLabel, mainTitle, mainBody, mainActionLabel, mainHref, processLabel,
	} = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--service-gateway' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Service gateway settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('"View all" label', 'webx-blocks')} value={viewAllLabel} onChange={(v) => setAttributes({ viewAllLabel: v })} />
					<TextControl label={__('"View all" URL', 'webx-blocks')} value={viewAllUrl} onChange={(v) => setAttributes({ viewAllUrl: v })} />
					<TextControl label={__('Process strip label', 'webx-blocks')} value={processLabel} onChange={(v) => setAttributes({ processLabel: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Main service link:', 'webx-blocks')}</p>
				<TextControl label={__('Label', 'webx-blocks')} value={mainLabel} onChange={(v) => setAttributes({ mainLabel: v })} />
				<TextControl label={__('Title', 'webx-blocks')} value={mainTitle} onChange={(v) => setAttributes({ mainTitle: v })} />
				<TextareaControl label={__('Body', 'webx-blocks')} value={mainBody} onChange={(v) => setAttributes({ mainBody: v })} />
				<TextControl label={__('Action label', 'webx-blocks')} value={mainActionLabel} onChange={(v) => setAttributes({ mainActionLabel: v })} />
				<TextControl label={__('Link', 'webx-blocks')} value={mainHref} onChange={(v) => setAttributes({ mainHref: v })} />
				<p className="webx-block__hint">
					{__('Add "Service gateway item" blocks (the service cards) and "Service gateway step" blocks (the numbered process strip):', 'webx-blocks')}
				</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
