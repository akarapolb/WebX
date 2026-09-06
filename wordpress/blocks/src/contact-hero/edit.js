import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { blockId, eyebrow, heading, lead, cta1Label, cta1Url, cta2Label, cta2Url, officeHours, phone, email, address } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--contact-hero' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Contact hero settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('Button 1 label', 'webx-blocks')} value={cta1Label} onChange={(v) => setAttributes({ cta1Label: v })} />
					<TextControl label={__('Button 1 URL', 'webx-blocks')} value={cta1Url} onChange={(v) => setAttributes({ cta1Url: v })} />
					<TextControl label={__('Button 2 label', 'webx-blocks')} value={cta2Label} onChange={(v) => setAttributes({ cta2Label: v })} />
					<TextControl label={__('Button 2 URL', 'webx-blocks')} value={cta2Url} onChange={(v) => setAttributes({ cta2Url: v })} />
					<TextControl label={__('Office hours', 'webx-blocks')} value={officeHours} onChange={(v) => setAttributes({ officeHours: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<TextControl label={__('Phone', 'webx-blocks')} value={phone} onChange={(v) => setAttributes({ phone: v })} />
				<TextControl label={__('Email', 'webx-blocks')} value={email} onChange={(v) => setAttributes({ email: v })} />
				<TextControl label={__('Address', 'webx-blocks')} value={address} onChange={(v) => setAttributes({ address: v })} />
			</div>
		</>
	);
}
