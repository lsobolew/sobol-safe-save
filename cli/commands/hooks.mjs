import path from 'node:path';
import { parseArgs } from '../lib/args.mjs';
import { paths } from '../lib/paths.mjs';
import { capture } from '../lib/proc.mjs';
import { log, c, UserError } from '../lib/log.mjs';

/**
 * Git hooks live in .githooks/ and are switched on through core.hooksPath, so they are versioned
 * with the repository instead of hiding in each developer's .git directory.
 */
export async function run( argv ) {
	const { positional } = parseArgs( argv );
	const action = positional[ 0 ] || 'install';

	if ( action === 'uninstall' ) {
		await capture( 'git', [ '-C', paths.root, 'config', '--unset', 'core.hooksPath' ] );
		log.ok( 'Git hooks disabled.' );

		return 0;
	}

	if ( action !== 'install' && action !== 'status' ) {
		throw new UserError( `Unknown action "${ action }". Available: install, status, uninstall.` );
	}

	if ( action === 'status' ) {
		const { stdout } = await capture( 'git', [ '-C', paths.root, 'config', 'core.hooksPath' ] );
		const value = stdout.trim();

		if ( value ) {
			log.ok( `Git hooks enabled from ${ value }` );
		} else {
			log.warn( 'Git hooks are not enabled - run ./bin/wpx hooks install' );
		}

		return value ? 0 : 1;
	}

	const { code } = await capture( 'git', [
		'-C',
		paths.root,
		'config',
		'core.hooksPath',
		'.githooks',
	] );

	if ( code !== 0 ) {
		throw new UserError( 'Could not set core.hooksPath - is this a git repository?' );
	}

	log.ok( `Git hooks enabled from ${ c.cyan( path.relative( paths.root, path.join( paths.root, '.githooks' ) ) ) }` );
	log.dim( '   pre-commit runs PHPCS on staged plugin files when a container is up.' );

	return 0;
}
