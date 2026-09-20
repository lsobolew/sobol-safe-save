/**
 * Reducing a before/after pair to the part that actually differs.
 */

/** A before/after pair with the unchanged ends trimmed away. */
export interface Diff {
	/** What comes before the change, possibly shortened. */
	prefix: string;
	/** The text that is there now and will not survive as it stands. */
	removed: string;
	/** What takes its place, empty when something is simply deleted. */
	added: string;
	/** What comes after the change, possibly shortened. */
	suffix: string;
	/** Whether either end was shortened to keep the view readable. */
	trimmed: boolean;
}

/** How much unchanged context to keep on each side of the change. */
const CONTEXT = 48;

/**
 * Splits markup into tags and the text between them.
 *
 * Matching whole tags rather than characters is what keeps the result readable: a character-level
 * comparison of `<a href="x" onclick="y">` against `<a href="x">` happily reports that `onclick="y"`
 * vanished *and* leaves the two halves of the tag dangling on either side of it. Comparing whole
 * tags says the far more useful thing - this tag becomes that tag - and can never cut one in half.
 */
function tokenize( html: string ): string[] {
	return html.match( /<[^>]*>|[^<]+/g ) ?? [];
}

/** Shortens a string from the left, marking that it was shortened. */
function tailOf( text: string ): { text: string; trimmed: boolean } {
	return text.length > CONTEXT
		? { text: '…' + text.slice( -CONTEXT ), trimmed: true }
		: { text, trimmed: false };
}

/** Shortens a string from the right, marking that it was shortened. */
function headOf( text: string ): { text: string; trimmed: boolean } {
	return text.length > CONTEXT
		? { text: text.slice( 0, CONTEXT ) + '…', trimmed: true }
		: { text, trimmed: false };
}

/**
 * Narrows a replacement down to the characters that actually differ.
 *
 * The token pass cannot see inside a token, and an HTML comment is one token. So a single dash
 * changing inside `<!-- analytics -- do not remove -->` comes out of it as the whole comment being
 * replaced by an almost identical one: true, and useless to look at. Running the same trim again
 * over that one span, this time character by character, leaves just the dash.
 *
 * Only ever applied to the narrow span the token pass produced, so it stays cheap however long the
 * post is.
 */
function narrow( removed: string, added: string ): { head: string; removed: string; added: string; tail: string } {
	let head = 0;

	while ( head < removed.length && head < added.length && removed[ head ] === added[ head ] ) {
		head++;
	}

	let tail = 0;

	while (
		tail < removed.length - head &&
		tail < added.length - head &&
		removed[ removed.length - 1 - tail ] === added[ added.length - 1 - tail ]
	) {
		tail++;
	}

	return {
		head: removed.slice( 0, head ),
		removed: removed.slice( head, removed.length - tail ),
		added: added.slice( head, added.length - tail ),
		tail: removed.slice( removed.length - tail ),
	};
}

/**
 * What changed between the two, with the matching ends taken off.
 *
 * Deliberately not a full longest-common-subsequence diff. What WordPress does on save is
 * overwhelmingly one localised edit - an element dropped, an attribute stripped, a style
 * declaration removed - and for that, trimming the common head and tail gives the same answer as
 * an LCS for none of the cost. An LCS over a long post would be quadratic in both time and memory,
 * on a code path that runs every time somebody stops typing.
 *
 * Where several separate things change, this reports one span covering all of them. That is less
 * precise, and it is still true: everything between those two points is going to be rewritten.
 */
export function diff( before: string, after: string ): Diff {
	const from = tokenize( before );
	const to = tokenize( after );

	let start = 0;

	while ( start < from.length && start < to.length && from[ start ] === to[ start ] ) {
		start++;
	}

	let end = 0;

	while (
		end < from.length - start &&
		end < to.length - start &&
		from[ from.length - 1 - end ] === to[ to.length - 1 - end ]
	) {
		end++;
	}

	let prefix = from.slice( 0, start ).join( '' );
	let removed = from.slice( start, from.length - end ).join( '' );
	let added = to.slice( start, to.length - end ).join( '' );
	let suffix = from.slice( from.length - end ).join( '' );

	// One thing replacing another is worth looking at more closely; something simply disappearing
	// is already as narrow as it gets.
	if ( removed && added ) {
		const inner = narrow( removed, added );

		prefix += inner.head;
		removed = inner.removed;
		added = inner.added;
		suffix = inner.tail + suffix;
	}

	// Shortened last, once the change has been located. Trimming the context first would sometimes
	// cut away the very part the second pass was about to move into it.
	const head = tailOf( prefix );
	const foot = headOf( suffix );

	return {
		prefix: head.text,
		removed,
		added,
		suffix: foot.text,
		trimmed: head.trimmed || foot.trimmed,
	};
}
