import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, listFlag } from '../lib/args.mjs';
import { paths } from '../lib/paths.mjs';
import { allPackages } from '../lib/runner.mjs';
import { run } from '../lib/proc.mjs';
import { log, c, UserError } from '../lib/log.mjs';

/**
 * Rebuilds the blocks on every change.
 *
 * This is a watching production-shaped build, not a dev server: it writes the same files the
 * release build writes, so WordPress loads them through its normal enqueue path. That keeps the
 * behaviour identical across every version in the matrix and inside the iframed block editor,
 * which a module-injecting dev server cannot promise.
 */
export async function run_dev( argv ) {
	const { flags } = parseArgs( argv, { booleans: [] } );

	const wanted = listFlag( flags.edition );
	const packages = allPackages().filter(
		( pkg ) => ! wanted.length || wanted.includes( pkg.key === 'proaddon' ? 'pro' : 'free' )
	);

	const buildable = packages.filter( ( pkg ) => {
		const manifest = path.join( paths.plugins, pkg.dir, 'package.json' );

		if ( ! fs.existsSync( manifest ) ) return false;

		return Boolean( JSON.parse( fs.readFileSync( manifest, 'utf8' ) ).scripts?.dev );
	} );

	if ( ! buildable.length ) {
		throw new UserError( 'No plugin in this repository has a "dev" script to run.' );
	}

	log.blank();
	log.step( `Watching: ${ buildable.map( ( pkg ) => pkg.dir ).join( ', ' ) }` );
	log.dim( '   Rebuilds on save. Reload the editor to pick up a change. Stop with Ctrl+C.' );
	log.blank();

	const watchers = buildable.map( ( pkg ) =>
		run( 'npm', [ 'run', 'dev' ], {
			cwd: path.join( paths.plugins, pkg.dir ),
			onData: ( chunk ) => process.stdout.write( chunk ),
		} )
	);

	const results = await Promise.all( watchers );
	const failed = results.filter( ( result ) => result.code !== 0 );

	if ( failed.length ) {
		log.fail( 'A watcher exited with an error.' );

		return 1;
	}

	log.blank();
	log.ok( `Stopped watching. Build output is in ${ c.cyan( 'plugins/*/build' ) }.` );

	return 0;
}

export { run_dev as run };
