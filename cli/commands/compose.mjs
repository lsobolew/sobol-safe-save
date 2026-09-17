import { resolveMatrix } from '../lib/matrix.mjs';
import { syncCompose } from '../lib/docker.mjs';
import { log } from '../lib/log.mjs';
import { paths } from '../lib/paths.mjs';
import path from 'node:path';

export async function run() {
	const matrix = await resolveMatrix();
	const file = syncCompose( matrix );
	log.ok( `Generated ${ path.relative( paths.root, file ) }` );
	for ( const t of matrix.targets ) {
		log.dim(
			`   ${ t.id.padEnd( 8 ) } WP ${ String( t.wpVersion ).padEnd( 8 ) } PHP ${ t.php }  ${ t.url }`
		);
	}
	return 0;
}
