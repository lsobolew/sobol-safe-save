/**
 * Sobol Safe Save in the classic editor.
 *
 * The same promise as in the block editor, with much less to work with: no block tree, no data
 * store, no place to hang a sidebar panel. So the warning goes where the classic editor puts every
 * other warning - a notice at the top of the screen - and it names post fields rather than blocks,
 * because in a classic post there is nothing finer to name.
 *
 * The form is never interfered with. Submitting stays exactly as fast as it was.
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

import { describeFinding, fieldLabel, summarise } from '../shared/describe';
import { isReadable } from '../shared/types';
import type { Report } from '../shared/types';

/** The analysis route. */
const ROUTE = '/sobol-safe-save/v1/analyze';

/** Fallback when the inline settings are missing. */
const DEFAULT_DEBOUNCE_MS = 800;

/** Class on the notice, so it can be found and replaced rather than duplicated. */
const NOTICE_CLASS = 'sobol-safe-save-classic-notice';

/** What PHP printed for this screen. */
const settings = () => window.sobolSafeSave?.classic ?? {};

/** A form field's current value. */
function value( id: string ): string {
	const field = document.getElementById( id );

	return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
		? field.value
		: '';
}

/**
 * The content as it stands, from whichever editor is showing.
 *
 * TinyMCE keeps its own copy while the visual tab is open and only writes back to the textarea on
 * submit, so reading the textarea alone would analyse whatever was there when the tab was last
 * switched - usually nothing at all.
 */
function content(): string {
	const editor = window.tinymce?.get( 'content' );

	if ( editor && ! editor.isHidden?.() ) {
		return editor.getContent();
	}

	return value( 'content' );
}

/** Takes the notice down. */
function removeNotice(): void {
	document.querySelectorAll( `.${ NOTICE_CLASS }` ).forEach( ( node ) => node.remove() );
}

/** Puts the warning at the top of the screen, replacing any earlier one. */
function showNotice( report: Report ): void {
	removeNotice();

	const anchor = document.querySelector( '.wp-header-end' ) ?? document.querySelector( '#post' );

	if ( ! anchor?.parentNode ) {
		return;
	}

	const notice = document.createElement( 'div' );
	notice.className = `notice notice-warning ${ NOTICE_CLASS }`;

	const heading = document.createElement( 'p' );
	const strong = document.createElement( 'strong' );
	strong.textContent = summarise( report );
	heading.appendChild( strong );
	notice.appendChild( heading );

	const list = document.createElement( 'ul' );
	list.style.listStyle = 'disc';
	list.style.marginLeft = '2em';

	for ( const [ field, finding ] of Object.entries( report.fields ) ) {
		for ( const sentence of describeFinding( finding ) ) {
			const item = document.createElement( 'li' );

			// textContent throughout: every one of these strings describes markup the user wrote,
			// and building this with innerHTML would put that markup back into the page.
			item.textContent = `${ fieldLabel( field ) }: ${ sentence }`;
			list.appendChild( item );
		}
	}

	notice.appendChild( list );

	const footer = document.createElement( 'p' );
	footer.textContent = __( 'You can still save. This is a warning, not a block.', 'sobol-safe-save' );
	notice.appendChild( footer );

	anchor.parentNode.insertBefore( notice, anchor.nextSibling );
}

let timer: number | undefined;
let controller: AbortController | undefined;
let finished = false;

/** Asks the server what the next save would cost. */
async function check(): Promise< void > {
	controller?.abort();
	controller = new AbortController();

	const { postId, postType } = settings();

	try {
		const report = await apiFetch< unknown >( {
			path: ROUTE,
			method: 'POST',
			data: {
				post_id: postId ?? 0,
				post_type: postType ?? 'post',
				title: value( 'title' ),
				content: content(),
				excerpt: value( 'excerpt' ),
			},
			signal: controller.signal,
		} );

		if ( ! isReadable( report ) ) {
			return;
		}

		if ( ! report.applies ) {
			// Nothing here is filtered, so there is no reason to keep asking.
			finished = true;
			removeNotice();

			return;
		}

		if ( report.changed ) {
			showNotice( report );
		} else {
			removeNotice();
		}
	} catch ( error ) {
		// apiFetch rethrows an abort as the raw DOMException, so the name is what distinguishes a
		// superseded request from a real failure.
		if ( ( error as { name?: string } )?.name === 'AbortError' ) {
			return;
		}

		if ( ( error as { data?: { status?: number } } )?.data?.status === 413 ) {
			finished = true;
		}

		removeNotice();
	}
}

/** Schedules a check once the typing stops. */
function schedule(): void {
	if ( finished ) {
		return;
	}

	window.clearTimeout( timer );
	timer = window.setTimeout( check, settings().debounceMs ?? DEFAULT_DEBOUNCE_MS );
}

function start(): void {
	// Capture phase, on the document: one listener covers the title, the excerpt and the plain
	// text editor, including fields other plugins add to the form later.
	document.addEventListener( 'input', schedule, true );

	const attach = ( editor: SobolSafeSaveTinyMceEditor ): void => {
		if ( 'content' === editor.id ) {
			editor.on( 'input change keyup undo redo', schedule );
		}
	};

	const existing = window.tinymce?.get( 'content' );

	if ( existing ) {
		attach( existing );
	}

	// The visual editor is set up after this script runs, so the event covers the usual case and
	// the lookup above covers a late-loading script.
	window.tinymce?.on?.( 'AddEditor', ( event ) => attach( event.editor ) );

	schedule();
}

if ( 'loading' === document.readyState ) {
	document.addEventListener( 'DOMContentLoaded', start );
} else {
	start();
}
