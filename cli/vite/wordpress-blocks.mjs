import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

/**
 * Builds WordPress blocks and editor scripts with Vite.
 *
 * WordPress does not want a bundle that contains React and the editor packages - it wants a script
 * that reaches for the globals it already loaded (`wp.blocks`, `wp.blockEditor`, ...) and an
 * `index.asset.php` listing the script handles it depends on. Without that file
 * `register_block_type()` registers the script with no dependencies and the block never loads.
 *
 * Rather than reimplementing the request-to-global mapping, this reuses the one WordPress ships in
 * @wordpress/dependency-extraction-webpack-plugin. That matters for more than convenience: the
 * mapping carries a list of packages that must NOT be externalized (@wordpress/icons and friends
 * are published as source and have no global), and it keeps working when WordPress changes it.
 *
 * Two kinds of bundle are built the same way:
 *
 *   blocks/<name>/   a block - needs a block.json, which is copied next to the built files
 *   scripts/<name>/  a plain editor script - no block.json, registered by the plugin's own PHP
 *
 * The second kind exists because plenty of plugins add editor UI without owning a block: a
 * `registerPlugin()` sidebar, a `blocks.registerBlockType` filter, an admin screen. Those still
 * need the externals mapping and the generated `index.asset.php`, and nothing else here differs.
 */

/** Loads the official mapping from the plugin's own node_modules. */
function loadExternalsMapping( pluginDir ) {
	const require = createRequire( path.join( pluginDir, 'package.json' ) );

	try {
		// No file extension: the package exposes this subpath through its "exports" map.
		return require( '@wordpress/dependency-extraction-webpack-plugin/lib/util' );
	} catch ( error ) {
		throw new Error(
			`Could not load the WordPress externals mapping: ${ error.message }\n` +
				`If the package is missing, install the plugin dependencies: npm --prefix ${ pluginDir } install`
		);
	}
}

/** The entry file of a bundle directory, whatever extension it uses. */
function entryFile( dir ) {
	return [ 'index.tsx', 'index.ts', 'index.jsx', 'index.js' ]
		.map( ( file ) => path.join( dir, file ) )
		.find( ( file ) => fs.existsSync( file ) );
}

/** Immediate subdirectories of `root`, sorted, described as bundles. */
function bundlesIn( pluginDir, root, accept ) {
	const parent = path.join( pluginDir, root );

	if ( ! fs.existsSync( parent ) ) return [];

	return fs
		.readdirSync( parent, { withFileTypes: true } )
		.filter( ( entry ) => entry.isDirectory() )
		.map( ( entry ) => entry.name )
		.filter( ( name ) => accept( path.join( parent, name ) ) )
		.sort()
		.map( ( name ) => {
			const dir = path.join( parent, name );

			return {
				name,
				dir,
				entry: entryFile( dir ),
				style: fs.existsSync( path.join( dir, 'style.scss' ) )
					? path.join( dir, 'style.scss' )
					: null,
			};
		} );
}

/** Blocks are whatever directories under blocks/ carry a block.json. */
export function discoverBlocks( pluginDir ) {
	return bundlesIn( pluginDir, 'blocks', ( dir ) =>
		fs.existsSync( path.join( dir, 'block.json' ) )
	);
}

/**
 * Editor scripts are whatever directories under scripts/ carry an entry file.
 *
 * Deliberately not gated on a block.json: that is the whole point of this directory. A stray
 * directory with no index.* is skipped rather than failing the build, because scripts/ is also a
 * natural place to keep shared sources that no bundle points at directly.
 */
export function discoverScripts( pluginDir ) {
	return bundlesIn( pluginDir, 'scripts', ( dir ) => Boolean( entryFile( dir ) ) );
}

const identifier = ( value ) =>
	value.replace( /[^a-zA-Z0-9]+(.)?/g, ( _, chr ) => ( chr ? chr.toUpperCase() : '' ) );

/**
 * Rollup plugin emitting index.asset.php and copying the block metadata.
 *
 * @param {object} options
 * @param {object} options.bundle  Bundle descriptor from discoverBlocks()/discoverScripts().
 * @param {object} options.mapping The WordPress externals mapping.
 */
