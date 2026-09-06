import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/page-hero-action'];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, lead } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--page-hero' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Page hero settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<p className="webx-block__hint">{__('Buttons (optional):', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} templateLock={false} />
			</div>
		</>
	);
}
