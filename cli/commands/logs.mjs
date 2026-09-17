import { parseArgs, listFlag } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { assertDocker, compose, syncCompose } from '../lib/docker.mjs';

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, { booleans: [ 'follow', 'no-follow' ] } );
	await assertDocker();
	const matrix = await resolveMatrix();
	syncCompose( matrix );
	const targets = selectTargets( matrix, [ ...positional, ...listFlag( flags.targets ) ] );

	const args = [ '--profile', 'all', 'logs', '--tail', String( flags.tail || 200 ) ];
	if ( ! flags[ 'no-follow' ] ) args.push( '--follow' );
	args.push( ...targets.map( ( t ) => t.service ) );

	const { code } = await compose( args, { stdio: 'inherit' } );
	return code;
}
