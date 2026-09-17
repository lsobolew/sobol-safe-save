import { parseArgs, listFlag } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import {
	assertDocker,
	compose,
	composeCapture,
	syncCompose,
	withProfiles,
} from '../lib/docker.mjs';
import { DB_ROOT_PASSWORD, projectName } from '../lib/compose-render.mjs';
import { waitForHealthy } from '../lib/health.mjs';
import { log, UserError } from '../lib/log.mjs';

/**
 * Removes the container, the core volume and both databases of a target, then rebuilds it from
 * scratch. Use it before tests that need a pristine install, and after changing a WordPress
 * version in the matrix.
 */
export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, { booleans: [ 'all', 'no-up' ] } );
	await assertDocker();

	const matrix = await resolveMatrix();
	const ids = flags.all ? [] : [ ...positional, ...listFlag( flags.targets ) ];
	if ( ! ids.length && ! flags.all ) {
		throw new UserError(
			'Name a target to reset (or pass --all), e.g. ./bin/wpx reset latest'
		);
	}
	const targets = selectTargets( matrix, ids );
	syncCompose( matrix );

	log.step( `Resetting: ${ targets.map( ( t ) => t.id ).join( ', ' ) }` );

	await compose( [
		'rm',
		'--stop',
		'--force',
		'--volumes',
		...targets.map( ( t ) => t.service ),
	] );

	const volumes = targets.map( ( t ) => `${ projectName() }_core-${ t.id }` );
	await composeCapture( [ 'ps' ] ); // upewnia sie, ze projekt istnieje
	for ( const vol of volumes ) {
		await composeCapture( [ 'version' ] );
		const { code } = await ( await import( '../lib/proc.mjs' ) ).capture( 'docker', [
			'volume',
			'rm',
			'-f',
			vol,
		] );
		if ( code === 0 ) log.dim( `   removed volume ${ vol }` );
	}

	// The databases live in the shared db container, so only the schemas are dropped.
	const dbUp = await composeCapture( [ 'ps', '--quiet', 'db' ] );

	if ( dbUp.stdout.trim() ) {
		const sql = targets
			.map(
				( t ) =>
					`DROP DATABASE IF EXISTS \\\`${ t.dbName }\\\`; DROP DATABASE IF EXISTS \\\`${ t.testDbName }\\\`;`
			)
			.join( ' ' );

		// MariaDB 11 renamed the client to `mariadb` and no longer ships a `mysql` symlink, so the
		// binary has to be discovered rather than assumed. This used to fail silently, which left
		// the old database in place and made a reset look successful while changing nothing.
		const script =
			`CLIENT="$(command -v mariadb || command -v mysql)"; ` +
			`[ -n "$CLIENT" ] || { echo "no MariaDB/MySQL client in the db container" >&2; exit 1; }; ` +
			`"$CLIENT" -uroot -p${ DB_ROOT_PASSWORD } -e "${ sql }"`;

		const { code } = await compose( [ 'exec', '-T', 'db', 'sh', '-c', script ] );

		if ( code !== 0 ) {
			throw new UserError(
				'Could not drop the databases - the reset would leave the old install in place.'
			);
		}

		log.dim( '   databases dropped' );
	} else {
		log.warn( 'Database container is not running; schemas were left untouched.' );
	}

	if ( flags[ 'no-up' ] ) {
		log.ok( 'Reset done (not restarted).' );
		return 0;
	}

	const { code } = await compose(
		withProfiles( targets, [ 'up', '-d', ...targets.map( ( t ) => t.service ) ] )
	);
	if ( code !== 0 ) return code;

	log.step( 'Waiting for the reinstall to finish...' );
	return ( await waitForHealthy( targets ) ) ? 0 : 1;
}
