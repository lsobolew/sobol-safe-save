import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, listFlag } from '../lib/args.mjs';
import { paths, ensureDir, readJson, writeJson } from '../lib/paths.mjs';
import { starter } from '../lib/config.mjs';
import { syncCheckout as gitSync, remoteHead } from '../lib/git-source.mjs';
import { log, c, UserError } from '../lib/log.mjs';

const DEFAULTS = {
	repo: 'https://github.com/WordPress/agent-skills.git',
	// WordPress projects name their default branch "trunk", not "main".
	ref: '',
	targets: [ 'claude' ],
	install: [],
};

const CHECKOUT = () => path.join( paths.cache, 'agent-skills' );

/** Skills maintained in this repository, as opposed to the ones installed from WordPress. */
const OWN_SKILLS = [ 'wp-plugin-lab', 'create-wp-plugin', 'wp-org-release' ];
const LOCK_FILE = () => path.join( paths.root, '.claude', 'wplab-skills.lock.json' );

function config() {
	const configured = starter().skills || {};

	return {
		...DEFAULTS,
		...configured,
		targets: configured.targets?.length ? configured.targets : DEFAULTS.targets,
		install: configured.install?.length ? configured.install : DEFAULTS.install,
	};
}

function readLock() {
	const file = LOCK_FILE();

	return fs.existsSync( file ) ? readJson( file ) : null;
}

/** Clones or fast-forwards the skills checkout; the git mechanics live in lib/git-source.mjs. */
async function syncCheckout( cfg, { onLog } = {} ) {
	const checkout = await gitSync( {
		repo: cfg.repo,
		ref: cfg.ref,
		name: 'agent-skills',
		label: 'skills repository',
		onLog,
	} );

	cfg.ref = checkout.ref;

	return checkout;
}

/** Skill names available in the checkout. */
function availableSkills( dir ) {
	const skillsDir = path.join( dir, 'skills' );

	if ( ! fs.existsSync( skillsDir ) ) return [];

	return fs
		.readdirSync( skillsDir, { withFileTypes: true } )
		.filter( ( entry ) => entry.isDirectory() )
		.map( ( entry ) => entry.name )
		.sort();
}

async function install( argv ) {
	const { flags } = parseArgs( argv, { booleans: [ 'all', 'dry-run' ] } );
	const cfg = config();

	const checkout = await syncCheckout( cfg );
	const available = availableSkills( checkout.dir );

	const requested = flags.all
		? available
		: listFlag( flags.skills ).length
		? listFlag( flags.skills )
		: cfg.install;

	const wanted = requested.length ? requested : available;
	const unknown = wanted.filter( ( name ) => ! available.includes( name ) );

	if ( unknown.length ) {
		throw new UserError(
			`Unknown skills: ${ unknown.join( ', ' ) }.\nAvailable: ${ available.join( ', ' ) }`
		);
	}

	log.step( 'Building the skill pack' );
	const build = await spawn( 'node', [ 'shared/scripts/skillpack-build.mjs', '--clean' ], {
		cwd: checkout.dir,
		onData: () => {},
	} );

	if ( build.code !== 0 ) {
		throw new UserError( 'skillpack-build failed.' );
	}

	const targets = listFlag( flags.targets ).length ? listFlag( flags.targets ) : cfg.targets;

	log.step( `Installing ${ wanted.length } skill(s) for: ${ targets.join( ', ' ) }` );

	const args = [
		'shared/scripts/skillpack-install.mjs',
		`--dest=${ paths.root }`,
		`--targets=${ targets.join( ',' ) }`,
		`--skills=${ wanted.join( ',' ) }`,
	];

	if ( flags[ 'dry-run' ] ) args.push( '--dry-run' );

	const { code } = await spawn( 'node', args, { cwd: checkout.dir } );

	if ( code !== 0 ) {
		throw new UserError( 'skillpack-install failed.' );
	}

	if ( flags[ 'dry-run' ] ) return 0;

	const previous = readLock();

	// The lock file lives next to the skills rather than inside them: the installer runs in
	// "replace" mode and wipes the target directory on every update.
	ensureDir( path.dirname( LOCK_FILE() ) );
	writeJson( LOCK_FILE(), {
		repo: cfg.repo,
		ref: cfg.ref,
		commit: checkout.commit,
		committedAt: checkout.committedAt,
		installedAt: new Date().toISOString(),
		targets,
		skills: wanted,
	} );

	log.blank();

	if ( previous && previous.commit !== checkout.commit ) {
		log.ok( `Skills updated: ${ previous.commit.slice( 0, 7 ) } -> ${ checkout.commit.slice( 0, 7 ) }` );
		log.dim( '   Review the change with: git diff .claude/skills' );
	} else if ( previous ) {
		log.ok( `Skills already at the newest commit (${ checkout.commit.slice( 0, 7 ) })` );
	} else {
		log.ok( `Installed ${ wanted.length } skill(s) at commit ${ checkout.commit.slice( 0, 7 ) }` );
	}

	log.dim( '   Commit .claude/skills so the whole team gets the same instructions.' );
	log.blank();

	return 0;
}