function emitWordPressAssets( { bundle, mapping } ) {
	return {
		name: 'wplab:wordpress-assets',

		generateBundle( _options, output ) {
			const chunk = Object.values( output ).find(
				( item ) => item.type === 'chunk' && item.isEntry
			);

			if ( ! chunk ) return;

			// Rollup lists the untouched external requests here; map them to WordPress script
			// handles. Some externals have no handle at all (plain `react` is pulled in by
			// `react-jsx-runtime`), and those are simply skipped.
			const handles = [
				...new Set(
					( chunk.imports || [] )
						.map( ( request ) => mapping.defaultRequestToHandle( request ) )
						.filter( Boolean )
				),
			].sort();

			const version = crypto
				.createHash( 'sha1' )
				.update( chunk.code )
				.digest( 'hex' )
				.slice( 0, 20 );

			const list = handles.map( ( handle ) => `'${ handle }'` ).join( ', ' );

			this.emitFile( {
				type: 'asset',
				fileName: 'index.asset.php',
				source: `<?php return array('dependencies' => array(${ list }), 'version' => '${ version }');\n`,
			} );

			// block.json and the PHP render template travel next to the built files, because
			// register_block_type() reads the metadata from the build directory. A plain editor
			// script has neither, and then this loop simply does nothing.
			for ( const file of [ 'block.json', 'render.php' ] ) {
				const source = path.join( bundle.dir, file );

				if ( fs.existsSync( source ) ) {
					this.emitFile( {
						type: 'asset',
						fileName: file,
						source: fs.readFileSync( source, 'utf8' ),
					} );
				}
			}
		},
	};
}

/** Vite config for a bundle's script (and its editor styles). */
function scriptConfig( { pluginDir, bundle, mapping, mode } ) {
	const production = mode === 'production';

	return {
		configFile: false,
		root: pluginDir,
		mode,
		logLevel: 'warn',
		define: { 'process.env.NODE_ENV': JSON.stringify( mode ) },
		plugins: [ emitWordPressAssets( { bundle, mapping } ) ],
		build: {
			outDir: path.join( 'build', bundle.name ),
			emptyOutDir: false,
			minify: production,
			sourcemap: ! production,
			cssCodeSplit: false,
			lib: {
				entry: bundle.entry,
				formats: [ 'iife' ],
				// WordPress loads editor scripts as classic scripts, so the output has to be an
				// IIFE rather than an ES module - a module would fail on its bare imports.
				name: identifier( `wplab-${ bundle.name }` ),
				fileName: () => 'index.js',
			},
			rollupOptions: {
				external: ( id ) => Boolean( mapping.defaultRequestToExternal( id ) ),
				output: {
					globals: ( id ) => {
						const external = mapping.defaultRequestToExternal( id );

						return Array.isArray( external ) ? external.join( '.' ) : external;
					},
					assetFileNames: ( info ) =>
						( info.names || [ info.name ] ).some( ( n ) => n?.endsWith( '.css' ) )
							? 'index.css'
							: '[name][extname]',
				},
			},
		},
	};
}

/** Vite config for the front-end stylesheet, built on its own so it never mixes with editor CSS. */
function styleConfig( { pluginDir, bundle, mode } ) {
	return {
		configFile: false,
		root: pluginDir,
		mode,
		logLevel: 'warn',
		build: {
			outDir: path.join( 'build', bundle.name ),
			emptyOutDir: false,
			minify: mode === 'production',
			cssCodeSplit: false,
			lib: {
				entry: bundle.style,
				formats: [ 'es' ],
				fileName: () => 'style-index-stub.js',
			},
			rollupOptions: {
				output: { assetFileNames: 'style-index.css' },
			},
		},
	};
}

/**
 * Builds a set of bundles. Shared by buildBlocks() and buildScripts().
 *
 * @param {object}   options
 * @param {string}   options.pluginDir Plugin root.
 * @param {object[]} options.bundles   Descriptors to build.
 * @param {string}   options.label     What they are called in messages ("block" / "editor script").
 * @param {string}   options.source    Where they were looked for, for the empty-set message.
 * @param {string}   [options.mode]    'production' or 'development'.
 * @param {boolean}  [options.watch]   Keep rebuilding on change.
 * @param {Function} [options.onLog]   Receives progress lines.
 *
 * @return {Promise<{names: string[], watchers: object[]}>}
 */
