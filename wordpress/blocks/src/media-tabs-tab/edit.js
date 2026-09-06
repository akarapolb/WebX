import { __ } from '@wordpress/i18n';
import { useBlockProps, InnerBlocks, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/media-tabs-item'];
const TEMPLATE = [['webx/media-tabs-item', {}]];

export default function Edit({ attributes, setAttributes }) {
	const { tabId, label, kind } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--media-tabs-tab' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Tab settings', 'webx-blocks')}>
					<TextControl label={__('Tab id', 'webx-blocks')} value={tabId} onChange={(v) => setAttributes({ tabId: v })} />
					<SelectControl
						label={__('Kind', 'webx-blocks')}
						help={__('"Media" uses the multimedia card layout; "Pub" uses the publications/e-book layout.', 'webx-blocks')}
						value={kind}
						options={[
							{ label: 'Pub', value: 'pub' },
							{ label: 'Media', value: 'media' },
						]}
						onChange={(v) => setAttributes({ kind: v })}
					/>
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Tab label', 'webx-blocks')} value={label} onChange={(v) => setAttributes({ label: v })} />
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
