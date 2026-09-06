import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, TextareaControl, SelectControl } from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const { blockId, variant, title, body, tone } = attributes;
	const blockProps = useBlockProps({ className: 'webx-block webx-block--notice' });

	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Notice settings', 'webx-blocks')}>
					<TextControl
						label={__('Anchor id', 'webx-blocks')}
						help={__('Optional — used for in-page links.', 'webx-blocks')}
						value={blockId}
						onChange={(v) => setAttributes({ blockId: v })}
					/>
					<SelectControl
						label={__('Section background', 'webx-blocks')}
						value={variant}
						options={[
							{ label: __('Default', 'webx-blocks'), value: '' },
							{ label: __('Alt', 'webx-blocks'), value: 'alt' },
						]}
						onChange={(v) => setAttributes({ variant: v })}
					/>
					<SelectControl
						label={__('Tone', 'webx-blocks')}
						value={tone}
						options={[
							{ label: 'Info', value: 'info' },
							{ label: 'Warn', value: 'warn' },
							{ label: 'Success', value: 'success' },
						]}
						onChange={(v) => setAttributes({ tone: v })}
					/>
				</PanelBody>
			</InspectorControls>
			<div {...blockProps}>
				<div className={'webx-notice-preview is-' + (tone || 'info')}>
					<TextControl
						label={__('Title', 'webx-blocks')}
						value={title}
						onChange={(v) => setAttributes({ title: v })}
					/>
					<TextareaControl
						label={__('Body', 'webx-blocks')}
						value={body}
						onChange={(v) => setAttributes({ body: v })}
					/>
				</div>
			</div>
		</>
	);
}
