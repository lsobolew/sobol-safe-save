import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

/**
 * Builds WordPress blocks with Vite.
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

/** Blocks are whatever directories under blocks/ carry a block.json. */
export function discoverBlocks( pluginDir ) {
	const blocksDir = path.join( pluginDir, 'blocks' );

	if ( ! fs.existsSync( blocksDir ) ) return [];

	return fs
		.readdirSync( blocksDir, { withFileTypes: true } )
		.filter( ( entry ) => entry.isDirectory() )
		.map( ( entry ) => entry.name )
		.filter( ( name ) => fs.existsSync( path.join( blocksDir, name, 'block.json' ) ) )
		.sort()
		.map( ( name ) => {
			const dir = path.join( blocksDir, name );
			const entry = [ 'index.tsx', 'index.ts', 'index.jsx', 'index.js' ]
				.map( ( file ) => path.join( dir, file ) )
				.find( ( file ) => fs.existsSync( file ) );

			return {
				name,
				dir,
				entry,
				style: fs.existsSync( path.join( dir, 'style.scss' ) )
					? path.join( dir, 'style.scss' )
					: null,
			};
		} );
}

const identifier = ( value ) =>
	value.replace( /[^a-zA-Z0-9]+(.)?/g, ( _, chr ) => ( chr ? chr.toUpperCase() : '' ) );

/**
 * Rollup plugin emitting index.asset.php and copying the block metadata.
 *
 * @param {object} options
 * @param {object} options.block   Block descriptor from discoverBlocks().
 * @param {object} options.mapping The WordPress externals mapping.
 */
function emitWordPressAssets( { block, mapping } ) {
	return {
		name: 'wplab:wordpress-assets',

		generateBundle( _options, bundle ) {
			const chunk = Object.values( bundle ).find(
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
			// register_block_type() reads the metadata from the build directory.
			for ( const file of [ 'block.json', 'render.php' ] ) {
				const source = path.join( block.dir, file );

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

/** Vite config for a block's script (and its editor styles). */
function scriptConfig( { pluginDir, block, mapping, mode } ) {
	const production = mode === 'production';

	return {
		configFile: false,
		root: pluginDir,
		mode,
		logLevel: 'warn',
		define: { 'process.env.NODE_ENV': JSON.stringify( mode ) },
		plugins: [ emitWordPressAssets( { block, mapping } ) ],
		build: {
			outDir: path.join( 'build', block.name ),
			emptyOutDir: false,
			minify: production,
			sourcemap: ! production,
			cssCodeSplit: false,
			lib: {
				entry: block.entry,
				formats: [ 'iife' ],
				// WordPress loads editor scripts as classic scripts, so the output has to be an
				// IIFE rather than an ES module - a module would fail on its bare imports.
				name: identifier( `wplab-${ block.name }` ),
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
function styleConfig( { pluginDir, block, mode } ) {
	return {
		configFile: false,
		root: pluginDir,
		mode,
		logLevel: 'warn',
		build: {
			outDir: path.join( 'build', block.name ),
			emptyOutDir: false,
			minify: mode === 'production',
			cssCodeSplit: false,
			lib: {
				entry: block.style,
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
	const emit = ( text ) => ( onLog ? onLog( text ) : process.stdout.write( text ) );
	const blocks = discoverBlocks( pluginDir );

	if ( ! blocks.length ) {
		emit( 'No blocks found under blocks/ - nothing to build.\n' );

		return { blocks: [], watchers: [] };
	}

	const mapping = loadExternalsMapping( pluginDir );
	const { build } = await import( createRequire( path.join( pluginDir, 'package.json' ) ).resolve( 'vite' ) );
	const watchers = [];

	for ( const block of blocks ) {
		const missing = ! block.entry;

		if ( missing ) {
			throw new Error( `Block "${ block.name }" has a block.json but no index.tsx entry.` );
		}

		// Both builds write into the same directory, so it is cleaned once up front instead of
		// letting the second build empty out what the first one produced.
		fs.rmSync( path.join( pluginDir, 'build', block.name ), { recursive: true, force: true } );

		const configs = [ scriptConfig( { pluginDir, block, mapping, mode } ) ];

		if ( block.style ) configs.push( styleConfig( { pluginDir, block, mode } ) );

		for ( const config of configs ) {
			const result = await build(
				watch ? { ...config, build: { ...config.build, watch: {} } } : config
			);

			if ( watch && result && typeof result.on === 'function' ) watchers.push( result );
		}

		// The CSS-only build needs a JS entry to exist at all; the stub it leaves behind is not
		// referenced by anything and would only confuse whoever opens the build directory.
		const stub = path.join( pluginDir, 'build', block.name, 'style-index-stub.js' );

		if ( ! watch && fs.existsSync( stub ) ) fs.rmSync( stub );

		emit( `  ${ block.name }\n` );
	}

	emit( `${ watch ? 'Watching' : 'Built' } ${ blocks.length } block(s) [${ mode }]\n` );

	return { blocks: blocks.map( ( b ) => b.name ), watchers };
}
