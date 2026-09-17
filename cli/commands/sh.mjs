import { parseArgs } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { assertDocker, compose, syncCompose } from '../lib/docker.mjs';
import { UserError } from '../lib/log.mjs';

export async function run( argv ) {
	const { positional, rest } = parseArgs( argv );
	if ( ! positional.length ) {
		throw new UserError( 'Name a target, e.g. ./bin/wpx sh latest -- "php -v"' );
	}
	await assertDocker();
	const matrix = await resolveMatrix();
	syncCompose( matrix );
	const [ target ] = selectTargets( matrix, [ positional[ 0 ] ] );

	const script = ( rest && rest.length ? rest : positional.slice( 1 ) ).join( ' ' );
	if ( ! script ) {
		// With no command we drop into an interactive shell inside the container.
		const { code } = await compose( [ 'exec', target.service, 'bash' ], { stdio: 'inherit' } );
		return code;
	}
	const { code } = await compose( [ 'exec', '-T', target.service, 'bash', '-lc', script ], {
		stdio: 'inherit',
	} );
	return code;
}
