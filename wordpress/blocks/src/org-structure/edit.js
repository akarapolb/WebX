import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, ToggleControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/org-structure-item'];
const TEMPLATE = [
	['webx/org-structure-item', {}],
	['webx/org-structure-item', {}],
	['webx/org-structure-item', {}],
];

export default function Edit({ attributes, setAttributes }) {
	const {
		blockId, eyebrow, heading, lead, image,
		councilLabel, councilTitle, councilBody, officeLabel, officeTitle, officeBody,
		schoolsHeading, schoolsLead, sourceEnabled, sourcePostType, sourceMap,
	} = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--org-structure' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Org structure settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('Image URL', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
				</PanelBody>
				<PanelBody title={__('Live WordPress feed', 'webx-blocks')} initialOpen={false}>
					<ToggleControl label={__('Bind bureaus to a live WordPress feed', 'webx-blocks')} checked={sourceEnabled} onChange={(v) => setAttributes({ sourceEnabled: v })} />
					{sourceEnabled && (
						<>
							<TextControl label={__('Content type', 'webx-blocks')} value={sourcePostType} onChange={(v) => setAttributes({ sourcePostType: v })} />
							<TextControl label={__('Mapping', 'webx-blocks')} value={sourceMap} onChange={(v) => setAttributes({ sourceMap: v })} />
						</>
					)}
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Council card:', 'webx-blocks')}</p>
				<TextControl label={__('Label', 'webx-blocks')} value={councilLabel} onChange={(v) => setAttributes({ councilLabel: v })} />
				<TextControl label={__('Title', 'webx-blocks')} value={councilTitle} onChange={(v) => setAttributes({ councilTitle: v })} />
				<TextareaControl label={__('Body', 'webx-blocks')} value={councilBody} onChange={(v) => setAttributes({ councilBody: v })} />
				<p className="webx-block__hint">{__('Office card:', 'webx-blocks')}</p>
				<TextControl label={__('Label', 'webx-blocks')} value={officeLabel} onChange={(v) => setAttributes({ officeLabel: v })} />
				<TextControl label={__('Title', 'webx-blocks')} value={officeTitle} onChange={(v) => setAttributes({ officeTitle: v })} />
				<TextareaControl label={__('Body', 'webx-blocks')} value={officeBody} onChange={(v) => setAttributes({ officeBody: v })} />
				<p className="webx-block__hint">{__('Bureaus grid:', 'webx-blocks')}</p>
				<TextControl label={__('Grid heading', 'webx-blocks')} value={schoolsHeading} onChange={(v) => setAttributes({ schoolsHeading: v })} />
				<TextareaControl label={__('Grid lead', 'webx-blocks')} value={schoolsLead} onChange={(v) => setAttributes({ schoolsLead: v })} />
				{sourceEnabled ? (
					<p className="webx-block__hint">{__('Bureaus come from the live feed above — the items below are ignored until the feed is turned off.', 'webx-blocks')}</p>
				) : null}
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
