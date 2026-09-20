/**
 * Typed access to the editor stores.
 *
 * `@wordpress/block-editor` exports a store descriptor with no selector types attached, so
 * `select( blockEditorStore ).getBlocks()` is a type error even though it is the documented way to
 * call it. Rather than scatter a cast at every call site - where each one silently becomes a place
 * a typo would not be caught - the casts live here, once, against the narrow slice this plugin
 * actually uses. Everything outside this file stays strictly typed.
 */
import { store as blockEditorStore } from '@wordpress/block-editor';
import { getBlockType } from '@wordpress/blocks';
import { dispatch, select } from '@wordpress/data';
import { __ } from '@wordpress/i18n';

import type { BlockInstance } from '@wordpress/blocks';

/** The handful of block editor selectors this plugin reads. */
interface BlockEditorSelectors {
	getBlocks: () => BlockInstance[];
	getBlock: ( clientId: string ) => BlockInstance | null;
	getSelectedBlockClientId: () => string | null;
	/** Added in a later WordPress than this plugin's minimum, hence optional. */
	getBlockEditingMode?: ( clientId: string ) => string;
}

/** The block editor actions this plugin dispatches. */
interface BlockEditorActions {
	selectBlock: ( clientId: string ) => void;
	clearSelectedBlock: () => void;
}

/** Block editor selectors. */
export function blocks(): BlockEditorSelectors {
	return select( blockEditorStore ) as unknown as BlockEditorSelectors;
}

/** Block editor actions. */
export function blockActions(): BlockEditorActions {
	return dispatch( blockEditorStore ) as unknown as BlockEditorActions;
}

/**
 * Selects a block and scrolls to it, however many times it is asked.
 *
 * Scrolling is left to core. The block's own `useScrollIntoView` reacts to *becoming* selected and
 * does it inside the editor iframe - somewhere a `document.getElementById()` from this script
 * cannot reach, because for a block theme the canvas is a separate document.
 *
 * Reacting to becoming selected is also why selecting the block that is already selected looks
 * broken: the store state does not change, nothing transitions, and the click appears to do
 * nothing at all. Clearing the selection first restores the transition - on a later tick, because
 * React batches two dispatches in the same tick into a single render, and a render that goes
 * straight from selected to selected is exactly the thing that was missing.
 */
export function goToBlock( clientId: string ): void {
	const store = blocks();

	if ( ! store.getBlock( clientId ) ) {
		return;
	}

	const actions = blockActions();

	if ( store.getSelectedBlockClientId() === clientId ) {
		actions.clearSelectedBlock();
		window.setTimeout( () => actions.selectBlock( clientId ), 0 );

		return;
	}

	actions.selectBlock( clientId );
}

/**
 * Whether a block can be jumped to at all.
 *
 * A block inside a locked template or a synced pattern cannot be selected on its own, and an
 * affordance that does nothing when clicked is worse than no affordance.
 */
export function isReachable( clientId: string ): boolean {
	const store = blocks();

	if ( ! store.getBlock( clientId ) ) {
		return false;
	}

	return store.getBlockEditingMode?.( clientId ) !== 'disabled';
}

/**
 * The name a writer would recognise.
 *
 * The server only knows a block by its registered name, because that is all the markup carries.
 * The editor knows what it is called on screen, and "Custom HTML" is a great deal more use to
 * somebody hunting for the problem than "core/html".
 */
export function blockTitle( name: string ): string {
	if ( ! name ) {
		return __( 'Classic content', 'sobol-safe-save' );
	}

	return getBlockType( name )?.title ?? name;
}
