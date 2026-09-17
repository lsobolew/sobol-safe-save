import { useBlockProps, RichText } from '@wordpress/block-editor';

import type { CalloutSaveProps } from './types';

/**
 * The markup written into the post content.
 *
 * Any change here has to come with a new entry in deprecated.ts, otherwise every existing post
 * shows "this block contains unexpected or invalid content".
 */
export default function save( { attributes }: CalloutSaveProps ) {
	const { message, tone } = attributes;
	const blockProps = useBlockProps.save( { className: `is-tone-${ tone }` } );

	return (
		<div { ...blockProps }>
			<RichText.Content tagName="p" value={ message } />
		</div>
	);
}
