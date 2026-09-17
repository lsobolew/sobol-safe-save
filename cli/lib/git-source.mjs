import fs from 'node:fs';
import path from 'node:path';
import { paths, ensureDir } from './paths.mjs';
import { run as spawn, capture } from './proc.mjs';
import { log, UserError } from './log.mjs';

/**
 * A shallow, read-only checkout of an upstream git repository under .wplab/cache.
 *
 * Shared by `wpx skills` (the WordPress agent skills) and `wpx upgrade` (the lab itself): both
 * need the same "clone once, fast-forward afterwards, tell me the commit" behaviour.
 */

/** Default branch of a remote, used when nothing pins a ref. */
export async function defaultBranch( repo ) {
	const result = await capture( 'git', [ 'ls-remote', '--symref', repo, 'HEAD' ] );
	const match = result.stdout.match( /^ref:\s+refs\/heads\/(\S+)\s+HEAD/m );

	if ( ! match ) {
		throw new UserError( `Could not determine the default branch of ${ repo }.` );
	}

	return match[ 1 ];
}

/**
 * Clones the repository or fast-forwards an existing checkout.
 *
 * @param {object} options
 * @param {string} options.repo  Repository URL.
 * @param {string} [options.ref] Branch to track; resolved from the remote when empty.
 * @param {string} options.name  Directory name under .wplab/cache.
 * @param {string} [options.label] What to call it in error messages.
 * @param {Function} [options.onLog] Receives git output.
 *
 * @return {Promise<{dir: string, ref: string, commit: string, committedAt: string}>}
 */
export async function syncCheckout( { repo, ref, name, label = 'repository', onLog } = {} ) {
	if ( ! repo ) {
		throw new UserError( `No ${ label } URL configured.` );
	}

	ensureDir( paths.cache );

	const dir = path.join( paths.cache, name );
	const branch = ref || ( await defaultBranch( repo ) );

	if ( ! fs.existsSync( path.join( dir, '.git' ) ) ) {
		fs.rmSync( dir, { recursive: true, force: true } );
		log.step( `Cloning ${ repo } (${ branch })` );

		const { code } = await spawn(
			'git',
			[ 'clone', '--depth=1', '--branch', branch, repo, dir ],
			{ onData: onLog }
		);

		if ( code !== 0 ) {
			throw new UserError( `Could not clone the ${ label }.` );
		}
	} else {
		log.step( `Fetching ${ repo } (${ branch })` );

		// --depth=1 keeps the checkout tiny; the upstream history is never needed locally.
		const fetched = await spawn(
			'git',
			[ '-C', dir, 'fetch', '--depth=1', 'origin', branch ],
			{ onData: onLog }
		);

		if ( fetched.code !== 0 ) {
			throw new UserError( `Could not fetch the ${ label }.` );
		}

		await spawn( 'git', [ '-C', dir, 'reset', '--hard', 'FETCH_HEAD' ], { onData: onLog } );
	}

	const head = await capture( 'git', [ '-C', dir, 'rev-parse', 'HEAD' ] );
	const date = await capture( 'git', [ '-C', dir, 'log', '-1', '--format=%cI' ] );

	return {
		dir,
		ref: branch,
		commit: head.stdout.trim(),
		committedAt: date.stdout.trim(),
	};
}

/** Current head of a remote branch, without touching the local checkout. */
export async function remoteHead( repo, ref ) {
	const result = await capture( 'git', [ 'ls-remote', repo, `refs/heads/${ ref }` ] );

	return result.stdout.trim().split( /\s+/ )[ 0 ] || '';
}
