import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, subtitle, lead, action1Label, action1Href, action2Label, action2Href, image } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--about-hero' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('About hero settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('Image URL', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
					<TextControl label={__('Button 1 label', 'webx-blocks')} value={action1Label} onChange={(v) => setAttributes({ action1Label: v })} />
					<TextControl label={__('Button 1 URL', 'webx-blocks')} value={action1Href} onChange={(v) => setAttributes({ action1Href: v })} />
					<TextControl label={__('Button 2 label', 'webx-blocks')} value={action2Label} onChange={(v) => setAttributes({ action2Label: v })} />
					<TextControl label={__('Button 2 URL', 'webx-blocks')} value={action2Href} onChange={(v) => setAttributes({ action2Href: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextControl label={__('Subtitle', 'webx-blocks')} value={subtitle} onChange={(v) => setAttributes({ subtitle: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
			</div>
		</>
	);
}
