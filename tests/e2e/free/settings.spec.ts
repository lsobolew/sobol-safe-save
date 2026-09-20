/**
 * End-to-end tests for the settings screen.
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';

const SAVE_BUTTON = /Save Changes|Save/;
const PAGE = 'page=sobol-safe-save';

/**
 * A checkbox, by name.
 *
 * The type matters: each checkbox is preceded by a hidden input of the same name carrying 0, so
 * that unticking one actually submits something. Selecting on the name alone finds both.
 */
const checkbox = ( key: string ) =>
	`input[type="checkbox"][name="sobol_safe_save_settings[${ key }]"]`;

/** One of the post type checkboxes, which post as a list rather than a single value. */
const postType = ( slug: string ) =>
	`input[name="sobol_safe_save_settings[post_types][]"][value="${ slug }"]`;

test.describe( 'Settings screen', () => {
	test( 'is reachable from the Settings menu', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', PAGE );

		await expect(
			page.getByRole( 'heading', { name: 'Sobol Safe Save', level: 1 } )
		).toBeVisible();
	} );

	test( 'saves changed values', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', PAGE );

		await page.uncheck( checkbox( 'check_excerpt' ) );
		await page.fill( 'input[name="sobol_safe_save_settings[debounce_ms]"]', '1500' );
		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();

		await expect( page.locator( '#setting-error-settings_updated' ) ).toBeVisible();

		await admin.visitAdminPage( 'options-general.php', PAGE );

		await expect( page.locator( checkbox( 'check_excerpt' ) ) ).not.toBeChecked();
		await expect(
			page.locator( 'input[name="sobol_safe_save_settings[debounce_ms]"]' )
		).toHaveValue( '1500' );

		// Put it back, so the run order of the rest of the suite cannot matter.
		await page.check( checkbox( 'check_excerpt' ) );
		await page.fill( 'input[name="sobol_safe_save_settings[debounce_ms]"]', '800' );
		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();
	} );

	test( 'clamps a delay the form would never send', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', PAGE );

		// The field has min=200, so a browser would refuse to submit 0. Strip the validation and
		// send it anyway: the guarantee being tested is the server's, not the browser's.
		await page.evaluate( () => {
			const input = document.querySelector< HTMLInputElement >(
				'input[name="sobol_safe_save_settings[debounce_ms]"]'
			);

			if ( input ) {
				input.removeAttribute( 'min' );
				input.value = '0';
			}
		} );

		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();
		await admin.visitAdminPage( 'options-general.php', PAGE );

		await expect(
			page.locator( 'input[name="sobol_safe_save_settings[debounce_ms]"]' )
		).toHaveValue( '200' );

		await page.fill( 'input[name="sobol_safe_save_settings[debounce_ms]"]', '800' );
		await page.getByRole( 'button', { name: SAVE_BUTTON } ).click();
	} );

	test( 'lists the post types that can be checked', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', PAGE );

		await expect(
			page.locator( postType( 'post' ) )
		).toBeVisible();
		await expect(
			page.locator( postType( 'page' ) )
		).toBeVisible();
	} );
} );
