import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { blockId, address, phone, email, hours, mapEmbed } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--contact-info' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Contact info settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<TextControl label={__('Map embed URL', 'webx-blocks')} value={mapEmbed} onChange={(v) => setAttributes({ mapEmbed: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Address', 'webx-blocks')} value={address} onChange={(v) => setAttributes({ address: v })} />
				<TextControl label={__('Phone', 'webx-blocks')} value={phone} onChange={(v) => setAttributes({ phone: v })} />
				<TextControl label={__('Email', 'webx-blocks')} value={email} onChange={(v) => setAttributes({ email: v })} />
				<TextControl label={__('Hours', 'webx-blocks')} value={hours} onChange={(v) => setAttributes({ hours: v })} />
			</div>
		</>
	);
}
