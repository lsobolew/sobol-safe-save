/**
 * Sobol Safe Save in the block editor.
 *
 * Warns, and never blocks. The save button stays exactly as it was; the only thing this adds is
 * knowing, before the click, what the click will cost.
 */
import { useSelect } from '@wordpress/data';
import { useEffect } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';

import { clearNotice, syncNotice } from './notice';
import { SobolSafeSavePanel } from './panel';
import { STORE_NAME } from './store';
import { useAnalysis } from './use-report';
import type { Report } from '../shared/types';

import './store';
import './editor.scss';

/**
 * Runs the analysis and keeps the notice in step with it.
 *
 * Headless on purpose. The analysis subscribes to the whole post content, so anything rendered
 * from the same component would re-render on every keystroke; the visible part lives in the panel,
 * which only ever reads the finished report.
 */
function SobolSafeSaveWatcher() {
	useAnalysis();

	const report = useSelect(
		( selectFrom ) => ( selectFrom( STORE_NAME ) as { getReport: () => Report | null } ).getReport(),
		[]
	);

	useEffect( () => {
		syncNotice( report );
	}, [ report ] );

	// Leaving the editor with the warning still pinned would strand it on whatever comes next.
	useEffect( () => clearNotice, [] );

	return null;
}

registerPlugin( 'sobol-safe-save', {
	render: () => (
		<>
			<SobolSafeSaveWatcher />
			<SobolSafeSavePanel />
		</>
	),
} );
