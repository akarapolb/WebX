import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/intro-feature-item'];
const TEMPLATE = [['webx/intro-feature-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, highlightLabel, highlightText } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--intro-feature' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Intro feature settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('Highlight label', 'webx-blocks')} value={highlightLabel} onChange={(v) => setAttributes({ highlightLabel: v })} />
					<TextControl label={__('Highlight text', 'webx-blocks')} value={highlightText} onChange={(v) => setAttributes({ highlightText: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<p className="webx-block__hint">{__('Body copy is edited via this page\'s own content, not here. Story cards:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
