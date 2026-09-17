/**
 * End-to-end tests for the custom post type and the plugin REST endpoint.
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';

const CREATED: number[] = [];

test.describe( 'Plugin items', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		for ( const title of [ 'E2E Alpha', 'E2E Beta', 'E2E Gamma' ] ) {
			const item = await requestUtils.rest( {
				method: 'POST',
				path: '/wp/v2/myplugin_item',
				data: { title, status: 'publish' },
			} );

			CREATED.push( item.id );
		}
	} );

	test.afterAll( async ( { requestUtils } ) => {
		for ( const id of CREATED ) {
			await requestUtils.rest( {
				method: 'DELETE',
				path: `/wp/v2/myplugin_item/${ id }`,
				params: { force: true },
			} );
		}

		CREATED.length = 0;
	} );

	test( 'the post type archive lists the items', async ( { page } ) => {
		await page.goto( '/items/' );

		await expect( page.getByText( 'E2E Alpha' ).first() ).toBeVisible();
		await expect( page.getByText( 'E2E Gamma' ).first() ).toBeVisible();
	} );

	test( 'the plugin REST endpoint returns items', async ( { requestUtils } ) => {
		const items = await requestUtils.rest( { path: '/my-plugin/v1/items' } );

		expect( Array.isArray( items ) ).toBe( true );
		expect( items.length ).toBeGreaterThan( 0 );
		expect( items[ 0 ] ).toHaveProperty( 'title' );
		expect( items[ 0 ] ).toHaveProperty( 'priority' );
	} );

	test( 'the endpoint honours per_page', async ( { requestUtils } ) => {
		const items = await requestUtils.rest( {
			path: '/my-plugin/v1/items',
			params: { per_page: 2 },
		} );

		expect( items ).toHaveLength( 2 );
	} );

	test( 'the item list block renders on the front end', async ( { requestUtils, page } ) => {
		const post = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/posts',
			data: {
				title: 'E2E block',
				status: 'publish',
				content: '<!-- wp:my-plugin/item-list {"limit":2} /-->',
			},
		} );

		await page.goto( `/?p=${ post.id }` );
		await expect( page.locator( 'ul.my-plugin-item-list li' ) ).toHaveCount( 2 );

		await requestUtils.rest( {
			method: 'DELETE',
			path: `/wp/v2/posts/${ post.id }`,
			params: { force: true },
		} );
	} );
} );
