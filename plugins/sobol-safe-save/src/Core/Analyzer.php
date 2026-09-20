<?php
/**
 * Predicts what WordPress will do to a post when it is saved.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Runs the content through the same code `wp_insert_post()` runs it through, without saving.
 *
 * **This class replicates a call site, not a list of filters, and that is the whole point.**
 *
 * The obvious implementation is to repeat what `kses_init_filters()` registers - `wp_kses()` on
 * the content, `wp_kses()` on the excerpt, the restrictive list on the title. It is also wrong.
 * `content_save_pre` carries more than KSES: `convert_invalid_entities` rewrites the Windows-1252
 * range, `balanceTags` runs at priority 50 on sites that enable it, `title_save_pre` is trimmed,
 * `sanitize_post_field()` fires `pre_post_{field}` first, and WordPress keeps adding callbacks
 * (a block-level custom CSS stripper arrived at priority 8 in a recent release). A hand-written
 * list reports "nothing will change" for content that visibly changes, and drifts further with
 * every WordPress release.
 *
 * So instead of guessing which filters run, this calls the one line `wp_insert_post()` calls:
 *
 *     $postarr = sanitize_post( $postarr, 'db' );
 *
 * Everything registered on those hooks, now and in future releases, is picked up for free.
 *
 * ## Slashing
 *
 * Core runs these filters on **slashed** data - `wp_filter_post_kses()` is
 * `addslashes( wp_kses( stripslashes( $data ), 'post' ) )` - because the data came from `$_POST`.
 * Our input comes from the REST API, which is **unslashed** (`WP_REST_Server` calls
 * `wp_unslash( $_POST )`, and JSON bodies are never slashed at all). So the input is slashed on
 * the way in and unslashed on the way out, exactly as core does in `_wp_filter_post_meta_footnotes()`.
 *
 * Never shortcut this by handing unslashed text to `apply_filters( 'content_save_pre', ... )`:
 * `stripslashes()` would then run on text that was never slashed and silently eat backslashes,
 * so every Windows path, regular expression and LaTeX snippet would be reported as damaged when
 * nothing is wrong with it.
 */
final class Analyzer {

	/**
	 * The post fields WordPress filters on save.
	 *
	 * `post_content_filtered` is deliberately absent: it is filtered too, but no editor writes it
	 * directly, so including it would only add a field nothing can act on.
	 */
	const FIELDS = array( 'post_title', 'post_content', 'post_excerpt' );

	/**
	 * Describes the difference between what was written and what would be stored.
	 *
	 * @var Differ
	 */
	private $differ;

	/**
	 * Constructor.
	 *
	 * @param Differ|null $differ Change describer; the default is fine outside tests.
	 */
	public function __construct( ?Differ $differ = null ) {
		$this->differ = $differ ?? new Differ();
	}

	/**
	 * Whether WordPress filters the current user's content at all.
	 *
	 * Note there is no `$user_id` parameter, and adding one would be a lie: `kses_init()` runs on
	 * `init` and `set_current_user` and registers the filters for *the current user*. Asking
	 * "would this apply to user 7" without becoming user 7 cannot change what is registered. Use
	 * {@see self::as_user()} when the answer really is needed for somebody else.
	 *
	 * On a single site this is authors and contributors. On multisite it is everyone except the
	 * super admin - a site administrator included - which is why nothing here looks at role names.
	 */
	public static function applies(): bool {
		if ( ! current_user_can( 'unfiltered_html' ) ) {
			return true;
		}

		/*
		 * The capability and the registered filters can disagree, and only in one direction that
		 * matters. `kses_init()` runs on `init` and `set_current_user`; anything that grants
		 * `unfiltered_html` after that - a security plugin filtering `user_has_cap`, say - does
		 * not unregister what core already added. The capability then says "not filtered" while
		 * the content is still very much filtered, the editor stops asking, and the user loses
		 * work with no warning at all. Checking the filter costs one array lookup and closes it.
		 */
		return false !== has_filter( 'content_save_pre', 'wp_filter_post_kses' );
	}

