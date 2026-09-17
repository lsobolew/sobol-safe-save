import { useBlockProps, RichText } from '@wordpress/block-editor';

/**
 * Older shapes of this block, newest first.
 *
 * When WordPress loads a post it tries the current `save` first; if the stored markup does not
 * match, it walks this list and uses the first entry that parses. `migrate` then converts the old
 * attributes into the current ones.
 *
 * The rule that saves you grief: never edit an entry once it has shipped. Add a new one. An entry
 * describes markup that is already sitting in someone's database, and rewriting it means the block
 * that used to load suddenly does not.
 */

interface V1Attributes {
	text: string;
}

/** v1: the message lived in a `text` attribute and there was no tone. */
const v1 = {
	attributes: {
		text: {
			type: 'string' as const,
			source: 'html' as const,
			selector: 'p',
			default: '',
		},
	},

	save( { attributes }: { attributes: V1Attributes } ) {
		return (
			<div { ...useBlockProps.save() }>
				<RichText.Content tagName="p" value={ attributes.text } />
			</div>
		);
	},

	migrate( attributes: V1Attributes ) {
		return { message: attributes.text, tone: 'info' };
	},
};

export default [ v1 ];
