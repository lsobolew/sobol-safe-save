/**
 * Turns the analysis into sentences.
 *
 * The server returns structured records rather than prose, so that this file and anything else
 * describing an analysis can each word it in their own language, from their own text domain.
 */
import { __, _n, sprintf } from '@wordpress/i18n';

import type { Change, ChangeKind, Finding, Report } from './types';

/** Human-readable names for the post fields, since "post_excerpt" means nothing to a writer. */
const FIELD_LABELS: Record< string, () => string > = {
	post_title: () => __( 'Title', 'sobol-safe-save' ),
	post_content: () => __( 'Content', 'sobol-safe-save' ),
	post_excerpt: () => __( 'Excerpt', 'sobol-safe-save' ),
};

/**
 * How much each kind of change matters, for deciding what a one-line warning should lead with.
 *
 * A rewritten block marker is far and away the worst thing on this list, and the least obvious: it
 * does not remove anything visible, it makes the block stop matching what the editor expects, so
 * the post reopens showing "this block contains unexpected or invalid content" instead of the
 * content. Losing an element is next, because something visible goes. Trimmed spaces are noise by
 * comparison, and must never be what the warning talks about while an iframe is disappearing.
 *
 * `other` sits in the middle on purpose: it means the difference could not be explained, and an
 * unexplained change deserves more attention than a cosmetic one and less than a known loss.
 */
const SEVERITY: Record< ChangeKind, number > = {
	block_delimiter_changed: 6,
	tag_removed: 5,
	attribute_removed: 4,
	style_property_removed: 3,
	other: 2,
	entity_changed: 1,
	whitespace_trimmed: 1,
};

/** The name of a post field, as a person would say it. */
export function fieldLabel( field: string ): string {
	const label = FIELD_LABELS[ field ];

	return label ? label() : field;
}

/** One change, as a full sentence, for the list in the panel. */
export function describeChange( change: Change ): string {
	const { kind, tag, name, count } = change;

	switch ( kind ) {
		case 'tag_removed':
			return sprintf(
				/* translators: 1: number of elements, 2: HTML tag name, for example "iframe". */
				_n(
					'The <%2$s> element will be removed.',
					'%1$d <%2$s> elements will be removed.',
					count,
					'sobol-safe-save'
				),
				count,
				tag
			);

		case 'attribute_removed':
			return sprintf(
				/* translators: 1: attribute name, for example "onclick", 2: HTML tag name. */
				__( 'The %1$s attribute will be removed from <%2$s>.', 'sobol-safe-save' ),
				name,
				tag
			);

		case 'style_property_removed':
			return sprintf(
				/* translators: 1: CSS property name, for example "mask-image", 2: HTML tag name. */
				__( 'The %1$s style will be removed from <%2$s>.', 'sobol-safe-save' ),
				name,
				tag
			);

		case 'block_delimiter_changed':
			return __(
				'A block marker will be rewritten, so the block will open as invalid next time.',
				'sobol-safe-save'
			);

		case 'entity_changed':
			return __( 'Some characters will be rewritten to their standard equivalents.', 'sobol-safe-save' );

		case 'whitespace_trimmed':
			return __( 'Leading and trailing spaces will be removed.', 'sobol-safe-save' );

		default:
			return __( 'Part of this will be rewritten.', 'sobol-safe-save' );
	}
}

/**
 * One change as a fragment, for dropping into the middle of the warning line.
 *
 * Separate strings from the sentences above, rather than the same ones with the first letter
 * lowercased. Changing the case of a translated string is a bug in every language whose nouns are
 * capitalised, and in several that do not use case at all; a translator given a fragment can write
 * a fragment.
 */
function changePhrase( change: Change ): string {
	const { kind, tag, name, count } = change;

	switch ( kind ) {
		case 'tag_removed':
			return sprintf(
				/* translators: a fragment. 1: number of elements, 2: HTML tag name. */
				_n(
					'the <%2$s> element will be removed',
					'%1$d <%2$s> elements will be removed',
					count,
					'sobol-safe-save'
				),
				count,
				tag
			);

		case 'attribute_removed':
			return sprintf(
				/* translators: a fragment. 1: attribute name, 2: HTML tag name. */
				__( 'the %1$s attribute will be removed from <%2$s>', 'sobol-safe-save' ),
				name,
				tag
			);

		case 'style_property_removed':
			return sprintf(
				/* translators: a fragment. 1: CSS property name, 2: HTML tag name. */
				__( 'the %1$s style will be removed from <%2$s>', 'sobol-safe-save' ),
				name,
				tag
			);

		case 'block_delimiter_changed':
			return __(
				'a block marker will be rewritten, so that block will open as invalid',
				'sobol-safe-save'
			);

		case 'entity_changed':
			return __( 'some characters will be rewritten', 'sobol-safe-save' );

		case 'whitespace_trimmed':
			return __( 'surrounding spaces will be removed', 'sobol-safe-save' );

		default:
			return __( 'part of it will be rewritten', 'sobol-safe-save' );
	}
}

