/**
 * The "Item list" block - rendered by PHP.
 *
 * A dynamic block: `save` returns null and render.php produces the markup on every request. Use
 * this shape whenever the output depends on data that can change after the post was saved, which
 * is exactly the case here - the list reflects whatever items exist right now.
 */
import { registerBlock } from '../shared/register';
import metadata from './block.json';

import Edit from './edit';
import './editor.scss';

registerBlock( metadata.name, {
	edit: Edit,
	save: () => null,
} );
