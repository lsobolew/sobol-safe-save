import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname( fileURLToPath( import.meta.url ) );

// Driven by the variables `wpx test e2e` sets: one run is one WordPress version in one edition,
// which keeps the reports and the JUnit results from bleeding into each other.
const targetId = process.env.WPLAB_TARGET || 'latest';
const edition = process.env.WPLAB_EDITION || 'free';
const themeAlias = process.env.WPLAB_THEME_ALIAS || '';
const runId = [ targetId, edition, themeAlias ].filter( Boolean ).join( '-' );
const baseURL = process.env.WP_BASE_URL || 'http://localhost:8091';
const artifacts = path.join( root, '.wplab', 'artifacts', runId );

// The e2e specs live at the repository root rather than inside the plugin, for two reasons: they
// exercise a whole running environment rather than a package, and they sidestep the second copy of
// Playwright that @wordpress/scripts installs in the plugin node_modules - two instances of it
// cannot agree on anything.
//
// In the free edition the add-on specs stay out of the run; otherwise each of them would have to
// check for itself whether Pro is active.
const testMatch =
	edition === 'pro' ? [ '**/*.spec.{js,ts}' ] : [ 'free/**/*.spec.{js,ts}' ];

export default defineConfig( {
	testDir: path.join( root, 'tests', 'e2e' ),
	testMatch,
	outputDir: path.join( artifacts, 'test-results' ),
	globalSetup: path.join( root, 'tests', 'e2e-global-setup.ts' ),
	timeout: 60_000,
	expect: { timeout: 10_000 },
	forbidOnly: Boolean( process.env.CI ),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: [
		[ 'list' ],
		[ 'junit', { outputFile: path.join( root, '.wplab', 'results', `${ runId }-e2e.xml` ) } ],
		[ 'html', { outputFolder: path.join( root, 'playwright-report', runId ), open: 'never' } ],
	],
	use: {
		...devices[ 'Desktop Chrome' ],
		baseURL,
		// Login state written by globalSetup, so no test has to walk through the login form.
		storageState: path.join( artifacts, 'storage-states', 'admin.json' ),
		video: 'off',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
} );
