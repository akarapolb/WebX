import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, SelectControl, ToggleControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/mission-grid-item'];
const TEMPLATE = [['webx/mission-grid-item', {}]];
const POST_TYPES = ['service', 'publication', 'news', 'faq', 'resource', 'mission', 'org-unit', 'document', 'timeline'];
const MAPS = ['card', 'link', 'faq', 'mission', 'orgunit', 'document', 'timeline', 'dated'];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, lead, linkLabel, linkHref, sourceEnabled, sourcePostType, sourceMap } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--mission-grid' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Mission grid settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('"View more" label', 'webx-blocks')} value={linkLabel} onChange={(v) => setAttributes({ linkLabel: v })} />
					<TextControl label={__('"View more" URL', 'webx-blocks')} value={linkHref} onChange={(v) => setAttributes({ linkHref: v })} />
				</PanelBody>
				<PanelBody title={__('Live WordPress feed', 'webx-blocks')} initialOpen={false}>
					<ToggleControl label={__('Bind to a live WordPress feed', 'webx-blocks')} checked={sourceEnabled} onChange={(v) => setAttributes({ sourceEnabled: v })} />
					{sourceEnabled && (
						<>
							<SelectControl label={__('Content type', 'webx-blocks')} value={sourcePostType} options={POST_TYPES.map((v) => ({ label: v, value: v }))} onChange={(v) => setAttributes({ sourcePostType: v })} />
							<SelectControl label={__('Mapping', 'webx-blocks')} value={sourceMap} options={MAPS.map((v) => ({ label: v, value: v }))} onChange={(v) => setAttributes({ sourceMap: v })} />
						</>
					)}
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				{sourceEnabled ? <p className="webx-block__hint">{__('Items come from the live feed above — the cards below are ignored until the feed is turned off.', 'webx-blocks')}</p> : null}
				<p className="webx-block__hint">{__('Mission items:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
