import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/vm-strip-item'];
const TEMPLATE = [['webx/vm-strip-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { blockId } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--vm-strip' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Vision/mission strip settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<p className="webx-block__hint">{__('Statements:', 'webx-blocks')}</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
