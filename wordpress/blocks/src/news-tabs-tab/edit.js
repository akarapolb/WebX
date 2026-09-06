import { __ } from '@wordpress/i18n';
import { useBlockProps, InnerBlocks, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/news-tabs-side-item'];
const TEMPLATE = [['webx/news-tabs-side-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const {
		tabId, label,
		featuredImage, featuredBadge, featuredDate, featuredCategory, featuredTitle, featuredBody, featuredCtaLabel,
	} = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--news-tabs-tab' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Tab settings', 'webx-blocks')}>
					<TextControl label={__('Tab id', 'webx-blocks')} value={tabId} onChange={(v) => setAttributes({ tabId: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Tab label', 'webx-blocks')} value={label} onChange={(v) => setAttributes({ label: v })} />
				<p className="webx-block__hint">{__('Featured story:', 'webx-blocks')}</p>
				<TextControl label={__('Image URL', 'webx-blocks')} value={featuredImage} onChange={(v) => setAttributes({ featuredImage: v })} />
				<TextControl label={__('Badge', 'webx-blocks')} value={featuredBadge} onChange={(v) => setAttributes({ featuredBadge: v })} />
				<TextControl label={__('Date', 'webx-blocks')} value={featuredDate} onChange={(v) => setAttributes({ featuredDate: v })} />
				<TextControl label={__('Category', 'webx-blocks')} value={featuredCategory} onChange={(v) => setAttributes({ featuredCategory: v })} />
				<TextControl label={__('Title', 'webx-blocks')} value={featuredTitle} onChange={(v) => setAttributes({ featuredTitle: v })} />
				<TextareaControl label={__('Body', 'webx-blocks')} value={featuredBody} onChange={(v) => setAttributes({ featuredBody: v })} />
				<TextControl label={__('CTA label', 'webx-blocks')} value={featuredCtaLabel} onChange={(v) => setAttributes({ featuredCtaLabel: v })} />
				<p className="webx-block__hint">{__('Side items:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
