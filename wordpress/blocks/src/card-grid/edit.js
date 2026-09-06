import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, SelectControl, ToggleControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/card-grid-item'];
const TEMPLATE = [['webx/card-grid-item', {}]];

// Same postType/map choices VisualBuilder.tsx's own source-binding UI
// offers (webx-studio/components/VisualBuilder.tsx, the "Bind to a live
// WordPress feed" control) — kept in sync by hand, same as every other
// engine/dialect mapping in this system.
const POST_TYPES = ['service', 'publication', 'news', 'faq', 'resource', 'mission', 'org-unit', 'document', 'timeline'];
const MAPS = ['card', 'link', 'faq', 'mission', 'orgunit', 'document', 'timeline', 'dated'];

export default function Edit({ attributes, setAttributes }) {
	const {
		blockId, variant, eyebrow, heading, lead, columns,
		sourceEnabled, sourcePostType, sourceMap, sourceIcon, sourceTag, sourceLimit, sourceOffset,
	} = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--card-grid' });

	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Card grid settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<SelectControl
						label={__('Section background', 'webx-blocks')}
						value={variant}
						options={[{ label: 'Default', value: '' }, { label: 'Alt', value: 'alt' }]}
						onChange={(v) => setAttributes({ variant: v })}
					/>
					<SelectControl
						label={__('Columns', 'webx-blocks')}
						value={columns}
						options={['1', '2', '3', '4'].map((n) => ({ label: n, value: n }))}
						onChange={(v) => setAttributes({ columns: v })}
					/>
				</PanelBody>
				<PanelBody title={__('Live WordPress feed', 'webx-blocks')} initialOpen={false}>
					<ToggleControl
						label={__('Bind to a live WordPress feed', 'webx-blocks')}
						checked={sourceEnabled}
						onChange={(v) => setAttributes({ sourceEnabled: v })}
					/>
					{sourceEnabled && (
						<>
							<SelectControl label={__('Content type', 'webx-blocks')} value={sourcePostType} options={POST_TYPES.map((v) => ({ label: v, value: v }))} onChange={(v) => setAttributes({ sourcePostType: v })} />
							<SelectControl label={__('Mapping', 'webx-blocks')} value={sourceMap} options={MAPS.map((v) => ({ label: v, value: v }))} onChange={(v) => setAttributes({ sourceMap: v })} />
							<TextControl label={__('Icon override', 'webx-blocks')} value={sourceIcon} onChange={(v) => setAttributes({ sourceIcon: v })} />
							<TextControl label={__('Tag override', 'webx-blocks')} value={sourceTag} onChange={(v) => setAttributes({ sourceTag: v })} />
							<TextControl type="number" label={__('Limit', 'webx-blocks')} value={sourceLimit} onChange={(v) => setAttributes({ sourceLimit: Number(v) || 0 })} />
							<TextControl type="number" label={__('Offset', 'webx-blocks')} value={sourceOffset} onChange={(v) => setAttributes({ sourceOffset: Number(v) || 0 })} />
						</>
					)}
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				{sourceEnabled ? (
					<p className="webx-block__hint">{__('Items come from the live feed above — the cards below are ignored until the feed is turned off.', 'webx-blocks')}</p>
				) : null}
				<p className="webx-block__hint">{__('Cards:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
