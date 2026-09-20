/**
 * The warning above the editor.
 */
import { dispatch, select } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { store as noticesStore } from '@wordpress/notices';

import { fingerprint, summarise } from '../shared/describe';
import { blockTitle, goToBlock, isReachable } from './wp';
import type { Report } from '../shared/types';

/**
 * A stable id, so the notices reducer replaces the notice instead of stacking copies of it.
 *
 * `CREATE_NOTICE` filters out any existing notice with the same id and appends the new one, which
 * is why the text is only ever re-created when it actually changes: re-creating it on every
 * debounce tick would keep moving it to the bottom of the list, visibly jumping around under
 * other plugins' notices while somebody is trying to read it.
 */
const NOTICE_ID = 'sobol-safe-save-kses-warning';

/** The complaint currently on screen. */
let showing = '';

/** The complaint the user dismissed, which should not come back unchanged. */
let dismissed = '';

/** Which affected block the next "Show me" goes to. */
let cursor = 0;

/**
 * Walks the user through the blocks that will lose something, one click at a time.
 *
 * When the notice says two blocks are affected, "show me" plainly means "show me one, then the
 * next"; stopping at the first would leave the second unfindable from here. With a single affected
 * block it simply goes back to it, which is what the button promises either way.
 *
 * The list is filtered on every click rather than captured once: blocks can be deleted, and a
 * block inside a locked template cannot be selected at all.
 */
function reviewNextBlock( report: Report ): void {
	const reachable = report.blocks.filter( ( block ) => block.key && isReachable( block.key ) );

	if ( ! reachable.length ) {
		return;
	}

	const target = reachable[ cursor % reachable.length ];

	cursor = ( cursor + 1 ) % reachable.length;

	if ( target?.key ) {
		goToBlock( target.key );
	}
}

/**
 * Brings the notice in line with the latest analysis.
 *
 * The notice is dismissible. A warning that cannot be dismissed, redrawn every time the user
 * pauses typing, over content they wrote on purpose, is a block in everything but name - and this
 * edition does not block. Dismissing it silences that particular complaint; a different one, or a
 * new one on top, brings the warning back.
 */
export function syncNotice( report: Report | null ): void {
	const notices = dispatch( noticesStore );

	if ( ! report || ! report.applies || ! report.changed ) {
		if ( showing ) {
			notices.removeNotice( NOTICE_ID );
		}

		showing = '';
		dismissed = '';
		cursor = 0;

		return;
	}

	const current = fingerprint( report );
	const onScreen = select( noticesStore )
		.getNotices()
		.some( ( notice: { id?: string } ) => notice.id === NOTICE_ID );

	// It was on screen, we did not take it down, and it is gone: the user dismissed it.
	if ( showing === current && ! onScreen ) {
		dismissed = current;

		return;
	}

	if ( current === dismissed || ( current === showing && onScreen ) ) {
		return;
	}

	showing = current;

	// A different complaint means starting the walk again from the top.
	cursor = 0;

	const actions = report.blocks.length
		? [
				{
					label: __( 'Show me', 'sobol-safe-save' ),
					onClick: () => reviewNextBlock( report ),
				},
		  ]
		: [];

	notices.createWarningNotice( summarise( report, blockTitle ), {
		id: NOTICE_ID,
		// `type: 'default'` puts it in the editor's notice area. A snackbar would fade away, and
		// this is exactly the kind of thing somebody should be able to read at their own pace.
		type: 'default',
		isDismissible: true,
		actions,
	} );
}

/** Takes the notice down, for when the editor goes away. */
export function clearNotice(): void {
	if ( showing ) {
		dispatch( noticesStore ).removeNotice( NOTICE_ID );
	}

	showing = '';
	dismissed = '';
	cursor = 0;
}
