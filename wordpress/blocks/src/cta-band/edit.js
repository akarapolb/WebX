import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/cta-band-action'];
const TEMPLATE = [['webx/cta-band-action', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, body } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--cta-band' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('CTA band settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Body', 'webx-blocks')} value={body} onChange={(v) => setAttributes({ body: v })} />
				<p className="webx-block__hint">{__('Buttons:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
