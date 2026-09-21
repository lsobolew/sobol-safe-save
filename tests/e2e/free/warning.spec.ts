/**
 * The warning, in the block editor, as the person who needs it.
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Editor, Page } from '@wordpress/e2e-test-utils-playwright';

import { storageStatePath } from '../support/users';

/**
 * The notice text every test here waits for.
 *
 * Deliberately loose: the line names the worst thing that will happen, so its exact shape depends
 * on the content. What every variant shares is how it opens.
 */
const WARNING = /Saving will change/;

/**
 * The warning, scoped to the notice itself.
 *
 * The same sentence is also pushed into the screen-reader live region - which is exactly what
 * should happen, and is why an unscoped match finds two elements and fails as ambiguous.
 */
function warningNotice( page: Page ) {
	return page.locator( '.components-notice__content' ).filter( { hasText: WARNING } );
}

/** The plugin's own panel body, so assertions cannot pick up matching text elsewhere on screen. */
function panel( page: Page ) {
	return page.locator( '.sobol-safe-save-panel__body' );
}

/** Long enough for the debounce plus two round trips, short enough to fail a hung test quickly. */
const SETTLE = 15_000;

/**
 * Opens a new post and waits until the editor is actually ready to be written to.
 *
 * `createNewPost()` returns as soon as the page has navigated, which is before the block editor
 * has mounted. Blocks inserted in that window are wiped by the editor's own initial reset, and the
 * test then fails on a plugin that is working perfectly. Waiting for the canvas closes the gap.
 */
async function startPost( admin: { createNewPost: ( o?: object ) => Promise< void > }, editor: Editor, title?: string ) {
	await admin.createNewPost( title ? { title } : {} );
	await editor.canvas.locator( 'body' ).waitFor();
}

/** Writes a paragraph plus a raw iframe, which is the thing an author is not allowed to keep. */
async function writeRiskyContent( editor: Editor ) {
	await editor.insertBlock( { name: 'core/paragraph', attributes: { content: 'Keep this.' } } );
	await editor.insertBlock( {
		name: 'core/html',
		attributes: { content: '<iframe src="https://example.test/x"></iframe>' },
	} );
}

/** Writes two separate blocks that each lose something, to test walking between them. */
async function writeTwoRiskyBlocks( editor: Editor ) {
	await editor.insertBlock( { name: 'core/paragraph', attributes: { content: 'Keep this.' } } );
	await editor.insertBlock( {
		name: 'core/html',
		attributes: { content: '<iframe src="https://example.test/one"></iframe>' },
	} );
	await editor.insertBlock( {
		name: 'core/html',
		attributes: { content: '<iframe src="https://example.test/two"></iframe>' },
	} );
}

/**
 * Sets the post title through the editor store.
 *
 * Not by typing: the title is a contenteditable inside the canvas iframe, and a browser normalises
 * the leading and trailing spaces this test is about before they ever reach the editor. What is
 * under test is the plugin, not the title field.
 */
async function setTitle( page: Page, title: string ): Promise< void > {
	await page.evaluate( ( value ) => {
		(
			window as unknown as {
				wp: { data: { dispatch: ( s: string ) => { editPost: ( edits: object ) => void } } };
			}
		 ).wp.data.dispatch( 'core/editor' ).editPost( { title: value } );
	}, title );
}

/** The block the editor currently has selected. */
async function selectedBlock( page: Page ): Promise< string | null > {
	return page.evaluate( () =>
		( window as unknown as { wp: { data: { select: ( s: string ) => { getSelectedBlockClientId: () => string | null } } } } ).wp.data
			.select( 'core/block-editor' )
			.getSelectedBlockClientId()
	);
}

/** Writes content WordPress has no objection to. */
async function writeSafeContent( editor: Editor ) {
	await editor.insertBlock( { name: 'core/paragraph', attributes: { content: 'Keep this.' } } );
	await editor.insertBlock( { name: 'core/paragraph', attributes: { content: 'And this.' } } );
}

/**
 * Expands the plugin's panel in the document sidebar.
 *
 * Two things have to be true before the panel is on screen, and neither is obvious:
 *
 * - The settings sidebar has to be open. `openDocumentSettingsSidebar()` already checks before it
 *   clicks, so it is safe to call whatever the previous test left behind.
 * - The sidebar has to be on the **Post** tab. Inserting a block leaves that block selected, which
 *   switches the sidebar to the Block tab, and a `PluginDocumentSettingPanel` is a document panel
 *   - it simply is not rendered while the Block tab is showing.
 */
