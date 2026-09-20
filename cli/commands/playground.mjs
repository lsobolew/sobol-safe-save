import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { paths, ensureDir, readJson } from '../lib/paths.mjs';
import { starter, matrixConfig } from '../lib/config.mjs';
import { parseArgs } from '../lib/args.mjs';
import { run as spawn, capture } from '../lib/proc.mjs';
import { buildPackage } from './build.mjs';
import { assertDocker } from '../lib/docker.mjs';
import { UserError, log } from '../lib/log.mjs';
import { playgroundConfig, projectId, selectedPlugins, assertCompatibleState, allocatePorts, portAvailable, safeSnapshotName, renderPlayground } from '../lib/playground-config.mjs';

const work = path.join( paths.work, 'playground' );
const stateFile = path.join( work, 'state.json' );
const composeFile = path.join( work, 'compose.json' );
const hash = ( data ) => crypto.createHash( 'sha256' ).update( data ).digest( 'hex' );
const writeJson = ( file, value ) => {
	const temporary = `${ file }.${ process.pid }.tmp`;
	fs.writeFileSync( temporary, JSON.stringify( value, null, '\t' ) + '\n' );
	fs.renameSync( temporary, file );
};

async function checked( cmd, args, quiet = false ) {
	const result = await ( quiet ? capture : spawn )( cmd, args );
	if ( result.code !== 0 ) throw new UserError( `${ cmd } failed (${ result.code }). ${ result.stderr || '' }` );
	return result.stdout?.trim() || '';
}

const composeArgs = ( state, args ) => [ 'compose', '-p', state.project, '-f', composeFile, ...args ];
const dc = ( state, args, quiet = false ) => checked( 'docker', composeArgs( state, args ), quiet );
const wp = ( state, args, quiet = false ) => dc( state, [ 'exec', '-T', 'wordpress', 'wp', '--allow-root', '--path=/var/www/html', `--url=${ state.url }`, ...args ], quiet );
const exists = async ( state, args ) => ( await capture( 'docker', composeArgs( state, [ 'exec', '-T', 'wordpress', 'wp', '--allow-root', `--url=${ state.url }`, ...args ] ) ) ).code === 0;

export function validateZipEntries( entries ) {
	const names = entries.trim().split( /\r?\n/ );
	if ( ! entries.trim() || names.some( ( name ) => name.startsWith( '/' ) || name.includes( '\\' ) || name.includes( ':' ) || name.split( '/' ).includes( '..' ) ) ) throw new UserError( 'Unsafe ZIP paths.' );
	const roots = new Set( names.map( ( name ) => name.split( '/' )[ 0 ] ) );
	if ( roots.size !== 1 || ! /^[a-z][a-z0-9-]*$/.test( [ ...roots ][ 0 ] ) ) throw new UserError( 'ZIP must contain one plugin directory with a valid slug.' );
	return [ ...roots ][ 0 ];
}

async function confirm( message, yes ) {
	if ( yes === true ) return;
	if ( ! process.stdin.isTTY ) throw new UserError( `${ message } Pass --yes to confirm.` );
	const prompt = createInterface( { input: process.stdin, output: process.stdout } );
	try {
		if ( await prompt.question( `${ message } Type yes: ` ) !== 'yes' ) throw new UserError( 'Cancelled.' );
	} finally { prompt.close(); }
}

async function ensureImage( php ) {
	const image = `wplab/wp:php${ php }`;
	if ( ( await capture( 'docker', [ 'image', 'inspect', image ] ) ).code !== 0 ) {
		await checked( 'docker', [ 'build', '--build-arg', `PHP_VERSION=${ php }`, '-t', image, paths.env ] );
	}
	return image;
}

