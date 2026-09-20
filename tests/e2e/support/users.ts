import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The user Sobol Safe Save exists for.
 *
 * Every assertion in this suite depends on being somebody WordPress filters. An administrator on a
 * single site holds `unfiltered_html` and loses nothing on save, so testing as one would produce a
 * suite that passes whether or not the plugin does anything at all.
 */
export const AUTHOR = {
	username: 'sobol_safe_save_author',
	password: 'sobol_safe_save-author-pass',
	email: 'sobol_safe_save_author@example.test',
};

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..', '..' );

/** Where a logged-in user's cookies are kept for this run. */
export function storageStatePath( who: 'admin' | 'author' ): string {
	const runId = [
		process.env.WPLAB_TARGET || 'latest',
		process.env.WPLAB_EDITION || 'free',
		process.env.WPLAB_THEME_ALIAS || '',
	]
		.filter( Boolean )
		.join( '-' );

	return path.join( root, '.wplab', 'artifacts', runId, 'storage-states', `${ who }.json` );
}