async function openPanel( editor: Editor, page: Page ) {
	await editor.openDocumentSettingsSidebar();

	const settings = page.getByRole( 'region', { name: 'Editor settings' } );
	const postTab = settings.getByRole( 'tab', { name: 'Post' } );

	if ( await postTab.isVisible() ) {
		await postTab.click();
	}

	const toggle = settings.getByRole( 'button', { name: 'Sobol Safe Save', exact: true } );

	await toggle.waitFor();

	// The panel remembers whether it was open, per user, across page loads, so this reads the
	// state rather than toggling blind.
	if ( ( await toggle.getAttribute( 'aria-expanded' ) ) === 'false' ) {
		await toggle.click();
	}
}

test.describe( 'Warning an author before they lose content', () => {
	// The whole point: somebody WordPress actually filters. An administrator on a single site holds
	// unfiltered_html, so running this as one would pass whether or not the plugin did anything.
	test.use( { storageState: storageStatePath( 'author' ) } );

	test( 'warns that a save will change the content', async ( { admin, editor, page } ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );
	} );

	test( 'the warning names what will be lost, not just how much', async ( {
		admin,
		editor,
		page,
	} ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		// A count answers "how much?" when the question somebody has is "what?" - and the analysis
		// already knows it is an iframe, so a warning that only counts blocks is withholding it.
		await expect( warningNotice( page ) ).toContainText( 'iframe', { timeout: SETTLE } );
	} );

	test( 'the warning leads with the most serious change', async ( { admin, editor, page } ) => {
		await startPost( admin, editor );

		// A trimmed title is cosmetic; a removed element is not. Both are in this post, and the
		// one line available has to spend itself on the one that matters.
		await setTitle( page, '  Spaced out  ' );
		await writeRiskyContent( editor );

		const notice = warningNotice( page );

		await expect( notice ).toContainText( 'iframe', { timeout: SETTLE } );
		await expect( notice ).not.toContainText( 'spaces' );
	} );

	test( 'leaves the save button alone', async ( { admin, editor, page } ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		// This edition warns and never blocks. A disabled publish button here would mean the free
		// plugin had grown the one behaviour that belongs to the paid add-on.
		await expect(
			page.getByRole( 'button', { name: 'Publish', exact: true } )
		).toBeEnabled();
	} );

	test( 'names the element that will be removed', async ( { admin, editor, page } ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		await openPanel( editor, page );

		await expect( panel( page ).getByText( /<iframe> element will be removed/ ) ).toBeVisible( {
			timeout: SETTLE,
		} );
	} );

	test( 'shows the markup that will change', async ( { admin, editor, page } ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		await openPanel( editor, page );

		// The sentence says an element will go; the markup says which one, in the author's own
		// words. Everything needed for it is already in the payload, so it ships in the free
		// edition - holding it back for a paid tier is exactly what guideline 5 forbids.
		await panel( page ).getByText( 'Show the markup that changes' ).first().click();

		await expect( panel( page ).locator( 'del' ).first() ).toContainText( 'iframe', {
			timeout: SETTLE,
		} );
	} );

	test( 'narrows the markup down to the characters that change', async ( {
		admin,
		editor,
		page,
	} ) => {
		await startPost( admin, editor );

		// KSES collapses a run of dashes inside any HTML comment, so exactly one character of this
		// changes. An HTML comment is a single token, so without a second, character-level pass the
		// panel would show the whole comment struck through beside an almost identical copy of it -
		// true, and impossible to read.
		await editor.insertBlock( {
			name: 'core/html',
			attributes: { content: '<!-- analytics snippet -- do not remove -->' },
		} );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		await openPanel( editor, page );
		await panel( page ).getByText( 'Show the markup that changes' ).first().click();

		await expect( panel( page ).locator( 'del' ).first() ).toHaveText( '-', {
			timeout: SETTLE,
		} );
	} );

	test( 'separates one finding from the next', async ( { admin, editor, page } ) => {
		await startPost( admin, editor );
		await writeTwoRiskyBlocks( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		await openPanel( editor, page );

		const second = panel( page ).locator( '.sobol-safe-save-panel__item' ).nth( 1 );

		await second.waitFor();

		// Two blocks losing two different things are two problems and have to read as such. This
		// doubles as the only proof that the panel's stylesheet was enqueued at all: the rule
		// comes from build/editor/index.css, so a missing enqueue shows up here and nowhere else.
		await expect( second ).toHaveCSS( 'border-top-width', '1px' );
	} );

	test( 'points at the block responsible', async ( { admin, editor, page } ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		await openPanel( editor, page );

		// The HTML block is the one carrying the iframe; the paragraph beside it is untouched and
		// must not be named, or the author is sent to rewrite something that was never at fault.
		await expect( panel( page ).getByText( 'Custom HTML' ) ).toBeVisible( { timeout: SETTLE } );
		await expect( panel( page ).getByText( 'Paragraph' ) ).toBeHidden();
	} );

	test( 'says nothing about content WordPress leaves alone', async ( {
		admin,
		editor,
		page,
	} ) => {
		await startPost( admin, editor );
		await writeSafeContent( editor );

		await openPanel( editor, page );

		await expect( panel( page ).getByText( 'Nothing will be lost when you save.' ) ).toBeVisible( {
			timeout: SETTLE,
		} );
		await expect( warningNotice( page ) ).toBeHidden();
	} );

	test( 'show me walks through every affected block, however often it is clicked', async ( {
		admin,
		editor,
		page,
	} ) => {
		await startPost( admin, editor );
		await writeTwoRiskyBlocks( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		const showMe = page.getByRole( 'button', { name: 'Show me' } );

		await showMe.click();

		const first = await selectedBlock( page );

		expect( first ).not.toBeNull();

		// The bug this guards: selecting a block that is already selected changes nothing in the
		// store, so nothing transitions and the second click appears to do nothing at all.
		await showMe.click();

		const second = await selectedBlock( page );

		expect( second ).not.toBeNull();
		expect( second ).not.toBe( first );

		// And it comes back round rather than running out.
		await showMe.click();

		expect( await selectedBlock( page ) ).toBe( first );
	} );

	test( 'details opens the Sobol Safe Save panel with the findings visible', async ( {
		admin,
		editor,
		page,
	} ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );
		await page.getByRole( 'button', { name: 'Details' } ).click();

		await expect( panel( page ) ).toBeVisible( { timeout: SETTLE } );
		await expect( panel( page ).getByText( /<iframe> element will be removed/ ) ).toBeVisible( {
			timeout: SETTLE,
		} );
	} );

	test( 'details exits distraction-free mode before opening the panel', async ( {
		admin,
		editor,
		page,
	} ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );
		await page.evaluate( () => {
			( window as unknown as {
				wp: { data: { dispatch: ( store: string ) => { toggleDistractionFree: () => void } } };
			} ).wp.data.dispatch( 'core/editor' ).toggleDistractionFree();
		} );

		const editorInterface = page.locator( '.editor-editor-interface' );
		await expect( editorInterface ).toHaveClass( /is-distraction-free/ );
		await page.getByRole( 'button', { name: 'Details' } ).click();

		await expect( editorInterface ).not.toHaveClass( /is-distraction-free/ );
		await expect( panel( page ) ).toBeVisible( { timeout: SETTLE } );
		const panelSection = page.locator( '.sobol-safe-save-panel' );
		await expect( panelSection ).toHaveClass( /sobol-safe-save-panel--attention/ );
		await expect( panelSection.locator( 'button[aria-expanded="true"]' ) ).toBeFocused();
		await expect( panel( page ).getByText( /<iframe> element will be removed/ ) ).toBeVisible( {
			timeout: SETTLE,
		} );
	} );

	test( 'the post still saves after the warning', async ( { admin, editor, page } ) => {
		await startPost( admin, editor, 'Saved despite the warning' );
		await writeRiskyContent( editor );

		await expect( warningNotice( page ) ).toBeVisible( { timeout: SETTLE } );

		await page.getByRole( 'button', { name: 'Save draft' } ).click();

		await expect( page.getByRole( 'button', { name: 'Saved' } ) ).toBeVisible( {
			timeout: SETTLE,
		} );
	} );
} );

test.describe( 'An administrator on a single site', () => {
	test( 'is never warned, because nothing of theirs is filtered', async ( {
		admin,
		editor,
		page,
	} ) => {
		await startPost( admin, editor );
		await writeRiskyContent( editor );

		// Comfortably longer than the debounce plus a round trip: if a warning were coming, it
		// would have arrived by now.
		await page.waitForTimeout( 5_000 );

		await expect( warningNotice( page ) ).toBeHidden();
	} );
} );
