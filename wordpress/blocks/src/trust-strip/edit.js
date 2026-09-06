import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/trust-strip-item'];
const TEMPLATE = [['webx/trust-strip-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--trust-strip' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Trust strip settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('Accessible label (not visible)', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<p className="webx-block__hint">{__('Items:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
