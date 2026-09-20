import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, listFlag } from '../lib/args.mjs';
import { paths, ensureDir, readJson, writeJson } from '../lib/paths.mjs';
import { starter } from '../lib/config.mjs';
import { syncCheckout as gitSync, remoteHead } from '../lib/git-source.mjs';
import { log, c, UserError } from '../lib/log.mjs';
import { run as spawn } from '../lib/proc.mjs';
import { adaptSkillDirectory, validateSkillResources, resolveSkillDependencies } from '../lib/skill-paths.mjs';

const DEFAULTS = {
	repo: 'https://github.com/WordPress/agent-skills.git',
	// WordPress projects name their default branch "trunk", not "main".
	ref: '',
	targets: [ 'codex', 'claude' ],
	install: [],
};

const TARGETS = {
	codex: {
		build: 'codex',
		source: [ 'codex', '.codex', 'skills' ],
		destination: [ '.agents', 'skills' ],
	},
	claude: {
		build: 'claude',
		source: [ 'claude', '.claude', 'skills' ],
		destination: [ '.claude', 'skills' ],
	},
	vscode: {
		build: 'vscode',
		source: [ 'vscode', '.github', 'skills' ],
		destination: [ '.github', 'skills' ],
	},
	cursor: {
		build: 'cursor',
		source: [ 'cursor', '.cursor', 'skills' ],
		destination: [ '.cursor', 'skills' ],
	},
	antigravity: {
		build: 'antigravity',
		source: [ 'antigravity', '.agents', 'skills' ],
		destination: [ '.agents', 'skills' ],
	},
};

/** Skills maintained in this repository, as opposed to the ones installed from WordPress. */
const OWN_SKILLS = [ 'wp-plugin-lab', 'create-wp-plugin', 'wp-org-release' ];
const SKILLS_DIR = () => path.join( paths.root, '.agents', 'skills' );
const LOCK_FILE = () => path.join( paths.root, '.agents', 'wplab-skills.lock.json' );
const LEGACY_LOCK_FILE = () => path.join( paths.root, '.claude', 'wplab-skills.lock.json' );

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
	const file = fs.existsSync( LOCK_FILE() ) ? LOCK_FILE() : LEGACY_LOCK_FILE();

	return fs.existsSync( file ) ? readJson( file ) : null;
}

function targetConfig( name ) {
	const target = TARGETS[ name ];

	if ( ! target ) {
		throw new UserError(
			`Unknown skill target "${ name }". Available: ${ Object.keys( TARGETS ).join( ', ' ) }.`
		);
	}

	return target;
}

function copySkill( source, destination ) {
	fs.rmSync( destination, { recursive: true, force: true } );
	fs.mkdirSync( path.dirname( destination ), { recursive: true } );
	fs.cpSync( source, destination, { recursive: true } );
}

function ownSkillSource( name ) {
	const canonical = path.join( SKILLS_DIR(), name );
	const legacy = path.join( paths.root, '.claude', 'skills', name );

	return fs.existsSync( canonical ) ? canonical : legacy;
}

function migrateLegacyOwnSkills( dryRun ) {
	for ( const name of OWN_SKILLS ) {
		const canonical = path.join( SKILLS_DIR(), name );
		const legacy = path.join( paths.root, '.claude', 'skills', name );

		if ( fs.existsSync( canonical ) || ! fs.existsSync( legacy ) ) continue;

		log.info( `  ${ dryRun ? 'Would migrate' : 'Migrating' } ${ name } to .agents/skills` );
		if ( ! dryRun ) copySkill( legacy, canonical );
	}
}