async function buildBundles( { pluginDir, bundles, label, source, mode, watch, onLog } ) {
	const emit = ( text ) => ( onLog ? onLog( text ) : process.stdout.write( text ) );

	if ( ! bundles.length ) {
		// A plugin that simply has no scripts/ (or no blocks/) is not worth a line on every build.
		// An empty or unbuildable source directory is, because that is somebody's mistake.
		if ( fs.existsSync( path.join( pluginDir, source ) ) ) {
			emit( `No ${ label }s found under ${ source }/ - nothing to build.\n` );
		}

		return { names: [], watchers: [] };
	}

	const mapping = loadExternalsMapping( pluginDir );
	const { build } = await import(
		createRequire( path.join( pluginDir, 'package.json' ) ).resolve( 'vite' )
	);
	const watchers = [];

	for ( const bundle of bundles ) {
		if ( ! bundle.entry ) {
			throw new Error(
				`The ${ label } "${ bundle.name }" has no index.tsx entry (looked in ${ bundle.dir }).`
			);
		}

		// Both builds write into the same directory, so it is cleaned once up front instead of
		// letting the second build empty out what the first one produced.
		fs.rmSync( path.join( pluginDir, 'build', bundle.name ), { recursive: true, force: true } );

		const configs = [ scriptConfig( { pluginDir, bundle, mapping, mode } ) ];

		if ( bundle.style ) configs.push( styleConfig( { pluginDir, bundle, mode } ) );

		for ( const config of configs ) {
			const result = await build(
				watch ? { ...config, build: { ...config.build, watch: {} } } : config
			);

			if ( watch && result && typeof result.on === 'function' ) watchers.push( result );
		}

		// The CSS-only build needs a JS entry to exist at all; the stub it leaves behind is not
		// referenced by anything and would only confuse whoever opens the build directory.
		const stub = path.join( pluginDir, 'build', bundle.name, 'style-index-stub.js' );

		if ( ! watch && fs.existsSync( stub ) ) fs.rmSync( stub );

		emit( `  ${ bundle.name }\n` );
	}

	emit( `${ watch ? 'Watching' : 'Built' } ${ bundles.length } ${ label }(s) [${ mode }]\n` );

	return { names: bundles.map( ( b ) => b.name ), watchers };
}

/**
 * Builds every block in a plugin.
 *
 * @param {object}   options
 * @param {string}   options.pluginDir Plugin root.
 * @param {string}   [options.mode]    'production' or 'development'.
 * @param {boolean}  [options.watch]   Keep rebuilding on change.
 * @param {Function} [options.onLog]   Receives progress lines.
 *
 * @return {Promise<{blocks: string[], watchers: object[]}>}
 */
export async function buildBlocks( { pluginDir, mode = 'production', watch = false, onLog } = {} ) {
	const { names, watchers } = await buildBundles( {
		pluginDir,
		bundles: discoverBlocks( pluginDir ),
		label: 'block',
		source: 'blocks',
		mode,
		watch,
		onLog,
	} );

	return { blocks: names, watchers };
}

/**
 * Builds every plain editor script in a plugin.
 *
 * Output is identical in shape to a block's, so the plugin reads it the same way:
 * `build/<name>/index.js` plus the generated `build/<name>/index.asset.php`. Unlike a block it is
 * the plugin's own PHP that enqueues it, which is why nothing here needs a block.json.
 *
 * @param {object}   options
 * @param {string}   options.pluginDir Plugin root.
 * @param {string}   [options.mode]    'production' or 'development'.
 * @param {boolean}  [options.watch]   Keep rebuilding on change.
 * @param {Function} [options.onLog]   Receives progress lines.
 *
 * @return {Promise<{scripts: string[], watchers: object[]}>}
 */
export async function buildScripts( { pluginDir, mode = 'production', watch = false, onLog } = {} ) {
	const blocks = new Set( discoverBlocks( pluginDir ).map( ( b ) => b.name ) );
	const scripts = discoverScripts( pluginDir );

	// Both kinds land in build/<name>, so a collision would have one silently overwrite the other.
	const clash = scripts.find( ( script ) => blocks.has( script.name ) );

	if ( clash ) {
		throw new Error(
			`"${ clash.name }" exists as both a block and an editor script; ` +
				'they would overwrite each other in build/. Rename one of them.'
		);
	}

	const { names, watchers } = await buildBundles( {
		pluginDir,
		bundles: scripts,
		label: 'editor script',
		source: 'scripts',
		mode,
		watch,
		onLog,
	} );

	return { scripts: names, watchers };
}
