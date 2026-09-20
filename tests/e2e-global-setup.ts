import { request } from '@playwright/test';
import type { FullConfig } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

import { AUTHOR, storageStatePath } from './e2e/support/users';

/**
 * Logs in once per run and writes the cookies and the REST nonce to a state file. Without it every
 * spec would walk through the login form, which across a whole version matrix turns into dozens of
 * pointless logins.
 *
 * Two users, not one. The administrator is who you need to reach the settings screen; the author
 * is who the plugin is *for*, because on a single site an administrator may post unfiltered HTML
 * and so has nothing to be warned about.
 */
export default async function globalSetup( config: FullConfig ) {
	const { storageState, baseURL } = config.projects[ 0 ]!.use;
	const storageStatePath = typeof storageState === 'string' ? storageState : undefined;

	const context = await request.newContext( { baseURL } );

	const admin = new RequestUtils( context, {
		storageStatePath,
		user: {
			username: process.env.WP_USERNAME || 'admin',
			password: process.env.WP_PASSWORD || 'password',
		},
	} );

	await admin.setupRest();

	// Created through the REST API rather than assumed to exist, so a freshly reset site works.
	// A second run finds the user already there, which the API reports as an error; the login
	// below is what actually proves the account is usable, so there is nothing to do about it.
	try {
		await admin.rest( {
			path: '/wp/v2/users',
			method: 'POST',
			data: {
				username: AUTHOR.username,
				email: AUTHOR.email,
				password: AUTHOR.password,
				roles: [ 'author' ],
			},
		} );
	} catch {
		// Already registered.
	}

	await context.dispose();

	const authorContext = await request.newContext( { baseURL } );

	const author = new RequestUtils( authorContext, {
		storageStatePath: authorStatePath(),
		user: { username: AUTHOR.username, password: AUTHOR.password },
	} );

	await author.setupRest();
	await authorContext.dispose();
}

/** Where the author's cookies go. */
function authorStatePath(): string {
	return storageStatePath( 'author' );
}
