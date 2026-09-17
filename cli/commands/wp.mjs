import { parseArgs } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { assertDocker, syncCompose, wpCli } from '../lib/docker.mjs';
import { log, UserError } from '../lib/log.mjs';

export async function run( argv ) {
	const { positional, rest } = parseArgs( argv );
	if ( ! positional.length ) {
		throw new UserError( 'Name a target, e.g. ./bin/wpx wp latest -- plugin list' );
	}
	const wpArgs = rest && rest.length ? rest : positional.slice( 1 );
	if ( ! wpArgs.length ) {
		throw new UserError( 'No WP-CLI command given. Example: wpx wp latest -- plugin list' );
	}

	await assertDocker();
	const matrix = await resolveMatrix();
	syncCompose( matrix );
	const [ target ] = selectTargets( matrix, [ positional[ 0 ] ] );

	const { code } = await wpCli( target, wpArgs, { stdio: 'inherit' } );
	if ( code !== 0 ) log.dim( `   (wp-cli exited with code ${ code })` );
	return code;
}
