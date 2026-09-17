import { resolveMatrix } from '../lib/matrix.mjs';
import { serviceStatus, syncCompose } from '../lib/docker.mjs';
import { log, c } from '../lib/log.mjs';

export async function run() {
	const matrix = await resolveMatrix();
	syncCompose( matrix );
	const status = await serviceStatus();

	log.blank();
	log.info(
		c.bold(
			[
				'TARGET'.padEnd( 9 ),
				'WP'.padEnd( 9 ),
				'PHP'.padEnd( 5 ),
				'STATE'.padEnd( 12 ),
				'URL',
			].join( ' ' )
		)
	);

	for ( const t of matrix.targets ) {
		const row = status[ t.service ];
		const health = ( row?.Health || '' ).toLowerCase();
		const state = ( row?.State || 'absent' ).toLowerCase();
		let label = state;
		if ( state === 'running' ) label = health === 'healthy' ? 'ready' : health || 'starting';
		const colored =
			label === 'ready'
				? c.green( label )
				: label === 'absent'
				? c.dim( label )
				: c.yellow( label );

		log.info(
			[
				t.id.padEnd( 9 ),
				`${ t.wpVersion }${ t.multisite ? ' MS' : '' }`.padEnd( 9 ),
				t.php.padEnd( 5 ),
				colored.padEnd( 12 + ( colored.length - label.length ) ),
				label === 'ready' ? c.cyan( t.url ) : c.dim( t.url ),
			].join( ' ' )
		);
	}
	log.blank();
	return 0;
}