/** Every change in a finding, as sentences. */
export function describeFinding( finding: Finding ): string[] {
	return finding.changes.map( describeChange );
}

/** The most serious change in the report, and where it came from. */
interface Worst {
	change: Change;
	block: string | null;
	field: string | null;
}

/** Finds the change worth leading with. */
function worstChange( report: Report ): Worst | null {
	let worst: Worst | null = null;

	const consider = ( change: Change, block: string | null, field: string | null ): void => {
		if ( ! worst || SEVERITY[ change.kind ] > SEVERITY[ worst.change.kind ] ) {
			worst = { change, block, field };
		}
	};

	// Blocks first, so that on an equal score the warning names something the reader can jump to.
	for ( const finding of report.blocks ) {
		for ( const change of finding.changes ) {
			consider( change, finding.label, null );
		}
	}

	for ( const [ field, finding ] of Object.entries( report.fields ) ) {
		for ( const change of finding.changes ) {
			consider( change, null, field );
		}
	}

	return worst;
}

/**
 * The one line that goes in the editor notice.
 *
 * It names the worst thing that will happen rather than counting how many blocks are involved. A
 * count answers "how much?" when the question somebody actually has is "what?" - and the analysis
 * already knows the answer, so withholding it would be an odd kind of tidiness.
 *
 * @param report     The analysis.
 * @param blockTitle Turns a registered block name into the one shown on screen. Optional, so that
 *                   callers without the block registry still get a sensible line.
 */
export function summarise( report: Report, blockTitle: ( name: string ) => string = ( name ) => name ): string {
	const worst = worstChange( report );

	if ( ! worst ) {
		return '';
	}

	const phrase = changePhrase( worst.change );
	const blocks = report.blocks.length;

	if ( blocks > 1 ) {
		return sprintf(
			/* translators: 1: number of blocks, 2: a fragment describing the most serious change. */
			__( 'Saving will change %1$d blocks. The most serious: %2$s.', 'sobol-safe-save' ),
			blocks,
			phrase
		);
	}

	if ( 1 === blocks && worst.block !== null ) {
		return sprintf(
			/* translators: 1: block name, for example "Custom HTML". 2: a fragment describing the change. */
			__( 'Saving will change %1$s: %2$s.', 'sobol-safe-save' ),
			blockTitle( worst.block ),
			phrase
		);
	}

	if ( worst.field ) {
		return sprintf(
			/* translators: 1: post field name, for example "Title". 2: a fragment describing the change. */
			__( 'Saving will change the %1$s: %2$s.', 'sobol-safe-save' ),
			fieldLabel( worst.field ),
			phrase
		);
	}

	return sprintf(
		/* translators: %s: a fragment describing the change. */
		__( 'Saving will change your content: %s.', 'sobol-safe-save' ),
		phrase
	);
}

/**
 * A short, stable identity for what a report is complaining about.
 *
 * Used to decide whether a notice the user already dismissed should come back. It deliberately
 * ignores the text itself and looks only at what is wrong and where: retyping a paragraph around
 * the same stray iframe should not make the warning reappear, but adding a second problem should.
 */
export function fingerprint( report: Report ): string {
	const parts: string[] = [];

	for ( const [ field, finding ] of Object.entries( report.fields ) ) {
		parts.push(
			`${ field }:${ finding.changes
				.map( ( c ) => `${ c.kind }/${ c.tag }/${ c.name }/${ c.count }` )
				.join( ',' ) }`
		);
	}

	for ( const block of report.blocks ) {
		parts.push(
			`${ block.key }:${ block.changes.map( ( c ) => `${ c.kind }/${ c.tag }/${ c.name }` ).join( ',' ) }`
		);
	}

	return parts.sort().join( '|' );
}
