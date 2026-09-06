import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { blockId, heading, address, phone, email, hours } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--rs-contact-info' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Contact info settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextControl label={__('Address', 'webx-blocks')} value={address} onChange={(v) => setAttributes({ address: v })} />
				<TextControl label={__('Phone', 'webx-blocks')} value={phone} onChange={(v) => setAttributes({ phone: v })} />
				<TextControl label={__('Email', 'webx-blocks')} value={email} onChange={(v) => setAttributes({ email: v })} />
				<TextControl label={__('Hours', 'webx-blocks')} value={hours} onChange={(v) => setAttributes({ hours: v })} />
			</div>
		</>
	);
}