async function concreteVersion( spec ) {
	if ( spec !== 'latest' ) return spec;
	const response = await fetch( 'https://api.wordpress.org/core/version-check/1.7/', { signal: AbortSignal.timeout( 15000 ) } );
	if ( ! response.ok ) throw new UserError( 'Could not resolve the latest stable WordPress. Retry or set playground.wp explicitly (downloads still require network access).' );
	const { offers } = await response.json();
	const version = offers?.find( ( offer ) => offer.response === 'upgrade' && /^\d+\.\d+(\.\d+)?$/.test( offer.current ) )?.current;
	if ( ! version ) throw new UserError( 'WordPress API returned no stable release.' );
	return version;
}

function savedState( expectedProject ) {
	if ( ! fs.existsSync( stateFile ) ) return null;
	const state = readJson( stateFile );
	if ( state.project !== expectedProject ) throw new UserError( 'Playground state belongs to a different repository path. Do not reuse its volumes.' );
	return state;
}

async function createState( cfg, project ) {
	const reserved = await dockerPorts();
	const state = { project, wpSpec: cfg.wp, wpVersion: await concreteVersion( cfg.wp ), php: cfg.php, multisite: cfg.multisite,
		ports: await allocatePorts( cfg.ports, async ( port ) => ! reserved.has( port ) && await portAvailable( port ) ), createdAt: new Date().toISOString() };
	state.url = `http://localhost:${ state.ports.wordpress }`;
	writeJson( stateFile, state );
	return state;
}

// Docker Desktop may publish ports inside its VM without a host TCP listener we can detect.
async function dockerPorts( excludeProject ) {
	const ids = await checked( 'docker', [ 'ps', '-q' ], true );
	if ( ! ids ) return new Set();
	const containers = JSON.parse( await checked( 'docker', [ 'inspect', ...ids.split( /\s+/ ) ], true ) );
	return new Set( containers.filter( ( c ) => c.Config.Labels?.[ 'com.docker.compose.project' ] !== excludeProject )
		.flatMap( ( c ) => Object.values( c.NetworkSettings.Ports || {} ).flatMap( ( bindings ) => ( bindings || [] ).map( ( b ) => Number( b.HostPort ) ) ) ) );
}

async function assertWritableSite( state ) {
	const id = await dc( state, [ 'ps', '-q', 'wordpress' ], true );
	if ( ! id ) throw new UserError( 'Playground is not running. Run wpx playground up.' );
	const [ container ] = JSON.parse( await checked( 'docker', [ 'inspect', id ], true ) );
	if ( container.Config.Labels[ 'com.docker.compose.project' ] !== state.project ) throw new UserError( 'Wrong Docker project.' );
	const pluginPath = '/var/www/html/wp-content/plugins';
	if ( container.Mounts.some( ( mount ) => mount.Type === 'bind' &&
		( pluginPath === mount.Destination || pluginPath.startsWith( mount.Destination + '/' ) || mount.Destination.startsWith( pluginPath + '/' ) ) ) ) {
		throw new UserError( 'Refusing to install over bind-mounted plugin sources.' );
	}
	if ( ! container.Mounts.some( ( mount ) => mount.Type === 'volume' && mount.Destination === '/var/www/html' ) ) throw new UserError( 'Playground WordPress must live in a named volume.' );
	const real = await dc( state, [ 'exec', '-T', 'wordpress', 'readlink', '-f', pluginPath ], true );
	if ( real !== pluginPath ) throw new UserError( 'Refusing a symlinked plugin directory.' );
	const links = await dc( state, [ 'exec', '-T', 'wordpress', 'find', pluginPath, '-maxdepth', '1', '-type', 'l', '-print' ], true );
	if ( links ) throw new UserError( 'Refusing symlinked plugins in the sandbox.' );
}

const fixPerms = ( state ) => dc( state, [ 'exec', '-T', 'wordpress', 'chown', '-R', 'www-data:www-data', '/var/www/html/wp-content', '/var/www/html/.htaccess' ] );

