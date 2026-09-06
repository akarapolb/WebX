import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, InnerBlocks } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, SelectControl } from '@wordpress/components';

const ALLOWED_BLOCKS = ['webx/two-column-paragraph', 'webx/two-column-action'];
const TEMPLATE = [
	['webx/two-column-paragraph', {}],
	['webx/two-column-action', {}],
];

export default function Edit({ attributes, setAttributes }) {
	const {
		blockId, variant, eyebrow, heading, lead, actionLabel, actionUrl,
		subheading, image, imageAlt, imageSide,
	} = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--two-column' });
	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Two column settings', 'webx-blocks')}>
					<TextControl label={__('Anchor id', 'webx-blocks')} value={blockId} onChange={(v) => setAttributes({ blockId: v })} />
					<SelectControl
						label={__('Section background', 'webx-blocks')}
						value={variant}
						options={[{ label: 'Default', value: '' }, { label: 'Alt', value: 'alt' }]}
						onChange={(v) => setAttributes({ variant: v })}
					/>
					<SelectControl
						label={__('Image side', 'webx-blocks')}
						value={imageSide}
						options={[{ label: 'Right', value: 'right' }, { label: 'Left', value: 'left' }]}
						onChange={(v) => setAttributes({ imageSide: v })}
					/>
					<TextControl label={__('"View all" label', 'webx-blocks')} value={actionLabel} onChange={(v) => setAttributes({ actionLabel: v })} />
					<TextControl label={__('"View all" URL', 'webx-blocks')} value={actionUrl} onChange={(v) => setAttributes({ actionUrl: v })} />
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<TextControl label={__('Eyebrow', 'webx-blocks')} value={eyebrow} onChange={(v) => setAttributes({ eyebrow: v })} />
				<TextControl label={__('Heading', 'webx-blocks')} value={heading} onChange={(v) => setAttributes({ heading: v })} />
				<TextareaControl label={__('Lead', 'webx-blocks')} value={lead} onChange={(v) => setAttributes({ lead: v })} />
				<TextControl label={__('Subheading', 'webx-blocks')} value={subheading} onChange={(v) => setAttributes({ subheading: v })} />
				<TextControl label={__('Image URL', 'webx-blocks')} value={image} onChange={(v) => setAttributes({ image: v })} />
				<TextControl label={__('Image alt text', 'webx-blocks')} value={imageAlt} onChange={(v) => setAttributes({ imageAlt: v })} />
				<p className="webx-block__hint">
					{__('Add "Two column paragraph" blocks (body text) and "Two column action" blocks (buttons):', 'webx-blocks')}
				</p>
				<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
			</div>
		</>
	);
}
