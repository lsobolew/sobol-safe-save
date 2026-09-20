import crypto from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import { UserError } from './log.mjs';

export const projectId = ( root, slug ) => `wplab-pg-${ slug }-${ crypto.createHash( 'sha256' ).update( path.resolve( root ) ).digest( 'hex' ).slice( 0, 10 ) }`;

export function playgroundConfig( starter, matrix ) {
	const cfg = starter.playground || {};
	const result = { wp: 'latest', php: matrix.targets.find( ( t ) => t.id === 'latest' )?.php || matrix.targets[ 0 ].php,
		multisite: false, edition: 'both', plugins: [], ports: {}, ...cfg };
	if ( ! /^(latest|\d+\.\d+(\.\d+)?)$/.test( result.wp ) || ! /^\d+\.\d+$/.test( result.php ) ) throw new UserError( 'Invalid playground WP/PHP version.' );
	if ( typeof result.multisite !== 'boolean' || ! [ 'free', 'pro', 'both' ].includes( result.edition ) ) throw new UserError( 'Invalid playground mode or edition.' );
	if ( ! Array.isArray( result.plugins ) || result.plugins.some( ( p ) => typeof p !== 'string' || ! p.trim() ) ) throw new UserError( 'playground.plugins must contain slugs or ZIP paths.' );
	if ( ! result.ports || typeof result.ports !== 'object' || Array.isArray( result.ports ) ) throw new UserError( 'Invalid playground ports.' );
	const seen = new Set();
	for ( const [ key, port ] of Object.entries( result.ports ) ) {
		if ( ! [ 'wordpress', 'mailpit', 'database' ].includes( key ) || ! Number.isInteger( port ) || port < 1024 || port > 65535 || seen.has( port ) ) throw new UserError( 'Invalid or duplicate playground port.' );
		seen.add( port );
	}
	return result;
}

export function selectedPlugins( starter, edition ) {
	if ( ! [ 'free', 'pro', 'both' ].includes( edition ) ) throw new UserError( 'Use --edition=free|pro|both.' );
	if ( edition === 'pro' && ! starter.editions.pro?.enabled ) throw new UserError( 'Pro is not enabled in starter.json.' );
	return [ 'free', 'pro' ].filter( ( key ) => starter.editions[ key ]?.enabled && ( key === 'free' || edition !== 'free' ) )
		.map( ( key ) => starter.editions[ key ].dir );
}

export function assertCompatibleState( state, cfg ) {
	if ( state.wpSpec !== cfg.wp || state.php !== cfg.php || state.multisite !== cfg.multisite ||
		Object.entries( cfg.ports ).some( ( [ key, value ] ) => state.ports[ key ] !== value ) ) {
		throw new UserError( 'Playground configuration changed. Run wpx playground reset to recreate it (deletes sandbox data).' );
	}
}

export const portAvailable = ( port ) => new Promise( ( resolve ) => {
	const server = net.createServer();
	server.once( 'error', () => resolve( false ) );
	server.listen( port, '127.0.0.1', () => server.close( () => resolve( true ) ) );
} );

export async function allocatePorts( configured, available = portAvailable ) {
	const ports = { ...configured };
	const used = new Set( Object.values( configured ) );
	for ( const [ key, base ] of Object.entries( { wordpress: 8080, mailpit: 8081, database: 13308 } ) ) {
		if ( configured[ key ] ) {
			if ( ! await available( configured[ key ] ) ) throw new UserError( `Playground port ${ configured[ key ] } is occupied.` );
			continue;
		}
		let port = base;
		while ( port <= 65535 && ( used.has( port ) || ! await available( port ) ) ) port++;
		if ( port > 65535 ) throw new UserError( 'No free playground port.' );
		ports[ key ] = port;
		used.add( port );
	}
	return ports;
}

export function safeSnapshotName( name ) {
	if ( ! /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test( name || '' ) ) throw new UserError( 'Snapshot name must use letters, digits, hyphens or underscores (max 80).' );
	return name;
}

/** JSON is valid YAML; keep generation independent of project npm dependencies. */
export function renderPlayground( root, work, state ) {
	const image = `wplab/wp:php${ state.php }`;
	const bind = ( source, target, read_only = false ) => ( { type: 'bind', source, target, read_only } );
	return { name: state.project, services: {
		db: { image: 'mariadb:11', environment: { MARIADB_ROOT_PASSWORD: 'wordpress', MARIADB_DATABASE: 'wordpress' },
			ports: [ `127.0.0.1:${ state.ports.database }:3306` ], volumes: [ 'db:/var/lib/mysql' ],
			healthcheck: { test: [ 'CMD', 'healthcheck.sh', '--connect', '--innodb_initialized' ], interval: '2s', timeout: '5s', retries: 60 } },
		mailpit: { image: 'axllent/mailpit:latest', ports: [ `127.0.0.1:${ state.ports.mailpit }:8025` ] },
		wordpress: { image, entrypoint: [ 'bash', '/playground/entrypoint.sh' ], command: [ 'apache2-foreground' ],
			depends_on: { db: { condition: 'service_healthy' }, mailpit: { condition: 'service_started' } },
			ports: [ `127.0.0.1:${ state.ports.wordpress }:80` ],
			environment: { PG_WP_VERSION: state.wpVersion, PG_URL: state.url, PG_MULTISITE: state.multisite ? '1' : '0', PG_PROJECT: state.project },
			volumes: [ 'wordpress:/var/www/html', bind( path.join( root, 'env/playground' ), '/playground', true ),
				bind( path.join( work, 'zips' ), '/zips', true ), bind( path.join( work, 'snapshots' ), '/snapshots' ) ],
			healthcheck: { test: [ 'CMD', 'test', '-f', '/var/www/html/.playground-ready' ], interval: '2s', timeout: '5s', retries: 120 } },
	}, volumes: { db: {}, wordpress: {} } };
}
