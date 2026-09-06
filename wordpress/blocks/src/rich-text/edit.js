import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, ToggleControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/rich-text-item'];
const TEMPLATE = [['webx/rich-text-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, lead, full } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--rich-text' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Rich text settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<ToggleControl label={__('Full width', 'webx-blocks')} checked={full} onChange={(v) => setAttributes({ full: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Paragraphs:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