async function status() {
	const cfg = config();
	const lock = readLock();

	log.blank();
	log.info( c.bold( 'WordPress agent skills' ) );
	log.blank();

	if ( ! lock ) {
		log.warn( 'No skills installed yet - run ./bin/wpx skills install' );
		log.blank();
		return 1;
	}

	const ageDays = Math.floor(
		( Date.now() - new Date( lock.installedAt ).getTime() ) / 86400000
	);

	log.info( `  source     ${ lock.repo } (${ lock.ref })` );
	log.info( `  commit     ${ lock.commit.slice( 0, 7 ) } from ${ lock.committedAt?.slice( 0, 10 ) }` );
	log.info( `  installed  ${ lock.installedAt.slice( 0, 10 ) } (${ ageDays } days ago)` );
	log.info( `  targets    ${ lock.targets.join( ', ' ) }` );
	log.info( `  skills     ${ lock.skills.join( ', ' ) }` );
	log.blank();

	// Ask the remote for the current head without touching the local checkout.
	const head = await remoteHead( cfg.repo, cfg.ref || lock.ref );

	if ( ! head ) {
		log.warn( 'Could not reach the skills repository to check for updates.' );
	} else if ( head === lock.commit ) {
		log.ok( 'Up to date with upstream.' );
	} else {
		log.warn(
			`Upstream moved to ${ head.slice( 0, 7 ) } - run ./bin/wpx skills update`
		);
	}

	log.blank();
	return 0;
}

async function list() {
	const cfg = config();
	const checkout = await syncCheckout( cfg );
	const available = availableSkills( checkout.dir );
	const lock = readLock();
	const installed = new Set( lock?.skills || [] );

	log.blank();
	log.info( c.bold( `Skills available at ${ cfg.repo }` ) );
	log.blank();

	for ( const name of available ) {
		const mark = installed.has( name ) ? c.green( 'installed' ) : c.dim( '-        ' );
		log.info( `  ${ mark }  ${ name }` );
	}

	log.blank();
	log.dim( '   Pick the ones you want in starter.json -> skills.install (empty = all).' );
	log.blank();

	return 0;
}

/**
 * Copies this repository's own skills into the user-level skill directory.
 *
 * Project skills only load once an agent is already inside the repository, which is too late for
 * "clone this starter and build me a plugin" - the agent has to know how to do that before the
 * clone exists. Installed globally, the instructions are available from any directory.
 */
async function installGlobal( argv ) {
	const { flags } = parseArgs( argv, { booleans: [ 'dry-run' ] } );
	const home = process.env.HOME || process.env.USERPROFILE;

	if ( ! home ) {
		throw new UserError( 'Could not determine the home directory.' );
	}

	const target = path.join( home, '.claude', 'skills' );
	const installed = [];

	for ( const name of OWN_SKILLS ) {
		const source = path.join( paths.root, '.claude', 'skills', name );

		if ( ! fs.existsSync( source ) ) continue;

		const destination = path.join( target, name );

		if ( ! flags[ 'dry-run' ] ) {
			fs.rmSync( destination, { recursive: true, force: true } );
			fs.mkdirSync( path.dirname( destination ), { recursive: true } );
			fs.cpSync( source, destination, { recursive: true } );
		}

		installed.push( name );
	}

	log.blank();

	if ( ! installed.length ) {
		log.warn( 'No skills of our own found in .claude/skills.' );
		log.blank();

		return 1;
	}

	log.ok(
		`${ flags[ 'dry-run' ] ? 'Would install' : 'Installed' } ${ installed.join( ', ' ) } into ${ c.cyan(
			target
		) }`
	);
	log.dim( '   They now work from any directory, including an empty one - which is what makes' );
	log.dim( '   "clone the starter and build me a plugin X" a single prompt.' );
	log.dim( '   Re-run this after `wpx upgrade` to pick up newer instructions.' );
	log.blank();

	return 0;
}

export async function run( argv ) {
	const [ sub, ...rest ] = argv;

	switch ( sub ) {
		case undefined:
		case 'install':
		case 'update':
			return install( rest );
		case 'global':
			return installGlobal( rest );
		case 'status':
			return status();
		case 'list':
			return list();
		default:
			throw new UserError(
				`Unknown subcommand "${ sub }". Available: install, update, global, status, list.`
			);
	}
}
