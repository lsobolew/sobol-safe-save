/**
 * Asks the server what the next save would cost, while the user types.
 */
import apiFetch from '@wordpress/api-fetch';
import { serialize } from '@wordpress/blocks';
import { useSelect } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';
import { useEffect, useRef } from '@wordpress/element';

import { debounceMs } from './settings';
import { publishAnalyzing, publishReport } from './store';
import { isReadable } from '../shared/types';
import { blocks as blockEditor } from './wp';
import type { BlockInstance } from '@wordpress/blocks';
import type { Fragment, Report } from '../shared/types';

/** The analysis route. */
const ROUTE = '/sobol-safe-save/v1/analyze';

interface Fields {
	title: string;
	content: string;
	excerpt: string;
	postId: number;
	postType: string;
}

/**
 * A block's own markup, with its children taken out.
 *
 * `serialize()` embeds each child's serialization verbatim inside its parent's, so a Group holding
 * a broken Paragraph would be reported as broken too - three findings where the author made one
 * mistake. Removing each child's exact string leaves the parent's own delimiters and markup, which
 * is the part the parent is actually answerable for.
 */
function ownMarkup( block: BlockInstance ): string {
	// serialize() takes a list. A single-element one joins to just that element, and passing the
	// list is what the published types describe, so there is no cast to explain here.
	const full = serialize( [ block ] );
	const children = block.innerBlocks ?? [];

	if ( ! children.length ) {
		return full;
	}

	let own = full;

	for ( const child of children ) {
		const markup = serialize( [ child ] );
		const at = own.indexOf( markup );

		if ( at !== -1 ) {
			own = own.slice( 0, at ) + own.slice( at + markup.length );
		}
	}

	return own;
}

/** Every block on the page, flattened, each with its own markup and its client id. */
function fragmentsFromEditor(): Fragment[] {
	const fragments: Fragment[] = [];

	const walk = ( list: BlockInstance[] ): void => {
		for ( const block of list ) {
			fragments.push( {
				clientId: block.clientId,
				name: block.name,
				html: ownMarkup( block ),
			} );

			if ( block.innerBlocks?.length ) {
				walk( block.innerBlocks );
			}
		}
	};

	walk( blockEditor().getBlocks() );

	return fragments;
}

/**
 * Runs the analysis, in two phases.
 *
 * Most of the time nothing is wrong, and then one small request is all that is needed. Only once
 * the answer comes back dirty is it worth sending the markup of every block on the page so the
 * findings can be tied to something on screen.
 */
async function run( fields: Fields, signal: AbortSignal ): Promise< Report | null > {
	const data: Record< string, unknown > = {
		post_id: fields.postId,
		post_type: fields.postType,
		title: fields.title,
		content: fields.content,
		excerpt: fields.excerpt,
	};

	const verdict = await apiFetch< unknown >( { path: ROUTE, method: 'POST', data, signal } );

	if ( ! isReadable( verdict ) ) {
		return null;
	}

	if ( ! verdict.applies || ! verdict.changed ) {
		return verdict;
	}

	const attributed = await apiFetch< unknown >( {
		path: ROUTE,
		method: 'POST',
		data: { ...data, fragments: fragmentsFromEditor() },
		signal,
	} );

	return isReadable( attributed ) ? attributed : verdict;
}

/**
 * Keeps the store holding an up-to-date analysis of whatever the editor currently has.
 *
 * `useDebounce` from @wordpress/compose is deliberately not used here. It memoises on
 * `[ fn, wait, options ]` and cancels the pending call whenever any of them changes; this
 * component re-renders on every keystroke, so an inline callback would produce a fresh debounced
 * function each render and cancel itself every time. The request would then never be sent, with
 * no error and nothing in the console to suggest why.
 */
export function useAnalysis(): void {
	const fields = useSelect( ( selectFrom ) => {
		const editor = selectFrom( editorStore );

		return {
			// getEditedPostContent() serialises the whole block tree, but it is a memoised
			// selector, so repeated reads between edits cost nothing.
			title: String( editor.getEditedPostAttribute( 'title' ) ?? '' ),
			content: String( editor.getEditedPostContent() ?? '' ),
			excerpt: String( editor.getEditedPostAttribute( 'excerpt' ) ?? '' ),
			postId: Number( editor.getCurrentPostId() ?? 0 ),
			postType: String( editor.getCurrentPostType() ?? 'post' ),
		} as Fields;
	}, [] );

	// Every request gets a number; only the newest one is allowed to write to the store. The abort
	// below covers most races, but apiFetch's middleware can resolve without consulting the signal.
	const sequence = useRef( 0 );

	// Set when the server says there is nothing to do - the user may post unfiltered HTML, an
	// add-on switched the check off, or the document is past the size this site will analyse.
	// There is no point asking again on every keystroke after any of those.
	const finished = useRef( false );

	useEffect( () => {
		if ( finished.current ) {
			return undefined;
		}

		const controller = new AbortController();
		const mine = ++sequence.current;

		const timer = setTimeout( () => {
			publishAnalyzing( true );

			run( fields, controller.signal )
				.then( ( report ) => {
					if ( mine !== sequence.current ) {
						return;
					}

					if ( report && ! report.applies ) {
						finished.current = true;
					}

					publishReport( report );
				} )
				.catch( ( error: { name?: string; data?: { status?: number } } ) => {
					// apiFetch rethrows the abort as the raw DOMException rather than wrapping it,
					// so this has to test the name. Testing `error.code` instead would let every
					// cancelled keystroke fall through and report a failure that did not happen.
					if ( error?.name === 'AbortError' ) {
						return;
					}

					if ( error?.data?.status === 413 ) {
						finished.current = true;
					}

					if ( mine === sequence.current ) {
						publishReport( null );
					}
				} );
		}, debounceMs() );

		return () => {
			clearTimeout( timer );
			controller.abort();
		};
	}, [ fields.title, fields.content, fields.excerpt, fields.postId, fields.postType ] );
}