	/**
	 * Runs a callback as another user, with that user's filters in place.
	 *
	 * For surfaces that analyse somebody else's content: a bulk scan, or a WP-CLI command. The
	 * editor never needs it, because it already runs as the user doing the editing.
	 *
	 * @param int      $user_id  User to become.
	 * @param callable $callback Work to do.
	 *
	 * @return mixed Whatever the callback returns.
	 */
	public function as_user( int $user_id, callable $callback ) {
		$previous = get_current_user_id();

		if ( $user_id === $previous ) {
			return $callback();
		}

		// Assigning the current user fires `set_current_user`, which is what re-registers the
		// KSES filters for the new user. Swapping $GLOBALS['current_user'] by hand would not.
		wp_set_current_user( $user_id );

		try {
			return $callback();
		} finally {
			wp_set_current_user( $previous );
		}
	}

	/**
	 * What WordPress would store, given what the editor currently holds.
	 *
	 * @param array<string, string> $fields Unslashed post fields. Unknown keys are ignored.
	 *
	 * @return array<string, string> The same keys, with the values WordPress would store.
	 */
	public function predict( array $fields ): array {
		$input = array_intersect_key( $fields, array_flip( self::FIELDS ) );

		if ( ! $input ) {
			return array();
		}

		$sanitized = sanitize_post( wp_slash( $input ), 'db' );

		// sanitize_post() adds both of these when they are missing; they are not post content.
		unset( $sanitized['ID'], $sanitized['filter'] );

		return wp_unslash( $sanitized );
	}

	/**
	 * Analyses a prospective save.
	 *
	 * @param array<string, string>                                              $fields    Unslashed post fields.
	 * @param array<int, array{clientId?: string, name?: string, html?: string}> $fragments Per-block markup, each holding only that block's own chunks (see {@see self::fragments_from_content()}).
	 * @param array<string, mixed>                                               $context   Where the analysis came from; passed to add-ons.
	 */
	public function analyze( array $fields, array $fragments = array(), array $context = array() ): Report {
		if ( self::applies() ) {
			$report = $this->build( $fields, $fragments );
		} else {
			$report = Report::not_applicable();
		}

		/**
		 * Fires once a prospective save has been analysed.
		 *
		 * The report is read-only here. This is the hook an add-on uses to keep a history of what
		 * users were about to lose, to alert an administrator, or to feed a site-wide report.
		 *
		 * @param Report               $report  The analysis.
		 * @param array<string, mixed> $context Where it came from: `surface`, `post_id`, `post_type`.
		 */
		do_action( 'sobol_safe_save_analysis_complete', $report, $context );

		return $report;
	}

	/**
	 * Builds the report for a user whose content is filtered.
	 *
	 * @param array<string, string>                                              $fields    Unslashed post fields.
	 * @param array<int, array{clientId?: string, name?: string, html?: string}> $fragments Per-block markup.
	 */
	private function build( array $fields, array $fragments ): Report {
		$fields    = array_intersect_key( $fields, array_flip( self::FIELDS ) );
		$predicted = $this->predict( $fields );
		$findings  = array();

		foreach ( $fields as $name => $before ) {
			$before = (string) $before;
			$after  = (string) ( $predicted[ $name ] ?? $before );

			if ( $after === $before ) {
				continue;
			}

			$findings[ $name ] = Finding::for_field( $name, $before, $after, $this->differ->describe( $before, $after ) );
		}

		list( $blocks, $confidence ) = $this->attribute( $findings, $fragments );

		return new Report( true, $findings, $blocks, $confidence );
	}

