/**
 * End-to-end tests for the settings screen.
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';

const SAVE_BUTTON = /Save Changes|Save/;

test.describe( 'Settings screen', () => {
	test( 'is reachable from the Settings menu', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		await expect(
			page.getByRole( 'heading', { name: 'My Plugin', level: 1 } )
		).toBeVisible();
	} );

	test( 'saves changed values', async ( { admin, page } ) => {
		const label = `label-${ Date.now() }`;

		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		await page.fill( 'input[name="my_plugin_settings[api_label]"]', label );
		await page.fill( 'input[name="my_plugin_settings[items_per_page]"]', '7' );
		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();

		// After saving, WordPress returns to the settings page with a confirmation notice.
		await expect( page.locator( '#setting-error-settings_updated' ) ).toBeVisible();

		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		await expect(
			page.locator( 'input[name="my_plugin_settings[api_label]"]' )
		).toHaveValue( label );
		await expect(
			page.locator( 'input[name="my_plugin_settings[items_per_page]"]' )
		).toHaveValue( '7' );
	} );

	test( 'rejects out-of-range values', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		// The number field has min=1, so the browser would never submit 0. Send it anyway, with
		// the HTML validation removed, to prove the server-side sanitization does the work.
		await page.evaluate( () => {
			const input = document.querySelector(
				'input[name="my_plugin_settings[items_per_page]"]'
			);
			input.removeAttribute( 'min' );
			input.value = '0';
		} );
		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();

		await admin.visitAdminPage( 'options-general.php', 'page=my-plugin' );

		await expect(
			page.locator( 'input[name="my_plugin_settings[items_per_page]"]' )
		).toHaveValue( '1' );
	} );
} );
