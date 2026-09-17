/**
 * The "Section" block - a container for other blocks.
 *
 * Nesting is handled by InnerBlocks. The block stays static: the children write their own markup
 * into the post and this block only contributes the wrapper, so there is no PHP involved.
 */
import { registerBlock } from '../shared/register';
import metadata from './block.json';

import Edit from './edit';
import save from './save';
import './editor.scss';

registerBlock( metadata.name, {
	edit: Edit,
	save,
} );