	/**
	 * Works out which blocks account for the damage.
	 *
	 * Attribution is a weaker claim than the verdict and is treated as such. Two things make it
	 * unreliable, and both are reported rather than hidden:
	 *
	 * - `balanceTags` closes tags across the whole document, so no single block owns the result.
	 * - A token can straddle a block boundary. A stray `<` at the end of one block is consumed up
	 *   to the next `>` when the document is filtered as a whole, which may sit inside the *next*
	 *   block's opening delimiter - damage the next block's own fragment cannot show.
	 *
	 * @param array<string, Finding>                                             $field_findings Findings for whole fields.
	 * @param array<int, array{clientId?: string, name?: string, html?: string}> $fragments      Per-block markup.
	 *
	 * @return array{0: Finding[], 1: string}
	 */
	private function attribute( array $field_findings, array $fragments ): array {
		if ( ! $fragments || 1 === (int) get_option( 'use_balanceTags' ) ) {
			return array( array(), Report::CONFIDENCE_NONE );
		}

		$blocks = array();

		foreach ( $fragments as $fragment ) {
			$html = (string) ( $fragment['html'] ?? '' );

			if ( '' === trim( $html ) ) {
				continue;
			}

			$predicted = $this->predict( array( 'post_content' => $html ) );
			$after     = (string) ( $predicted['post_content'] ?? $html );

			if ( $after === $html ) {
				continue;
			}

			$blocks[] = Finding::for_block(
				(string) ( $fragment['clientId'] ?? '' ),
				(string) ( $fragment['name'] ?? '' ),
				$html,
				$after,
				$this->differ->describe( $html, $after )
			);
		}

		// Nothing happened to the content itself, so there is nothing for a block to account for:
		// whatever changed was the title or the excerpt, and neither belongs to a block.
		if ( ! isset( $field_findings['post_content'] ) ) {
			return array( $blocks, Report::CONFIDENCE_FULL );
		}

		return array( $blocks, $blocks ? Report::CONFIDENCE_FULL : Report::CONFIDENCE_PARTIAL );
	}

	/**
	 * Splits post content into per-block fragments, for surfaces with no block editor.
	 *
	 * The block editor sends its own fragments, because only it knows the client ids that let a
	 * finding be linked back to a block on screen. Anything without an open editor - a bulk scan,
	 * a WP-CLI command, a classic editing screen - has no such thing, so the blocks are parsed
	 * here and keyed by their position instead.
	 *
	 * Each fragment carries only the block's **own** markup - its delimiters plus the string
	 * chunks of `innerContent`, with the children left out. `serialize_block()` inlines every
	 * child through the null placeholders in `innerContent`, so a naive recursion would report a
	 * Group, the Columns inside it and the broken Paragraph inside those as three separate
	 * problems when the author made one mistake.
	 *
	 * Re-assembling a fragment normalises it slightly (an empty block comes back as a self
	 * closing delimiter, `{}` attributes are dropped). That is harmless here because a fragment
	 * is only ever compared against its own filtered self, never against the original document.
	 *
	 * @param string $content Post content.
	 *
	 * @return array<int, array{clientId: string, name: string, html: string}>
	 */
	public function fragments_from_content( string $content ): array {
		return $this->flatten( parse_blocks( $content ), '' );
	}

	/**
	 * Recursive half of {@see self::fragments_from_content()}.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @param string                           $path   Position of the parent, e.g. `2.0`.
	 *
	 * @return array<int, array{clientId: string, name: string, html: string}>
	 */
	private function flatten( array $blocks, string $path ): array {
		$fragments = array();
		$index     = 0;

		foreach ( $blocks as $block ) {
			$name  = isset( $block['blockName'] ) ? (string) $block['blockName'] : '';
			$inner = isset( $block['innerHTML'] ) ? (string) $block['innerHTML'] : '';

			// The parser emits the whitespace between two blocks as a nameless block. The editor
			// drops those, so counting them would make every position disagree with the editor.
			if ( '' === $name && '' === trim( $inner ) ) {
				continue;
			}

			$position = '' === $path ? (string) $index : $path . '.' . $index;
			++$index;

			$chunks = '';

			foreach ( (array) ( $block['innerContent'] ?? array() ) as $chunk ) {
				if ( is_string( $chunk ) ) {
					$chunks .= $chunk;
				}
			}

			// The delimiters live outside innerContent, and they are the most interesting part:
			// KSES filters the inside of every HTML comment and collapses runs of dashes, so a
			// mangled delimiter is what turns a block into "unexpected or invalid content".
			$own = '' === $name
				? $chunks
				: get_comment_delimited_block_content( $name, (array) ( $block['attrs'] ?? array() ), $chunks );

			$fragments[] = array(
				'clientId' => $position,
				'name'     => $name,
				'html'     => $own,
			);

			$children = (array) ( $block['innerBlocks'] ?? array() );

			if ( $children ) {
				$fragments = array_merge( $fragments, $this->flatten( $children, $position ) );
			}
		}

		return $fragments;
	}
}
