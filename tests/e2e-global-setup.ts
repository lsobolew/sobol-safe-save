import { request } from '@playwright/test';
import type { FullConfig } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

/**
 * Logs in once per run and writes the cookies and the REST nonce to a state file. Without it every
 * spec would walk through the login form, which across a whole version matrix turns into dozens of
 * pointless logins.
 */
export default async function globalSetup( config: FullConfig ) {
	const { storageState, baseURL } = config.projects[ 0 ]!.use;
	const storageStatePath = typeof storageState === 'string' ? storageState : undefined;

	const context = await request.newContext( { baseURL } );

	const requestUtils = new RequestUtils( context, {
		storageStatePath,
		user: {
			username: process.env.WP_USERNAME || 'admin',
			password: process.env.WP_PASSWORD || 'password',
		},
	} );

	await requestUtils.setupRest();
	await context.dispose();
}
