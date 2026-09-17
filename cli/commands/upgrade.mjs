import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../lib/args.mjs';
import { paths, readJson, writeJson } from '../lib/paths.mjs';
import { starter } from '../lib/config.mjs';
import { syncCheckout, remoteHead } from '../lib/git-source.mjs';
import { LAB_PATHS, LAB_EXCLUDES } from '../lib/lab-paths.mjs';
import { capture } from '../lib/proc.mjs';
import { log, c, UserError } from '../lib/log.mjs';

const LOCK_FILE = () => path.join( paths.root, 'lab.lock.json' );

function config() {
	const configured = starter().lab || {};

	if ( ! configured.repo ) {
		throw new UserError(
			'No starter repository configured.\n' +
				'Add it to starter.json:\n\n' +
				'  "lab": { "repo": "https://github.com/you/wp-plugin-lab.git", "ref": "main" }'
		);
	}

	return { ref: '', ...configured };
}

export function readLock() {
	const file = LOCK_FILE();

	return fs.existsSync( file ) ? readJson( file ) : null;
}

/** Every file under a lab path, relative to the repository root. */
function listFiles( root, relative, out = [] ) {
	const full = path.join( root, relative );

	if ( ! fs.existsSync( full ) ) return out;

	if ( fs.statSync( full ).isFile() ) {
		out.push( relative );

		return out;
	}

	for ( const entry of fs.readdirSync( full, { withFileTypes: true } ) ) {
		if ( entry.name === '.git' ) continue;

		const child = path.posix.join( relative, entry.name );

		if ( LAB_EXCLUDES.includes( child ) ) continue;

		if ( entry.isDirectory() ) {
			listFiles( root, child, out );
		} else {
			out.push( child );
		}
	}

	return out;
}

function sameContent( a, b ) {
	if ( ! fs.existsSync( a ) || ! fs.existsSync( b ) ) return false;

	return fs.readFileSync( a ).equals( fs.readFileSync( b ) );
}

/** Refuses to run on a dirty tree, so every change lands as a reviewable diff. */
async function assertCleanTree( force ) {
	const { code, stdout } = await capture( 'git', [
		'-C',
		paths.root,
		'status',
		'--porcelain',
	] );

	if ( code !== 0 ) {
		throw new UserError( 'This is not a git repository - upgrading would be irreversible.' );
	}

	const dirty = stdout.trim();

	if ( ! dirty || force ) return;

	log.blank();
	log.fail( 'The working tree has uncommitted changes.' );
	log.dim( '   `wpx upgrade` overwrites the lab files, and a clean tree is what lets you review' );
	log.dim( '   the result with `git diff` and revert anything you do not want.' );
	log.blank();
	log.dim( '   Commit or stash first, or pass --force if you know what you are doing.' );
	log.blank();

	throw new UserError( 'Refusing to upgrade with a dirty working tree.' );
}

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, { booleans: [ 'dry-run', 'force' ] } );
	const action = positional[ 0 ] || 'install';
	const cfg = config();

	if ( action === 'status' ) {
		const lock = readLock();

		log.blank();
		log.info( c.bold( 'Lab infrastructure' ) );
		log.blank();

		if ( ! lock ) {
			log.warn( 'Never upgraded - this repository still carries the files it was created with.' );
			log.dim( `   Source: ${ cfg.repo }` );
			log.blank();

			return 1;
		}

		const ageDays = Math.floor(
			( Date.now() - new Date( lock.upgradedAt ).getTime() ) / 86400000
		);

		log.info( `  source    ${ lock.repo } (${ lock.ref })` );
		log.info( `  commit    ${ lock.commit.slice( 0, 7 ) } from ${ lock.committedAt?.slice( 0, 10 ) }` );
		log.info( `  upgraded  ${ lock.upgradedAt.slice( 0, 10 ) } (${ ageDays } days ago)` );
		log.blank();

		const head = await remoteHead( cfg.repo, cfg.ref || lock.ref );

		if ( ! head ) {
			log.warn( 'Could not reach the starter repository.' );
		} else if ( head === lock.commit ) {
			log.ok( 'Up to date with the starter.' );
		} else {
			log.warn( `The starter moved to ${ head.slice( 0, 7 ) } - run ./bin/wpx upgrade` );
		}

		log.blank();

		return 0;
	}

	if ( action !== 'install' && action !== 'update' ) {
		throw new UserError( `Unknown action "${ action }". Available: install, status.` );
	}

	const dryRun = Boolean( flags[ 'dry-run' ] );

	if ( ! dryRun ) await assertCleanTree( flags.force );

	const checkout = await syncCheckout( {
		repo: cfg.repo,
		ref: cfg.ref,
		name: 'lab',
		label: 'starter repository',
	} );

	const added = [];
	const changed = [];
	const removed = [];

	for ( const labPath of LAB_PATHS ) {
		const upstreamFiles = listFiles( checkout.dir, labPath );
		const localFiles = listFiles( paths.root, labPath );

		for ( const relative of upstreamFiles ) {
			const from = path.join( checkout.dir, relative );
			const to = path.join( paths.root, relative );

			if ( sameContent( from, to ) ) continue;

			( fs.existsSync( to ) ? changed : added ).push( relative );

			if ( ! dryRun ) {
				fs.mkdirSync( path.dirname( to ), { recursive: true } );
				fs.copyFileSync( from, to );
				fs.chmodSync( to, fs.statSync( from ).mode );
			}
		}

		// Files the starter deleted have to go too, or a removed command lingers forever.
		for ( const relative of localFiles ) {
			if ( upstreamFiles.includes( relative ) ) continue;

			removed.push( relative );

			if ( ! dryRun ) fs.rmSync( path.join( paths.root, relative ), { force: true } );
		}
	}

	if ( ! dryRun ) {
		writeJson( LOCK_FILE(), {
			repo: cfg.repo,
			ref: checkout.ref,
			commit: checkout.commit,
			committedAt: checkout.committedAt,
			upgradedAt: new Date().toISOString(),
			paths: LAB_PATHS,
		} );
	}

	const total = added.length + changed.length + removed.length;

	log.blank();

	if ( ! total ) {
		log.ok( `Already on the newest lab (${ checkout.commit.slice( 0, 7 ) }) - nothing to do.` );
		log.blank();

		return 0;
	}

	log.step(
		`${ dryRun ? 'Would update' : 'Updated' } ${ total } file(s) to ${ checkout.commit.slice( 0, 7 ) }`
	);

	for ( const item of added ) log.info( `  ${ c.green( '+' ) } ${ item }` );
	for ( const item of changed ) log.info( `  ${ c.yellow( '~' ) } ${ item }` );
	for ( const item of removed ) log.info( `  ${ c.red( '-' ) } ${ item }` );

	log.blank();

	if ( dryRun ) {
		log.dim( '   Dry run - nothing was written.' );
	} else {
		log.dim( '   Review before committing:  git diff' );
		log.dim( '   Revert a file you changed locally:  git checkout -- <path>' );
	}

	log.blank();

	return 0;
}
