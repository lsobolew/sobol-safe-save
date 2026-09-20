/**
 * The analysis payload, mirroring what src/Core/Report.php produces.
 *
 * Kept in step with PHP by hand, and versioned: `schemaVersion` is checked before anything here
 * is read, so an add-on script built against an older shape refuses rather than misreads.
 */

/** Wire format this script understands. */
export const SCHEMA_VERSION = 1;

/** Mirrors the KIND_* constants on Core\Differ. */
export type ChangeKind =
	| 'tag_removed'
	| 'attribute_removed'
	| 'style_property_removed'
	| 'block_delimiter_changed'
	| 'entity_changed'
	| 'whitespace_trimmed'
	| 'other';

/** One thing that will be lost. */
export interface Change {
	kind: ChangeKind;
	tag: string;
	name: string;
	count: number;
}

/** A changed post field, or a changed block. */
export interface Finding {
	scope: 'field' | 'block';
	key: string;
	label: string;
	before: string;
	after: string;
	changes: Change[];
}

/** How far the changes could be traced to individual blocks. */
export type Confidence = 'none' | 'partial' | 'full';

/** The whole analysis. */
export interface Report {
	schemaVersion: number;
	applies: boolean;
	changed: boolean;
	confidence: Confidence;
	fields: Record< string, Finding >;
	blocks: Finding[];
}

/** One block's own markup, as sent to the analysis route. */
export interface Fragment {
	clientId: string;
	name: string;
	html: string;
}

/** Whether a payload is one this script knows how to read. */
export function isReadable( report: unknown ): report is Report {
	return (
		!! report &&
		typeof report === 'object' &&
		( report as Report ).schemaVersion === SCHEMA_VERSION
	);
}