async function install( state, input, { configured = false, root = process.cwd(), network = false, protectedSlugs = [] } = {} ) {
	await assertWritableSite( state );
	let target = input;
	let slug;
	if ( /\.zip$/i.test( input ) || fs.existsSync( path.resolve( root, input ) ) ) {
		const file = path.resolve( root, input );
		if ( ! fs.existsSync( file ) || ! fs.statSync( file ).isFile() || ! /\.zip$/i.test( file ) ) throw new UserError( `ZIP not found: ${ file }` );
		const bytes = fs.readFileSync( file );
		const name = `${ hash( bytes ) }.zip`;
		fs.copyFileSync( file, path.join( work, 'zips', name ) );
		target = `/zips/${ name }`;
		slug = validateZipEntries( await dc( state, [ 'exec', '-T', 'wordpress', 'unzip', '-Z', '-1', target ], true ) );
	} else {
		if ( ! /^[a-z][a-z0-9-]*$/.test( input ) ) throw new UserError( 'Expected a WordPress.org slug or an existing local .zip file.' );
		slug = input;
	}
	const activation = network ? '--activate-network' : '--activate';
	if ( protectedSlugs.includes( slug ) ) throw new UserError( `${ slug } is managed by --edition, not playground.plugins.` );
	try {
		if ( configured && await exists( state, [ 'plugin', 'is-installed', slug ] ) ) {
			await wp( state, [ 'plugin', 'activate', slug, ...( network ? [ '--network' ] : [] ) ] );
		} else {
			await wp( state, [ 'plugin', 'install', target, activation, ...( target.startsWith( '/zips/' ) ? [ '--force' ] : [] ) ] );
		}
	} finally { await fixPerms( state ); }
}

async function packageCurrent( state, s, edition ) {
	const image = await ensureImage( state.php );
	const out = ensureDir( path.join( work, 'package' ) );
	const packages = [];
	for ( const dir of selectedPlugins( s, edition ) ) {
		log.step( `Building ZIP: ${ dir }` );
		const pkg = await buildPackage( dir, async ( script ) => {
			const result = await spawn( 'docker', [ 'run', '--rm', '--entrypoint', 'bash',
				'--mount', `type=bind,src=${ path.join( paths.plugins, dir ) },dst=/var/www/html/wp-content/plugins/${ dir },readonly`,
				'--mount', `type=bind,src=${ out },dst=/wplab`, image, '-lc', script ] );
			return result.code === 0;
		} );
		const zip = path.join( out, 'build', pkg.zipName );
		ensureDir( path.join( paths.root, 'dist' ) );
		fs.copyFileSync( zip, path.join( paths.root, 'dist', pkg.zipName ) );
		packages.push( zip );
	}
	return packages;
}

async function up( state, cfg, s, edition ) {
	assertCompatibleState( state, cfg );
	const foreignPorts = await dockerPorts( state.project );
	for ( const port of Object.values( state.ports ) ) if ( foreignPorts.has( port ) ) throw new UserError( `Saved playground port ${ port } belongs to another Docker project. Configure new ports and reset.` );
	const running = await dc( state, [ 'ps', '--status', 'running', '-q' ], true );
	if ( ! running ) {
		for ( const port of Object.values( state.ports ) ) if ( ! await portAvailable( port ) ) throw new UserError( `Saved playground port ${ port } is occupied. Stop its owner or configure new ports and reset.` );
	}
	// Build before modifying the site's installed plugin versions.
	const packages = await packageCurrent( state, s, edition );
	await dc( state, [ 'up', '-d', '--wait', '--wait-timeout', '240' ] );
	await assertWritableSite( state );
	await install( state, 'user-switching', { configured: true, network: state.multisite } );
	for ( const zip of packages ) await install( state, zip );
	if ( edition === 'free' && s.editions.pro?.dir && await exists( state, [ 'plugin', 'is-installed', s.editions.pro.dir ] ) ) {
		await wp( state, [ 'plugin', 'deactivate', s.editions.pro.dir ] );
	}
	const protectedSlugs = Object.values( s.editions ).filter( ( e ) => e?.dir ).map( ( e ) => e.dir );
	for ( const plugin of cfg.plugins ) await install( state, plugin, { configured: true, root: paths.root, protectedSlugs } );
	await wp( state, [ 'eval-file', '/playground/seed.php' ] );
	info( state );
}

