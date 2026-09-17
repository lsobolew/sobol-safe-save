import { parseArgs, listFlag } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { assertDocker, compose, syncCompose } from '../lib/docker.mjs';
import { log } from '../lib/log.mjs';

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, {
		booleans: [ 'all', 'volumes', 'v' ],
	} );
	await assertDocker();

	const matrix = await resolveMatrix();
	syncCompose( matrix );
	const ids = [ ...positional, ...listFlag( flags.targets ) ];
	const withVolumes = Boolean( flags.volumes || flags.v );

	// With no targets given we take down the whole project, database and Mailpit included.
	if ( ! ids.length ) {
		log.step( `Stopping the whole project${ withVolumes ? ', data included' : '' }` );
		const args = [ '--profile', 'all', 'down' ];
		if ( withVolumes ) args.push( '--volumes' );
		const { code } = await compose( args );
		return code;
	}

	const targets = selectTargets( matrix, ids );
	log.step( `Stopping: ${ targets.map( ( t ) => t.id ).join( ', ' ) }` );
	const { code } = await compose( [
		'rm',
		'--stop',
		'--force',
		...( withVolumes ? [ '--volumes' ] : [] ),
		...targets.map( ( t ) => t.service ),
	] );
	return code;
}
