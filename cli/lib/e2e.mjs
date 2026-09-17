import fs from 'node:fs';
import path from 'node:path';
import { paths, ensureDir } from './paths.mjs';
import { starter, pluginDirs } from './config.mjs';
import { ADMIN_USER, ADMIN_PASSWORD } from './compose-render.mjs';
import { run } from './proc.mjs';
import { applyEdition, ensureUp } from './runner.mjs';
import { compose } from './docker.mjs';
import { resultFile } from './junit.mjs';

const BROWSER_MARKER = () => path.join( paths.cache, 'playwright-chromium.installed' );

/** Artifact directory for one run (must match playwright.config.mjs). */
const artifactsDir = ( target, edition, themeAlias ) =>
	path.join(
		paths.work,
		'artifacts',
		[ target.id, edition, themeAlias ].filter( Boolean ).join( '-' )
	);

/** Downloads the browser on the first e2e run. */
async function ensureBrowser( onLog ) {
	ensureDir( paths.cache );
	if ( fs.existsSync( BROWSER_MARKER() ) ) return true;

	onLog?.( 'Downloading the Playwright browser (one-off)...\n' );
	const { code } = await run( 'npx', [ 'playwright', 'install', 'chromium' ], {
		cwd: paths.root,
		onData: onLog,
	} );

	if ( code === 0 ) fs.writeFileSync( BROWSER_MARKER(), new Date().toISOString() );
	return code === 0;
}

/**
 * Runs Playwright against one WordPress instance in one edition.
 */
/**
 * Refuses to run when a plugin has block sources but no build.
 *
 * `build/` is generated and therefore not in version control, so a fresh clone - or a CI job that
 * checks out and goes straight to the tests - has block sources and nothing built from them. The
 * plugin then registers no blocks at all, and every test that inserts one fails on a missing
 * block. That reads as dozens of unrelated failures rather than one missing step, and it is not
 * obvious from any of them what actually happened.
 *
 * @param {(text: string) => void} emit Log sink.
 * @return {boolean} Whether every plugin with blocks has been built.
 */
function missingBuildsReported( emit ) {
	const missing = [];

	for ( const { dir, abs } of pluginDirs() ) {
		if ( ! fs.existsSync( path.join( abs, 'blocks' ) ) ) continue;

		const build = path.join( abs, 'build' );

		if ( ! fs.existsSync( build ) || ! fs.readdirSync( build ).length ) {
			missing.push( dir );
		}
	}

	if ( ! missing.length ) return true;

	emit(
		`\nNo built blocks in: ${ missing.join( ', ' ) }\n` +
			`build/ is generated and not committed, so it has to be produced before the end-to-end\n` +
			`tests can see the blocks. Without it the plugin registers none of them and every test\n` +
			`that inserts one fails for a reason that has nothing to do with the test.\n\n` +
			`  ./bin/wpx build --skip-package\n\n`
	);

	return false;
}

export async function runE2e( { matrix, target, edition, theme, filter, onLog, headed } ) {
	const emit = ( text ) => onLog?.( text );
	const s = starter();

	const themeAlias = theme?.alias || null;
	const label = [ target.id, edition, themeAlias, 'e2e' ].filter( Boolean ).join( '-' );

	emit(
		`\n${ '='.repeat( 60 ) }\n${ label } (WP ${ target.wpVersion } / PHP ${ target.php }` +
			`${ theme ? ` / ${ theme.slug }` : '' })\n${ '='.repeat( 60 ) }\n`
	);

	if ( ! missingBuildsReported( emit ) ) return { ok: false, file: null };

	const ready = await ensureUp( matrix, [ target ], { onLog: emit } );
	if ( ! ready ) return { ok: false, file: null };

	if ( ! ( await ensureBrowser( emit ) ) ) return { ok: false, file: null };

	await applyEdition( target, edition, { onLog: emit } );

	// The theme is switched before the run rather than inside a test: activating it mid-suite
	// would leave the previous test's page rendered by a different theme than it asserted on.
	if ( theme ) {
		const { code } = await compose(
			[ 'exec', '-T', target.service, 'wp', '--allow-root', 'theme', 'activate', theme.slug ],
			{ onData: emit }
		);

		if ( code !== 0 ) {
			emit( `Could not activate theme ${ theme.slug }\n` );

			return { ok: false, file: null };
		}
	}

	const args = [ 'playwright', 'test', '--config', 'playwright.config.mjs' ];
	if ( filter ) args.push( '--grep', filter );
	if ( headed ) args.push( '--headed' );

	const { code } = await run( 'npx', args, {
		cwd: paths.root,
		onData: emit,
		env: {
			WP_BASE_URL: target.url,
			// @wordpress/e2e-test-utils-playwright keeps the login state for its requestUtils fixture
			// under its own path (STORAGE_STATE_PATH), independent of `use.storageState` from the
			// config. That default is ./artifacts - shared by every WordPress version. WordPress
			// cookies are bound to the host and not to the port, so state from one instance silently
			// "worked" on the next and REST calls hit the wrong site. Pin it per target.
			WP_ARTIFACTS_PATH: artifactsDir( target, edition, themeAlias ),
			STORAGE_STATE_PATH: path.join(
				artifactsDir( target, edition, themeAlias ),
				'storage-states',
				'admin.json'
			),
			WP_USERNAME: ADMIN_USER,
			WP_PASSWORD: ADMIN_PASSWORD,
			WPLAB_TARGET: target.id,
			WPLAB_EDITION: edition,
			WPLAB_THEME: theme?.slug || '',
			WPLAB_THEME_ALIAS: themeAlias || '',
			WPLAB_THEME_TYPE: theme?.type || '',
			WPLAB_FREE_DIR: s.editions?.free?.dir || 'my-plugin',
			WPLAB_PRO_DIR: s.editions?.pro?.dir || 'my-plugin-pro',
		},
	} );

	return {
		ok: code === 0,
		file: resultFile( {
			target: target.id,
			edition: [ edition, themeAlias ].filter( Boolean ).join( '-' ),
			suite: 'e2e',
		} ),
	};
}
