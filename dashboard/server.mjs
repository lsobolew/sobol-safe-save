/**
 * WP Plugin Lab dashboard.
 *
 * Plain Node (http + SSE) with zero dependencies - the dashboard is meant to be a tool that works
 * right after `git clone` plus `npm install`, not another front end to maintain.
 * It listens on 127.0.0.1 only: it drives Docker, so there is nothing here to expose to a network.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { paths, ensureDir } from '../cli/lib/paths.mjs';
import { resolveMatrix, selectTargets } from '../cli/lib/matrix.mjs';
import {
	compose,
	serviceStatus,
	syncCompose,
	withProfiles,
	ADMIN_USER,
	ADMIN_PASSWORD,
} from '../cli/lib/docker.mjs';
import { waitForHealthy } from '../cli/lib/health.mjs';
import {
	runSuite,
	resolveEditions,
	availableEditions,
} from '../cli/lib/runner.mjs';
import { runE2e } from '../cli/lib/e2e.mjs';
import { allSummaries } from '../cli/lib/junit.mjs';
import { run as runCommand } from '../cli/commands/reset.mjs';

import { createTestPlan } from '../cli/lib/test-plan.mjs';
import { createJobQueue } from './job-queue.mjs';

const PUBLIC_DIR = path.join( paths.dashboard, 'public' );
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.webm': 'video/webm',
	'.zip': 'application/zip',
	'.txt': 'text/plain; charset=utf-8',
};

const clients = new Set();
const jobs = [];
let activeJob = null;
const queue = createJobQueue();

function broadcast( event, data ) {
	const payload = `event: ${ event }\ndata: ${ JSON.stringify( data ) }\n\n`;
	for ( const res of clients ) {
		res.write( payload );
	}
}

function log( jobId, chunk ) {
	broadcast( 'log', { jobId, chunk } );
}

/** Queues a job - Docker operations run one after another, never in parallel. */
function enqueue( title, worker ) {
	const job = {
		id: `job-${ Date.now() }-${ jobs.length }`,
		title,
		state: 'queued',
		startedAt: null,
		finishedAt: null,
		ok: null,
	};
	jobs.push( job );
	broadcast( 'job', job );

	queue( async () => {
		activeJob = job;
		job.state = 'running';
		job.startedAt = Date.now();
		broadcast( 'job', job );

		try {
			job.ok = await worker( ( chunk ) => log( job.id, chunk ) );
		} catch ( err ) {
			log( job.id, `\nERROR: ${ err.message }\n` );
			job.ok = false;
		}

		job.state = 'done';
		job.finishedAt = Date.now();
		activeJob = null;
		broadcast( 'job', job );
		broadcast( 'state', await buildState() );
	} ).catch( ( err ) => {
		activeJob = null;
		job.state = 'done';
		job.ok = false;
		job.finishedAt = Date.now();
		log( job.id, `\nERROR: ${ err.message }\n` );
		broadcast( 'job', job );
	} );

	return job;
}

async function buildState() {
	const matrix = await resolveMatrix();
	syncCompose( matrix );
	const status = await serviceStatus();
	const results = allSummaries();

	return {
		targets: matrix.targets.map( ( t ) => {
			const row = status[ t.service ];
			const health = ( row?.Health || '' ).toLowerCase();
			const state = ( row?.State || 'absent' ).toLowerCase();

			return {
				id: t.id,
				wp: t.wpVersion,
				wpSpec: t.wpSpec,
				php: t.php,
				port: t.port,
				url: t.url,
				multisite: t.multisite,
				state,
				health,
				ready: state === 'running' && health === 'healthy',
				adminUrl: `${ t.url }/wp-admin/`,
			};
		} ),
		editions: availableEditions(),
		themes: matrix.themes.available.map( ( theme ) => ( {
			slug: theme.slug,
			alias: theme.alias,
			type: theme.type,
		} ) ),
		suites: [ 'unit', 'integration', 'e2e', 'types', 'lint', 'analyse', 'plugin-check' ],
		results,
		jobs: jobs.slice( -30 ),
		activeJobId: activeJob?.id ?? null,
		credentials: { user: ADMIN_USER, password: ADMIN_PASSWORD },
		mailpitUrl: `http://localhost:${ matrix.ports?.mailpitUi || 8025 }`,
	};
}

function send( res, code, body, type = 'application/json; charset=utf-8' ) {
	res.writeHead( code, { 'Content-Type': type, 'Cache-Control': 'no-store' } );
	res.end( typeof body === 'string' || Buffer.isBuffer( body ) ? body : JSON.stringify( body ) );
}

function readBody( req ) {
	return new Promise( ( resolve ) => {
		let data = '';
		req.on( 'data', ( chunk ) => ( data += chunk ) );
		req.on( 'end', () => {
			try {
				resolve( data ? JSON.parse( data ) : {} );
			} catch {
				resolve( {} );
			}
		} );
	} );
}

