/**
 * The document sidebar panel listing what a save would cost.
 */
import { Button, Notice } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';

import { describeFinding, fieldLabel } from '../shared/describe';
import { diff } from '../shared/diff';
import { sobolSafeSaveStore } from './store';
import { blockTitle, goToBlock, isReachable } from './wp';
import type { Finding, Report } from '../shared/types';

/** The list of sentences describing one finding. */
function Changes( { finding }: { finding: Finding } ) {
	return (
		<ul className="sobol-safe-save-panel__changes">
			{ describeFinding( finding ).map( ( sentence, index ) => (
				<li key={ index }>{ sentence }</li>
			) ) }
		</ul>
	);
}

/**
 * The markup itself, before and after, with the difference marked.
 *
 * Collapsed, because most of the time the sentence above it is the whole answer and nobody wants
 * raw HTML in their sidebar. Open, because sometimes it is not: a sentence saying an attribute
 * will be removed does not tell you *which* of the three elements on the line it belonged to, and
 * only the markup can.
 */
function RawDiff( { finding }: { finding: Finding } ) {
	const parts = diff( finding.before, finding.after );

	if ( ! parts.removed && ! parts.added ) {
		return null;
	}

	return (
		<details className="sobol-safe-save-panel__diff">
			<summary>{ __( 'Show the markup that changes', 'sobol-safe-save' ) }</summary>
			<pre className="sobol-safe-save-panel__code">
				<code>
					{ parts.prefix }
					{ !! parts.removed && <del>{ parts.removed }</del> }
					{ !! parts.added && <ins>{ parts.added }</ins> }
					{ parts.suffix }
				</code>
			</pre>
			{ parts.trimmed && (
				<p className="sobol-safe-save-panel__trimmed">
					{ __( 'Shortened around the change.', 'sobol-safe-save' ) }
				</p>
			) }
		</details>
	);
}

/** One block that will lose something. */
function BlockFinding( { finding }: { finding: Finding } ) {
	const label = blockTitle( finding.label );

	return (
		<li className="sobol-safe-save-panel__item">
			<h3 className="sobol-safe-save-panel__name">{ label }</h3>
			<Changes finding={ finding } />
			<RawDiff finding={ finding } />
			{ isReachable( finding.key ) && (
				<Button variant="secondary" size="small" onClick={ () => goToBlock( finding.key ) }>
					{ __( 'Go to block', 'sobol-safe-save' ) }
				</Button>
			) }
		</li>
	);
}

/** One post field that will lose something. */
function FieldFinding( { field, finding }: { field: string; finding: Finding } ) {
	return (
		<li className="sobol-safe-save-panel__item">
			<h3 className="sobol-safe-save-panel__name">{ fieldLabel( field ) }</h3>
			<Changes finding={ finding } />
			<RawDiff finding={ finding } />
		</li>
	);
}

/** The contents of the panel for a report that found something. */
function Findings( { report }: { report: Report } ) {
	// Title and excerpt are not blocks, so they are always listed in their own right. Content is
	// listed here only when no block could be held responsible for it - otherwise the block list
	// below says the same thing, more precisely.
	const fields = Object.entries( report.fields ).filter(
		( [ field ] ) => field !== 'post_content' || ! report.blocks.length
	);

	return (
		<>
			{ report.confidence === 'partial' && (
				<Notice status="info" isDismissible={ false } className="sobol-safe-save-panel__note">
					{ __(
						'Something will be lost, but it could not be traced to one block. This usually means a stray "<" or an unfinished comment running across a block boundary.',
						'sobol-safe-save'
					) }
				</Notice>
			) }

			{ report.confidence === 'none' && !! report.blocks.length === false && (
				<Notice status="info" isDismissible={ false } className="sobol-safe-save-panel__note">
					{ __(
						'This site closes unbalanced tags on save, which happens across the whole post, so individual blocks cannot be singled out.',
						'sobol-safe-save'
					) }
				</Notice>
			) }

			<ul className="sobol-safe-save-panel__list">
				{ fields.map( ( [ field, finding ] ) => (
					<FieldFinding key={ field } field={ field } finding={ finding } />
				) ) }
				{ report.blocks.map( ( finding, index ) => (
					<BlockFinding key={ finding.key || index } finding={ finding } />
				) ) }
			</ul>
		</>
	);
}

/**
 * The panel itself.
 *
 * Imported from `@wordpress/editor`, not `@wordpress/edit-post`. The slots moved in WordPress 6.6
 * and the old home is a deprecation shim that logs on every page load and renders nothing at all
 * in the site editor. 6.6 is this plugin's minimum, so no fallback is needed.
 */
export function SobolSafeSavePanel() {
	const { report, isAnalyzing } = useSelect( ( selectFrom ) => {
		const store = selectFrom( sobolSafeSaveStore );

		return { report: store.getReport(), isAnalyzing: store.isAnalyzing() };
	}, [] );

	// Nothing useful to say to somebody whose content is never filtered, so the panel stays out of
	// their sidebar entirely rather than sitting there permanently reporting nothing.
	if ( report && ! report.applies ) {
		return null;
	}

	return (
		<PluginDocumentSettingPanel
			name="sobol-safe-save"
			title={ __( 'Sobol Safe Save', 'sobol-safe-save' ) }
			className="sobol-safe-save-panel"
		>
			{ /* Our own wrapper, so tests and styles have a hook that belongs to this plugin
			     rather than depending on what the surrounding panel does with a className. */ }
			<div className="sobol-safe-save-panel__body">
				{ ! report && (
					<p>
						{ isAnalyzing
							? __( 'Checking your content…', 'sobol-safe-save' )
							: __( 'Your content has not been checked yet.', 'sobol-safe-save' ) }
					</p>
				) }

				{ report && ! report.changed && (
					<p>{ __( 'Nothing will be lost when you save.', 'sobol-safe-save' ) }</p>
				) }

				{ report && report.changed && <Findings report={ report } /> }
			</div>
		</PluginDocumentSettingPanel>
	);
}
