/**
 * End-to-end tests for the editor blocks.
 *
 * These run once per theme in the sweep, because a block meets a very different environment under
 * a block theme than under a classic one: no theme.json, styles enqueued differently, and the
 * editor canvas is not always an iframe.
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Page } from '@playwright/test';

const THEME = process.env.WPLAB_THEME || 'unknown';

/**
 * Console noise that is not ours.
 *
 * WordPress itself logs deprecations and the odd resource warning in the admin; failing on those
 * would make the suite useless. Everything else is treated as a real error, because a block that
 * throws in the editor still looks fine in a screenshot.
 */
const IGNORED_CONSOLE = [
	/is deprecated since version/i,
	/Failed to load resource/i,
	/favicon/i,
	/React Router/i,
	/wp\.components/i,
];

function watchConsole( page: Page ): string[] {
	const errors: string[] = [];

	page.on( 'console', ( message ) => {
		if ( message.type() !== 'error' ) return;

		const text = message.text();

		if ( IGNORED_CONSOLE.some( ( pattern ) => pattern.test( text ) ) ) return;

		errors.push( text );
	} );

	page.on( 'pageerror', ( error ) => errors.push( `uncaught: ${ error.message }` ) );

	return errors;
}

test.describe( `Blocks (${ THEME })`, () => {
	const createdItems: number[] = [];

	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();

		// The dynamic block lists plugin items, so the test has to supply its own. Relying on
		// whatever happens to be in the database makes the suite pass or fail depending on which
		// environment it lands in - which is exactly how this was caught.
		for ( const title of [ 'Block fixture A', 'Block fixture B', 'Block fixture C' ] ) {
			const item = await requestUtils.rest( {
				method: 'POST',
				path: '/wp/v2/myplugin_item',
				data: { title, status: 'publish' },
			} );

			createdItems.push( item.id );
		}
	} );

	test.afterAll( async ( { requestUtils } ) => {
		for ( const id of createdItems ) {
			await requestUtils.rest( {
				method: 'DELETE',
				path: `/wp/v2/myplugin_item/${ id }`,
				params: { force: true },
			} );
		}

		createdItems.length = 0;
	} );

	test( 'the dynamic block renders in the editor and on the front end', async ( {
		admin,
		editor,
		page,
	} ) => {
		const errors = watchConsole( page );

		await admin.createNewPost();
		await editor.insertBlock( { name: 'my-plugin/item-list', attributes: { limit: 3 } } );

		// The editor preview comes from PHP through ServerSideRender, so seeing the wrapper here
		// proves the REST render endpoint and the block registration agree with each other.
		await expect(
			editor.canvas.locator( '[data-type="my-plugin/item-list"]' )
		).toBeVisible();

		// publishPost() resolves to the post id, not to a URL.
		const postId = await editor.publishPost();

		await page.goto( `/?p=${ postId }` );
		await expect( page.locator( 'ul.my-plugin-item-list' ) ).toBeVisible();

		expect( errors, `console errors on ${ THEME }` ).toEqual( [] );
	} );

	test( 'the static block saves its markup and survives a reload', async ( {
		admin,
		editor,
		page,
	} ) => {
		const errors = watchConsole( page );

		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'my-plugin/callout',
			attributes: { message: 'Mind the gap', tone: 'warning' },
		} );

		// publishPost() resolves to the post id, not to a URL.
		const postId = await editor.publishPost();

		await page.goto( `/?p=${ postId }` );

		const callout = page.locator( '.wp-block-my-plugin-callout' );

		await expect( callout ).toBeVisible();
		await expect( callout ).toHaveClass( /is-tone-warning/ );
		await expect( callout.locator( 'p' ) ).toHaveText( 'Mind the gap' );

		expect( errors, `console errors on ${ THEME }` ).toEqual( [] );
	} );

	test( 'the container block accepts nested blocks', async ( { admin, editor, page } ) => {
		const errors = watchConsole( page );

		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'my-plugin/section',
			attributes: { tone: 'muted' },
			innerBlocks: [
				{ name: 'core/paragraph', attributes: { content: 'Nested paragraph' } },
			],
		} );

		// publishPost() resolves to the post id, not to a URL.
		const postId = await editor.publishPost();

		await page.goto( `/?p=${ postId }` );

		const section = page.locator( '.wp-block-my-plugin-section' );

		await expect( section ).toBeVisible();
		await expect( section ).toHaveClass( /is-tone-muted/ );
		await expect( section.getByText( 'Nested paragraph' ) ).toBeVisible();

		expect( errors, `console errors on ${ THEME }` ).toEqual( [] );
	} );

	test( 'content saved by an older version still loads', async ( { admin, editor, page } ) => {
		const errors = watchConsole( page );

		// This is the markup version 1 of the callout wrote: a `text` attribute and no tone class.
		// Without the entry in deprecated.tsx the editor would refuse it and show the block as
		// invalid - which is exactly what silently breaks existing posts when `save` changes.
		const legacy =
			'<!-- wp:my-plugin/callout -->' +
			'<div class="wp-block-my-plugin-callout"><p>Saved by an older release</p></div>' +
			'<!-- /wp:my-plugin/callout -->';

		await admin.createNewPost();
		await editor.setContent( legacy );

		await expect(
			editor.canvas.getByText( 'Saved by an older release' )
		).toBeVisible();

		// The editor shows this banner whenever a block fails validation.
		await expect(
			editor.canvas.getByText( /unexpected or invalid content/i )
		).toHaveCount( 0 );

		// The migration should have moved the text into `message` and defaulted the tone.
		const blocks = await editor.getBlocks();

		expect( blocks[ 0 ]?.name ).toBe( 'my-plugin/callout' );
		expect( blocks[ 0 ]?.attributes?.message ).toBe( 'Saved by an older release' );
		expect( blocks[ 0 ]?.attributes?.tone ).toBe( 'info' );

		expect( errors, `console errors on ${ THEME }` ).toEqual( [] );
	} );
} );