function serveStatic( res, root, relative, fallback ) {
	const safe = path
		.normalize( relative )
		.replace( /^(\.\.[/\\])+/, '' )
		.replace( /^\/+/, '' );
	let file = path.join( root, safe || fallback || 'index.html' );

	if ( fs.existsSync( file ) && fs.statSync( file ).isDirectory() ) {
		file = path.join( file, 'index.html' );
	}

	if ( ! fs.existsSync( file ) ) {
		return send( res, 404, 'Not found', 'text/plain; charset=utf-8' );
	}

	send( res, 200, fs.readFileSync( file ), MIME[ path.extname( file ) ] || 'application/octet-stream' );
}

async function handleApi( req, res, url ) {
	if ( url.pathname === '/api/state' ) {
		return send( res, 200, await buildState() );
	}

	if ( url.pathname === '/api/stream' ) {
		res.writeHead( 200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		} );
		res.write( ': connected\n\n' );
		clients.add( res );
		const ping = setInterval( () => res.write( ': ping\n\n' ), 25000 );
		req.on( 'close', () => {
			clearInterval( ping );
			clients.delete( res );
		} );
		return undefined;
	}

	if ( req.method !== 'POST' ) {
		return send( res, 405, { error: 'Method not allowed' } );
	}

	const body = await readBody( req );
	const matrix = await resolveMatrix();

	if ( url.pathname === '/api/run' ) {
		const targets = selectTargets( matrix, body.targets || [] );
		const editions = resolveEditions( body.edition || 'both' );
		const suites = body.suites || [ 'unit' ];
		const plan = createTestPlan( { matrix, targets, editions, suites, themes: body.themes || [] } );

		const job = enqueue(
			`${ suites.join( '+' ) } | ${ targets.map( ( t ) => t.id ).join( ', ' ) }`,
			async ( emit ) => {
				let ok = true;

				for ( const entry of plan ) {
					const options = { matrix, ...entry, onLog: emit };
					const result = await ( entry.suite === 'e2e' ? runE2e( options ) : runSuite( options ) );
					ok = ok && result.ok;
					broadcast( 'state', await buildState() );
				}

				return ok;
			}
		);

		return send( res, 202, { jobId: job.id } );
	}

	const targetAction = url.pathname.match( /^\/api\/targets\/([\w-]+)\/(up|down|reset)$/ );
	if ( targetAction ) {
		const [ , id, action ] = targetAction;
		const [ target ] = selectTargets( matrix, [ id ] );

		const job = enqueue( `${ action } ${ id }`, async ( emit ) => {
			syncCompose( matrix );

			if ( action === 'up' ) {
				const { code } = await compose(
					withProfiles( [ target ], [ 'up', '-d', target.service ] ),
					{ onData: emit }
				);
				if ( code !== 0 ) return false;
				emit( 'Waiting for WordPress to become ready...\n' );
				return waitForHealthy( [ target ] );
			}

			if ( action === 'down' ) {
				const { code } = await compose(
					[ 'rm', '--stop', '--force', target.service ],
					{ onData: emit }
				);
				return code === 0;
			}

			emit( `Resetting ${ id } - dropping the container, volume and databases...\n` );
			const code = await runCommand( [ id ] );
			return code === 0;
		} );

		return send( res, 202, { jobId: job.id } );
	}

	if ( url.pathname === '/api/down-all' ) {
		const job = enqueue( 'down (everything)', async ( emit ) => {
			const { code } = await compose( [ '--profile', 'all', 'down' ], { onData: emit } );
			return code === 0;
		} );
		return send( res, 202, { jobId: job.id } );
	}

	return send( res, 404, { error: 'Unknown endpoint' } );
}

export function startPanel( { port = 7777, host = '127.0.0.1' } = {} ) {
	ensureDir( paths.results );

	const server = http.createServer( async ( req, res ) => {
		const url = new URL( req.url, `http://${ req.headers.host }` );

		try {
			if ( url.pathname.startsWith( '/api/' ) ) {
				return await handleApi( req, res, url );
			}

			// Playwright reports are served straight from disk so they can be opened from the dashboard.
			if ( url.pathname.startsWith( '/reports/' ) ) {
				return serveStatic(
					res,
					path.join( paths.root, 'playwright-report' ),
					url.pathname.replace( '/reports/', '' )
				);
			}

			return serveStatic( res, PUBLIC_DIR, url.pathname.replace( /^\//, '' ) );
		} catch ( err ) {
			return send( res, 500, { error: err.message } );
		}
	} );

	return new Promise( ( resolve ) => {
		server.listen( port, host, () => resolve( { server, port, host } ) );
	} );
}
