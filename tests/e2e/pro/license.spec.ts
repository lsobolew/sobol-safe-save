/**
 * End-to-end tests for the Pro edition. This directory only runs with --edition=pro.
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';

const SAVE_BUTTON = /Save Changes|Save/;

test.describe( 'Pro edition', () => {
	test( 'adds its licence section to the free plugin settings screen', async ( {
		admin,
		page,
	} ) => {
		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		await expect( page.getByRole( 'heading', { name: 'Pro licence' } ) ).toBeVisible();
		await expect( page.locator( '#my-plugin-pro-license-key' ) ).toBeVisible();
		await expect( page.locator( '#my-plugin-pro-license-status' ) ).toContainText( 'no key' );
	} );

	test( 'extends the free plugin REST response', async ( { requestUtils } ) => {
		const item = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/myplugin_item',
			data: { title: 'E2E Pro', status: 'publish' },
		} );

		const items = await requestUtils.rest( { path: '/my-plugin/v1/items' } );

		expect( items[ 0 ] ).toHaveProperty( 'edition', 'pro' );
		expect( items[ 0 ] ).toHaveProperty( 'featured' );

		await requestUtils.rest( {
			method: 'DELETE',
			path: `/wp/v2/myplugin_item/${ item.id }`,
			params: { force: true },
		} );
	} );

	test( 'saves the licence key in the same form as the rest of the settings', async ( {
		admin,
		page,
	} ) => {
		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		// One Settings API form: the licence and the other settings share a single save button.
		// A nested <form> would tear this screen apart, so the test pins that down.
		await expect( page.locator( '#my-plugin-settings form' ) ).toHaveCount( 1 );

		await page.fill( 'input[name="my_plugin_pro_license[key]"]', 'TEST-KEY-0000' );
		await page.fill( 'input[name="my_plugin_settings[api_label]"]', 'saved-with-licence' );
		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();

		await expect( page.locator( '#setting-error-settings_updated' ) ).toBeVisible();

		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		// There is no licence server here, so the status must read "unknown": the key is stored,
		// the screen works, and the ordinary settings were saved alongside it.
		await expect( page.locator( '#my-plugin-pro-license-key' ) ).toHaveValue( 'TEST-KEY-0000' );
		await expect( page.locator( '#my-plugin-pro-license-status' ) ).toContainText( 'unknown' );
		await expect(
			page.locator( 'input[name="my_plugin_settings[api_label]"]' )
		).toHaveValue( 'saved-with-licence' );

		// Clean up: an empty field releases the licence. The confirmation has to be awaited -
		// without it Playwright tears the page down mid-request, the key survives, and the next
		// run of this file finds a licence it never set.
		await page.fill( 'input[name="my_plugin_pro_license[key]"]', '' );
		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();
		await expect( page.locator( '#setting-error-settings_updated' ) ).toBeVisible();
		await expect( page.locator( '#my-plugin-pro-license-status' ) ).toContainText( 'no key' );
	} );
} );
