/**
 * The public JavaScript surface.
 *
 * Sobol Safe Save's free edition warns and never blocks. A paid add-on that wants to block a save reads
 * the report from here and calls `lockPostSaving` itself, in its own script - which is why there
 * is no locking code anywhere in this plugin, not even behind a flag. WordPress.org forbids
 * shipping functionality that is present but switched off pending payment, and "present but
 * switched off" is exactly what a `shouldLock` filter around a `lockPostSaving` call would be.
 *
 * So the contract is one-directional and read-only:
 *
 *   wp.data.select( 'sobol-safe-save' ).getReport()      the latest analysis, or null
 *   wp.data.select( 'sobol-safe-save' ).isAnalyzing()    whether a request is in flight
 *   wp.hooks.addAction( 'sobol_safe_save.report', ... )   fires after every completed analysis
 *
 * Note the dot in the action name. `@wordpress/hooks` validates hook names against
 * /^[a-zA-Z][a-zA-Z0-9_.-]*$/ and rejects anything with a slash, so `sobol-safe-save/report` would be
 * refused at runtime with nothing but a console error to show for it.
 */
import { createReduxStore, register, dispatch } from '@wordpress/data';
import { doAction } from '@wordpress/hooks';

import type { Report } from '../shared/types';

/** Name of the data store. Unlike hook names, store names may contain slashes; this one does not. */
export const STORE_NAME = 'sobol-safe-save';

/** Action fired after every completed analysis. */
export const REPORT_ACTION = 'sobol_safe_save.report';

interface State {
	report: Report | null;
	isAnalyzing: boolean;
}

type Action =
	| { type: 'SET_REPORT'; report: Report | null }
	| { type: 'SET_ANALYZING'; isAnalyzing: boolean };

const DEFAULT_STATE: State = { report: null, isAnalyzing: false };

export const sobolSafeSaveStore = createReduxStore( STORE_NAME, {
	reducer( state: State = DEFAULT_STATE, action: Action ): State {
		switch ( action.type ) {
			case 'SET_REPORT':
				return { ...state, report: action.report, isAnalyzing: false };
			case 'SET_ANALYZING':
				return { ...state, isAnalyzing: action.isAnalyzing };
			default:
				return state;
		}
	},
	actions: {
		setReport: ( report: Report | null ): Action => ( { type: 'SET_REPORT', report } ),
		setAnalyzing: ( isAnalyzing: boolean ): Action => ( { type: 'SET_ANALYZING', isAnalyzing } ),
	},
	selectors: {
		getReport: ( state: State ): Report | null => state.report,
		isAnalyzing: ( state: State ): boolean => state.isAnalyzing,
	},
} );

// Registered at module scope on purpose: a component that selects from a store which has not been
// registered yet gets undefined rather than an error, which is a hard thing to notice.
register( sobolSafeSaveStore );

/** Records an analysis and tells anybody listening. */
export function publishReport( report: Report | null ): void {
	dispatch( sobolSafeSaveStore ).setReport( report );
	doAction( REPORT_ACTION, report );
}

/** Records that a request is in flight. */
export function publishAnalyzing( isAnalyzing: boolean ): void {
	dispatch( sobolSafeSaveStore ).setAnalyzing( isAnalyzing );
}