export function installTargets( checkoutDir, targets, wanted, previous, dryRun, root = paths.root ) {
	const dist = path.join( checkoutDir, 'dist' );
	const canonicalRoot = path.join( root, '.agents', 'skills' );
	const obsolete = ( previous?.skills || [] ).filter( ( name ) => ! wanted.includes( name ) );
	for ( const skill of [ ...wanted, ...obsolete ] ) {
		if ( ! /^[a-z][a-z0-9-]*$/.test( skill ) || OWN_SKILLS.includes( skill ) ) {
			throw new UserError( `Invalid upstream skill name: ${ skill }` );
		}
	}

	for ( const name of targets ) {
		const target = targetConfig( name );
		const sourceRoot = path.join( dist, ...target.source );
		const destinationRoot = path.join( root, ...target.destination );

		if ( dryRun ) {
			log.info( `  Would install ${ wanted.length } skill(s) to ${ path.relative( root, destinationRoot ) }` );
			continue;
		}

		for ( const skill of obsolete ) {
			fs.rmSync( path.join( destinationRoot, skill ), { recursive: true, force: true } );
		}

		for ( const skill of wanted ) {
			copySkill( path.join( sourceRoot, skill ), path.join( destinationRoot, skill ) );
			adaptSkillDirectory( path.join( destinationRoot, skill ), '.agents/skills' );
		}

		// Repository-owned skills are authored in the canonical Codex directory and mirrored to
		// every configured target. Upstream updates never overwrite them.
		if ( destinationRoot !== canonicalRoot ) {
			for ( const skill of OWN_SKILLS ) {
				const source = path.join( canonicalRoot, skill );
				if ( fs.existsSync( source ) ) {
					copySkill( source, path.join( destinationRoot, skill ) );
				}
			}
		}

		log.ok( `Installed ${ wanted.length } upstream skill(s) for ${ name } to ${ path.relative( root, destinationRoot ) }` );
	}
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

	const selected = requested.length ? requested : available;
	const unknown = selected.filter( ( name ) => ! available.includes( name ) );

	if ( unknown.length ) {
		throw new UserError(
			`Unknown skills: ${ unknown.join( ', ' ) }.\nAvailable: ${ available.join( ', ' ) }`
		);
	}

	const wanted = resolveSkillDependencies( checkout.dir, selected );
	const dependencies = wanted.filter( ( name ) => ! selected.includes( name ) );
	if ( dependencies.length ) log.info( `Including required skills: ${ dependencies.join( ', ' ) }` );
	log.step( 'Building the skill pack' );
	const selectedTargets = listFlag( flags.targets ).length ? listFlag( flags.targets ) : cfg.targets;
	const targets = [ ...new Set( [ 'codex', ...selectedTargets ] ) ];
	const buildTargets = [ ...new Set( targets.map( ( name ) => targetConfig( name ).build ) ) ];
	const build = await spawn( 'node', [
		'shared/scripts/skillpack-build.mjs',
		'--clean',
		`--targets=${ buildTargets.join( ',' ) }`,
		`--skills=${ wanted.join( ',' ) }`,
	], {
		cwd: checkout.dir,
		onData: () => {},
	} );

	if ( build.code !== 0 ) {
		throw new UserError( 'skillpack-build failed.' );
	}

	log.step( `Installing ${ wanted.length } skill(s) for: ${ targets.join( ', ' ) }` );
	const previous = readLock();
	migrateLegacyOwnSkills( flags[ 'dry-run' ] );
	installTargets( checkout.dir, targets, wanted, previous, flags[ 'dry-run' ] );

	if ( flags[ 'dry-run' ] ) return 0;
	for ( const name of targets ) {
		validateSkillResources( path.join( paths.root, ...targetConfig( name ).destination ), paths.root );
	}

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
	fs.rmSync( LEGACY_LOCK_FILE(), { force: true } );

	log.blank();

	if ( previous && previous.commit !== checkout.commit ) {
		log.ok( `Skills updated: ${ previous.commit.slice( 0, 7 ) } -> ${ checkout.commit.slice( 0, 7 ) }` );
		log.dim( '   Review the change with: git diff .agents/skills .claude/skills' );
	} else if ( previous ) {
		log.ok( `Skills already at the newest commit (${ checkout.commit.slice( 0, 7 ) })` );
	} else {
		log.ok( `Installed ${ wanted.length } skill(s) at commit ${ checkout.commit.slice( 0, 7 ) }` );
	}

	log.dim( '   Commit .agents/skills and the generated .claude/skills compatibility copy.' );
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

	const requestedTargets = listFlag( flags.targets ).length
		? listFlag( flags.targets )
		: [ 'codex', 'claude' ];
	const globalTargets = {
		codex: path.join( home, '.agents', 'skills' ),
		claude: path.join( home, '.claude', 'skills' ),
	};
	const installed = [];

	for ( const targetName of requestedTargets ) {
		const target = globalTargets[ targetName ];
		if ( ! target ) {
			throw new UserError( 'Global skills support the codex and claude targets.' );
		}

		for ( const name of OWN_SKILLS ) {
			const source = ownSkillSource( name );

			if ( ! fs.existsSync( source ) ) continue;

			if ( ! flags[ 'dry-run' ] ) {
				copySkill( source, path.join( target, name ) );
			}

			installed.push( `${ targetName }:${ name }` );
		}
	}

	log.blank();

	if ( ! installed.length ) {
		log.warn( 'No skills of our own found in .agents/skills.' );
		log.blank();

		return 1;
	}

	log.ok(
		`${ flags[ 'dry-run' ] ? 'Would install' : 'Installed' } ${ installed.join( ', ' ) }`
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
