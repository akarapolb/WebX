import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { blockId, kicker, heading, intro } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--contact-form' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Contact form settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Kicker', 'webx-blocks')} value={kicker} onChange={(v) => setAttributes({ kicker: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Intro', 'webx-blocks')} value={intro} onChange={(v) => setAttributes({ intro: v })} />
				<p className="webx-block__hint">{__('The form fields themselves are fixed and not editable here.', 'webx-blocks')}</p>
			</div>
		</>
	);
}
