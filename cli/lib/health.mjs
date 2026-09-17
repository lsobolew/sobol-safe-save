import { serviceStatus } from './docker.mjs';
import { log, c } from './log.mjs';

const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

/**
 * Waits for the target containers to report healthy. The entrypoint only touches
 * /var/www/html/.wplab-ready after the core is downloaded and installed, so "healthy" really does
 * mean "WordPress is ready".
 */
export async function waitForHealthy( targets, { timeoutMs = 900000 } = {} ) {
	const deadline = Date.now() + timeoutMs;
	const pending = new Set( targets.map( ( t ) => t.service ) );
	const byService = Object.fromEntries( targets.map( ( t ) => [ t.service, t ] ) );

	while ( pending.size && Date.now() < deadline ) {
		const status = await serviceStatus();
		for ( const service of [ ...pending ] ) {
			const row = status[ service ];
			if ( ! row ) continue;
			const health = ( row.Health || '' ).toLowerCase();
			const state = ( row.State || '' ).toLowerCase();
			if ( health === 'healthy' ) {
				pending.delete( service );
				const t = byService[ service ];
				log.ok( `${ t.id }: WP ${ t.wpVersion } / PHP ${ t.php } -> ${ c.cyan( t.url ) }` );
			} else if ( state === 'exited' || state === 'dead' ) {
				pending.delete( service );
				log.fail(
					`${ byService[ service ].id }: the container stopped. Check: ./bin/wpx logs ${ byService[ service ].id }`
				);
			}
		}
		if ( pending.size ) await sleep( 2000 );
	}

	if ( pending.size ) {
		for ( const service of pending ) {
			log.fail( `${ byService[ service ].id }: timed out waiting for the site to become ready.` );
		}
		return false;
	}
	return true;
}