function info( state ) {
	log.info( `Playground: ${ state.url }/wp-admin/\nMailpit: http://localhost:${ state.ports.mailpit }\nDatabase: localhost:${ state.ports.database } (root / wordpress)\nWP ${ state.wpVersion }, PHP ${ state.php }, ${ state.multisite ? 'multisite' : 'single site' }\nInitial users: admin, admin2, editor, author, contributor, subscriber / password\nExisting passwords are not reset. Switch accounts under Users → Switch To.` );
}

async function snapshot( state, name ) {
	safeSnapshotName( name );
	const file = path.join( work, 'snapshots', `${ name }.sql` );
	if ( fs.existsSync( file ) || fs.existsSync( `${ file }.json` ) ) throw new UserError( `Snapshot ${ name } already exists.` );
	await wp( state, [ 'db', 'export', `/snapshots/${ name }.sql`, '--add-drop-table' ] );
	writeJson( `${ file }.json`, { project: state.project, multisite: state.multisite, wpVersion: state.wpVersion, url: state.url, sha256: hash( fs.readFileSync( file ) ) } );
	log.ok( `Database snapshot: ${ file } (files/uploads are not included)` );
}

async function dispatch( action, args, flags, rest, s, cfg, project ) {
	let state = savedState( project );
	if ( action === 'reset' ) {
		if ( ! state ) throw new UserError( 'No playground to reset.' );
		await confirm( `Delete database, uploads and installed plugins for ${ project }? Snapshots are retained.`, flags.yes );
		writeJson( composeFile, renderPlayground( paths.root, work, state ) );
		await dc( state, [ 'down', '--volumes' ] );
		fs.unlinkSync( stateFile );
		state = null;
	}
	if ( ! state && ! [ 'up', 'reset' ].includes( action ) ) throw new UserError( 'No playground yet. Run wpx playground.' );
	state ||= await createState( cfg, project );
	writeJson( composeFile, renderPlayground( paths.root, work, state ) );
	if ( [ 'up', 'reset' ].includes( action ) ) return up( state, cfg, s, flags.edition || cfg.edition );
	if ( action === 'info' ) return info( state );
	if ( action === 'open' ) {
		info( state );
		const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
		return checked( cmd, [ `${ state.url }/wp-admin/` ] );
	}
	if ( action === 'down' ) return dc( state, [ 'stop' ] );
	if ( action === 'logs' ) return dc( state, [ 'logs', '-f', '--tail=100', 'wordpress' ] );
	if ( action === 'sh' ) return dc( state, [ 'exec', 'wordpress', 'bash' ] );
	if ( action === 'status' ) {
		await dc( state, [ 'ps', '--all' ] );
		info( state );
		if ( ! await dc( state, [ 'ps', '--status', 'running', '-q', 'wordpress' ], true ) ) return;
		await assertWritableSite( state );
		return wp( state, [ 'plugin', 'list' ] );
	}
	await assertWritableSite( state );
	if ( action === 'users' ) return wp( state, [ 'user', 'list', '--fields=ID,user_login,roles,user_email' ] );
	if ( action === 'seed' ) return wp( state, [ 'eval-file', '/playground/seed.php' ] );
	if ( action === 'fix-perms' ) return fixPerms( state );
	if ( action === 'install' ) {
		if ( args.length !== 1 ) throw new UserError( 'Usage: wpx playground install <slug|path.zip>' );
		return install( state, args[ 0 ] );
	}
	if ( action === 'wp' ) {
		if ( ! rest?.length ) throw new UserError( 'Use wpx playground wp -- <WP-CLI arguments>.' );
		try { return await wp( state, rest ); } finally { await fixPerms( state ); }
	}
	if ( action === 'snapshot' ) return snapshot( state, args[ 0 ] || `snapshot-${ Date.now() }` );
	if ( action === 'restore' ) {
		const name = safeSnapshotName( args[ 0 ] );
		const file = path.join( work, 'snapshots', `${ name }.sql` );
		if ( ! fs.existsSync( file ) || ! fs.existsSync( `${ file }.json` ) ) throw new UserError( 'Snapshot or metadata missing.' );
		const meta = readJson( `${ file }.json` );
		if ( meta.project !== project || meta.url !== state.url || meta.multisite !== state.multisite || meta.wpVersion !== state.wpVersion || meta.sha256 !== hash( fs.readFileSync( file ) ) ) throw new UserError( 'Snapshot does not match this playground, WordPress version, or checksum.' );
		await confirm( `Replace the database of ${ project } with ${ name }? Plugin files and uploads stay unchanged.`, flags.yes );
		await snapshot( state, `before-restore-${ Date.now() }` );
		await wp( state, [ 'db', 'import', `/snapshots/${ name }.sql` ] );
		return wp( state, [ 'cache', 'flush' ] );
	}
}

