import { parseArgs, listFlag } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { assertDocker, compose, syncCompose, withProfiles } from '../lib/docker.mjs';
import { waitForHealthy } from '../lib/health.mjs';
import { log, c } from '../lib/log.mjs';

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, {
		booleans: [ 'build', 'all', 'no-wait', 'recreate' ],
	} );
	await assertDocker();

	const matrix = await resolveMatrix();
	const ids = flags.all ? [] : [ ...positional, ...listFlag( flags.targets ) ];
	const targets = selectTargets( matrix, ids );
	syncCompose( matrix );

	log.step(
		`Starting: ${ targets.map( ( t ) => `${ t.id } (WP ${ t.wpVersion }/PHP ${ t.php })` ).join( ', ' ) }`
	);
	log.dim( '   The first run builds the images and downloads WordPress - expect a few minutes.' );

	const args = [ 'up', '-d' ];
	if ( flags.build ) args.push( '--build' );
	if ( flags.recreate ) args.push( '--force-recreate' );
	args.push( ...targets.map( ( t ) => t.service ) );

	const { code } = await compose( withProfiles( targets, args ) );
	if ( code !== 0 ) {
		log.fail( 'docker compose up failed.' );
		return code;
	}

	if ( flags[ 'no-wait' ] ) return 0;

	log.step( 'Waiting for WordPress to become ready...' );
	const ok = await waitForHealthy( targets );
	if ( ok ) {
		log.blank();
		log.dim( `   Login: admin / password   Mailpit: ${ c.cyan( 'http://localhost:8025' ) }` );
	}
	return ok ? 0 : 1;
}
