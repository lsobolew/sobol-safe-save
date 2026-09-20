import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { capture } from '../lib/proc.mjs';
import { resolveMatrix } from '../lib/matrix.mjs';
import { pluginDirs } from '../lib/config.mjs';
import { log, c } from '../lib/log.mjs';
import { paths } from '../lib/paths.mjs';

function portFree( port ) {
	return new Promise( ( resolve ) => {
		const srv = net.createServer();
		srv.once( 'error', () => resolve( false ) );
		srv.once( 'listening', () => srv.close( () => resolve( true ) ) );
		srv.listen( port, '127.0.0.1' );
	} );
}

export async function run() {
	let problems = 0;
	log.blank();
	log.info( c.bold( 'Environment check' ) );
	log.blank();

	const node = process.versions.node;
	const major = Number( node.split( '.' )[ 0 ] );
	major >= 20
		? log.ok( `Node ${ node }` )
		: ( log.fail( `Node ${ node } - version 20+ required` ), problems++ );

	const docker = await capture( 'docker', [ 'info', '--format', '{{.ServerVersion}}' ] );
	if ( docker.code === 0 ) {
		log.ok( `Docker ${ docker.stdout.trim() }` );
	} else {
		log.fail( 'Docker is not responding - start Docker Desktop.' );
		problems++;
	}

	const compose = await capture( 'docker', [ 'compose', 'version', '--short' ] );
	compose.code === 0
		? log.ok( `Docker Compose ${ compose.stdout.trim() }` )
		: ( log.fail( 'docker compose v2 is missing.' ), problems++ );

	// Host PHP is entirely optional - every PHP command runs inside a container.
	const php = await capture( 'php', [ '-r', 'echo PHP_VERSION;' ] );
	if ( php.code === 0 ) {
		log.ok( `Host PHP ${ php.stdout.trim() } (optional)` );
	} else {
		log.warn(
			'Host PHP is missing or broken - this does NOT block anything: every PHP command ' +
				'(composer, phpunit, phpcs, wp-cli) runs inside a container.'
		);
	}

	const matrix = await resolveMatrix();
	log.ok( `Matrix: ${ matrix.targets.length } targets, editions: ${ matrix.editions.join( ', ' ) }` );

	const ports = [
		...matrix.targets.map( ( t ) => ( { label: `target ${ t.id }`, port: t.port } ) ),
		{ label: 'dashboard', port: matrix.ports?.dashboard || 7777 },
		{ label: 'mailpit', port: matrix.ports?.mailpitUi || 8025 },
		{ label: 'database', port: matrix.ports?.database || 13306 },
	];
	const busy = [];
	for ( const p of ports ) {
		if ( ! ( await portFree( p.port ) ) ) busy.push( p );
	}
	if ( busy.length ) {
		log.warn(
			`Ports in use: ${ busy.map( ( p ) => `${ p.port } (${ p.label })` ).join( ', ' ) }` +
				' - unless those are the wplab containers, change the ports in wp-matrix.json.'
		);
	} else {
		log.ok( 'All required ports are free' );
	}

	const plugins = pluginDirs();
	if ( plugins.length ) {
		log.ok(
			`Plugins to mount: ${ plugins
				.map( ( p ) => `${ p.dir } (${ p.edition })` )
				.join( ', ' ) }`
		);
	} else {
		log.warn( 'No plugin directories in plugins/ - run ./bin/wpx init' );
	}

	// The lab itself is a dependency like any other: a repository created from the starter keeps a
	// frozen copy of the tooling until someone runs `wpx upgrade`.
	const labLock = path.join( paths.root, 'lab.lock.json' );

	if ( fs.existsSync( labLock ) ) {
		const lock = JSON.parse( fs.readFileSync( labLock, 'utf8' ) );
		const ageDays = Math.floor(
			( Date.now() - new Date( lock.upgradedAt ).getTime() ) / 86400000
		);

		if ( ageDays > 60 ) {
			log.warn(
				`Lab infrastructure last upgraded ${ ageDays } days ago - run ./bin/wpx upgrade`
			);
		} else {
			log.ok( `Lab infrastructure: ${ lock.commit.slice( 0, 7 ) }, ${ ageDays } days old` );
		}
	} else {
		log.dim( '  Lab infrastructure: never upgraded (./bin/wpx upgrade status)' );
	}

	// Agent skills are part of the setup: an outdated pack quietly teaches outdated WordPress.
	const canonicalSkillsLock = path.join( paths.root, '.agents', 'wplab-skills.lock.json' );
	const legacySkillsLock = path.join( paths.root, '.claude', 'wplab-skills.lock.json' );
	const skillsLock = fs.existsSync( canonicalSkillsLock )
		? canonicalSkillsLock
		: legacySkillsLock;

	if ( fs.existsSync( skillsLock ) ) {
		const lock = JSON.parse( fs.readFileSync( skillsLock, 'utf8' ) );
		const ageDays = Math.floor(
			( Date.now() - new Date( lock.installedAt ).getTime() ) / 86400000
		);

		if ( ageDays > 30 ) {
			log.warn(
				`WordPress agent skills installed ${ ageDays } days ago - run ./bin/wpx skills update`
			);
		} else {
			log.ok( `WordPress agent skills: ${ lock.skills.length } installed, ${ ageDays } days old` );
		}
	} else {
		log.warn( 'WordPress agent skills not installed - run ./bin/wpx skills install' );
	}

	fs.existsSync( paths.compose )
		? log.ok( 'Compose file generated' )
		: log.warn( 'env/docker-compose.gen.yml missing - the first "wpx up" writes it' );

	log.blank();
	problems === 0
		? log.ok( c.green( 'Environment ready.' ) )
		: log.fail( `Problems to fix: ${ problems }` );
	log.blank();
	return problems === 0 ? 0 : 1;
}
