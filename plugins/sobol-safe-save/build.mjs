/**
 * Builds this plugin's editor code.
 *
 * The heavy lifting lives in the lab (cli/vite/wordpress-blocks.mjs) so that `wpx upgrade` keeps
 * the build toolchain current; this file only says which plugin to build and in which mode.
 *
 * Sobol Safe Save ships no blocks - its editor UI is a registerPlugin() panel plus a classic-editor
 * script - so `scripts/` is where everything lives. buildBlocks() stays in the call anyway: it
 * costs nothing while blocks/ does not exist, and it means adding a block later needs no change
 * here.
 */
import { buildBlocks, buildScripts } from '../../cli/vite/wordpress-blocks.mjs';

const watch = process.argv.includes( '--watch' );

const options = {
	pluginDir: import.meta.dirname,
	mode: watch ? 'development' : 'production',
	watch,
};

await buildBlocks( options );
await buildScripts( options );
