/**
 * Builds this plugin's blocks.
 *
 * The heavy lifting lives in the lab (cli/vite/wordpress-blocks.mjs) so that `wpx upgrade` keeps
 * the build toolchain current; this file only says which plugin to build and in which mode.
 */
import { buildBlocks } from '../../cli/vite/wordpress-blocks.mjs';

const watch = process.argv.includes( '--watch' );

await buildBlocks( {
	pluginDir: import.meta.dirname,
	mode: watch ? 'development' : 'production',
	watch,
} );
