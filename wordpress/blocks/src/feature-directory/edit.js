import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, SelectControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/feature-directory-item'];
const TEMPLATE = [['webx/feature-directory-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const {
		blockId, variant, eyebrow, heading, lead, linkLabel,
		featureLabel, featureTitle, featureBody, featureLinkLabel, featureLinkUrl,
	} = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--feature-directory' });
	const isKnowledge = variant === 'knowledge';

	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Feature directory settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<SelectControl
						label={__('Layout variant', 'webx-blocks')}
						value={variant}
						options={[
							{ label: __('Services (default)', 'webx-blocks'), value: '' },
							{ label: __('Knowledge (feature card + grid)', 'webx-blocks'), value: 'knowledge' },
						]}
						onChange={(v) => setAttributes({ variant: v })}
					/>
					<TextControl
						label={__('Default item link label', 'webx-blocks')}
						help={__('Used by the "knowledge" variant when an item has no link label of its own.', 'webx-blocks')}
						value={linkLabel}
						onChange={(v) => setAttributes({ linkLabel: v })}
					/>
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				{isKnowledge && (
					<div className="webx-block__subpanel">
						<p className="webx-block__hint">{__('Feature card (knowledge variant only):', 'webx-blocks')}</p>
						<TextControl label={__('Feature label', 'webx-blocks')} value={featureLabel} onChange={(v) => setAttributes({ featureLabel: v })} />
						<TextControl label={__('Feature title', 'webx-blocks')} value={featureTitle} onChange={(v) => setAttributes({ featureTitle: v })} />
						<TextareaControl label={__('Feature body', 'webx-blocks')} value={featureBody} onChange={(v) => setAttributes({ featureBody: v })} />
						<TextControl label={__('Feature link label', 'webx-blocks')} value={featureLinkLabel} onChange={(v) => setAttributes({ featureLinkLabel: v })} />
						<TextControl label={__('Feature link URL', 'webx-blocks')} value={featureLinkUrl} onChange={(v) => setAttributes({ featureLinkUrl: v })} />
					</div>
				)}
				<p className="webx-block__hint">{__('Items:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
