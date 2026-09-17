import { parseArgs } from '../lib/args.mjs';
import { resolveMatrix } from '../lib/matrix.mjs';
import { assertDocker, syncCompose } from '../lib/docker.mjs';
import { startPanel } from '../../dashboard/server.mjs';
import { run as runProc } from '../lib/proc.mjs';
import { log, c } from '../lib/log.mjs';

export async function run( argv ) {
	const { flags } = parseArgs( argv, { booleans: [ 'no-open' ] } );
	await assertDocker();

	const matrix = await resolveMatrix();
	syncCompose( matrix );

	const port = Number( flags.port || matrix.ports?.dashboard || 7777 );
	const { host } = await startPanel( { port } );
	const url = `http://${ host }:${ port }`;

	log.blank();
	log.ok( `Dashboard running at ${ c.cyan( url ) }` );
	log.dim( '   Listening on 127.0.0.1 only. Stop it with Ctrl+C.' );
	log.blank();

	if ( ! flags[ 'no-open' ] ) {
		await runProc( 'open', [ url ], { stdio: 'ignore' } ).catch( () => {} );
	}

	// The server stays up until Ctrl+C.
	await new Promise( () => {} );
	return 0;
}
