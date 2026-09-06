import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/service-hub-step', 'webx/service-hub-item'];
const TEMPLATE = [
	['webx/service-hub-step', {}],
	['webx/service-hub-step', {}],
	['webx/service-hub-item', {}],
];

export default function Edit({ attributes, setAttributes }) {
	const {
		blockId, eyebrow, heading, lead, viewAllLabel, viewAllUrl,
		introLabel, introHeading, introLead,
	} = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--service-hub' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Service hub settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('"View all" label', 'webx-blocks')} value={viewAllLabel} onChange={(v) => setAttributes({ viewAllLabel: v })} />
					<TextControl label={__('"View all" URL', 'webx-blocks')} value={viewAllUrl} onChange={(v) => setAttributes({ viewAllUrl: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Intro panel:', 'webx-blocks')}</p>
				<TextControl label={__('Intro label', 'webx-blocks')} value={introLabel} onChange={(v) => setAttributes({ introLabel: v })} />
				<TextControl label={__('Intro heading', 'webx-blocks')} value={introHeading} onChange={(v) => setAttributes({ introHeading: v })} />
				<TextareaControl label={__('Intro lead', 'webx-blocks')} value={introLead} onChange={(v) => setAttributes({ introLead: v })} />
				<p className="webx-block__hint">
					{__('Add "Service hub step" blocks (numbered steps in the intro panel) and "Service hub item" blocks (the service cards):', 'webx-blocks')}
				</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
