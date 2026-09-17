/**
 * The "Callout" block - saved into the post content.
 *
 * A static block: `save` writes the final markup into the post, so the HTML lives in the database.
 * That makes it fast (no PHP runs on render) and fragile in one specific way - changing `save`
 * invalidates every post already saved with the old markup. `deprecated.ts` is what keeps those
 * posts working; see the comment there before you touch the output.
 */
import { registerBlock } from '../shared/register';
import metadata from './block.json';

import Edit from './edit';
import save from './save';
import deprecated from './deprecated';
import './editor.scss';

registerBlock( metadata.name, {
	edit: Edit,
	save,
	deprecated,
} );
