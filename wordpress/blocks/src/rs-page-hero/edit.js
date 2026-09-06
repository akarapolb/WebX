import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, ToggleControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { blockId, deep, eyebrow, heading, lead } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--rs-page-hero' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Page hero settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<ToggleControl label={__('Deep style', 'webx-blocks')} checked={deep} onChange={(v) => setAttributes({ deep: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
			</div>
		</>
	);
}