export async function run( argv ) {
	const { positional, flags, rest } = parseArgs( argv, { booleans: [ 'yes', 'help' ] } );
	const action = positional.shift() || 'up';
	if ( flags.help || action === 'help' ) {
		log.info( 'wpx playground [up|down|reset|info|status|open|install|seed|users|snapshot|restore|logs|sh|wp|fix-perms]\nDefault: up (build and install fresh ZIPs, preserving site data).\nup/reset: --edition=free|pro|both\ninstall <slug|path.zip>\nsnapshot [name] / restore <name>\nreset/restore: --yes confirms destructive operations\nwp -- <WP-CLI arguments>\nConfiguration: starter.json -> playground. See docs/playground.md.' );
		return 0;
	}
	if ( ! [ 'up', 'down', 'reset', 'info', 'status', 'open', 'install', 'seed', 'users', 'snapshot', 'restore', 'logs', 'sh', 'wp', 'fix-perms' ].includes( action ) ) throw new UserError( `Unknown playground action: ${ action }` );
	for ( const flag of Object.keys( flags ) ) if ( ! [ 'yes', 'edition' ].includes( flag ) ) throw new UserError( `Unknown playground flag: --${ flag }` );
	if ( flags.yes !== undefined && flags.yes !== true ) throw new UserError( 'Use --yes without a value.' );
	if ( flags.edition && ! [ 'up', 'reset' ].includes( action ) ) throw new UserError( '--edition applies only to up/reset.' );
	if ( positional.length > ( [ 'install', 'snapshot', 'restore' ].includes( action ) ? 1 : 0 ) ) throw new UserError( `Unexpected arguments for playground ${ action }.` );
	const s = starter();
	const cfg = playgroundConfig( s, matrixConfig() );
	selectedPlugins( s, flags.edition || cfg.edition );
	const project = projectId( paths.root, s.slug );
	await assertDocker();
	for ( const name of [ 'zips', 'snapshots' ] ) ensureDir( path.join( work, name ) );
	const mutates = ! [ 'info', 'status', 'users', 'open', 'logs' ].includes( action );
	const lock = path.join( work, 'operation.lock' );
	let owned = false;
	try {
		if ( mutates ) {
			try { fs.writeFileSync( lock, String( process.pid ), { flag: 'wx' } ); owned = true; }
			catch { throw new UserError( `Another playground operation is active. If it crashed, verify its PID in ${ lock } before removing that lock.` ); }
		}
		await dispatch( action, positional, flags, rest, s, cfg, project );
		return 0;
	} finally { if ( owned ) fs.unlinkSync( lock ); }
}
