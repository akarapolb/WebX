import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';

const ALLOWED_BLOCKS = ['webx/table-cell'];
const TEMPLATE = [
	['webx/table-cell', {}],
	['webx/table-cell', {}],
];

export default function Edit() {
	const blockProps = useBlockProps({ className: 'webx-block webx-block--table-row' });
	return (
		<div {...blockProps}>
			<InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} orientation="horizontal" />
		</div>
	);
}
