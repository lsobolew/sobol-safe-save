import { parseArgs } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { ADMIN_USER, ADMIN_PASSWORD } from '../lib/compose-render.mjs';
import { log, c } from '../lib/log.mjs';
import { run as runProc } from '../lib/proc.mjs';

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, { booleans: [ 'print' ] } );
	const matrix = await resolveMatrix();
	const targets = selectTargets( matrix, positional );

	for ( const t of targets ) {
		const url = `${ t.url }/wp-admin/`;
		log.info( `${ c.bold( t.id.padEnd( 9 ) ) } ${ c.cyan( url ) }  (${ ADMIN_USER } / ${ ADMIN_PASSWORD })` );
		if ( ! flags.print && targets.length === 1 ) {
			await runProc( 'open', [ url ], { stdio: 'ignore' } ).catch( () => {} );
		}
	}
	return 0;
}
