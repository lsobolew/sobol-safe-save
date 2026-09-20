<?php
/**
 * Turns a before/after pair into a list of what was lost.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

use WP_HTML_Tag_Processor;

defined( 'ABSPATH' ) || exit;

/**
 * Describes, in structured terms, how KSES rewrote a piece of markup.
 *
 * Deliberately returns data and not sentences. The editor renders these in JavaScript, from its own
 * text domain, and anything else that wants to describe an analysis - an add-on's admin report, a
 * WP-CLI scan, a notice rendered in PHP - words it in its own place rather than translating
 * someone else's English. Each record is:
 *
 *     array{ kind: string, tag: string, name: string, count: int }
 *
 * `tag` and `name` are empty strings when they do not apply to that kind.
 */
final class Differ {

	/**
	 * A whole element disappeared - `<iframe>`, `<script>`, `<form>`.
	 */
	const KIND_TAG = 'tag_removed';

	/**
	 * An element survived but lost an attribute - `onclick`, `srcdoc`.
	 */
	const KIND_ATTRIBUTE = 'attribute_removed';

	/**
	 * A style attribute survived but lost one declaration - `mask-image`, `position`.
	 */
	const KIND_STYLE = 'style_property_removed';

	/**
	 * A block delimiter comment was rewritten, which is what invalidates a block.
	 */
	const KIND_DELIMITER = 'block_delimiter_changed';

	/**
	 * A character entity was rewritten - `&#147;` becomes `&#8220;`.
	 */
	const KIND_ENTITY = 'entity_changed';

	/**
	 * Leading or trailing whitespace was trimmed (post titles only).
	 */
	const KIND_TRIMMED = 'whitespace_trimmed';

	/**
	 * Something changed that none of the rules above explain.
	 */
	const KIND_OTHER = 'other';

	/**
	 * Describes the difference between the submitted markup and what would be stored.
	 *
	 * @param string $before Markup as written.
	 * @param string $after  Markup as it would be stored.
	 *
	 * @return array<int, array{kind: string, tag: string, name: string, count: int}>
	 */
	public function describe( string $before, string $after ): array {
		if ( $before === $after ) {
			return array();
		}

		$changes = array_merge(
			$this->markup_changes( $before, $after ),
			$this->delimiter_changes( $before, $after ),
			$this->entity_changes( $before, $after ),
			$this->trim_changes( $before, $after )
		);

		// Something was definitely lost, but no rule recognised it. Saying so is better than
		// reporting nothing and letting the user believe the warning was spurious.
		if ( ! $changes ) {
			$changes[] = $this->change( self::KIND_OTHER, '', '', 1 );
		}

		return $changes;
	}

	/**
	 * Tags, attributes and style declarations that exist in `$before` and not in `$after`.
	 *
	 * @param string $before Markup as written.
	 * @param string $after  Markup as it would be stored.
	 *
	 * @return array<int, array{kind: string, tag: string, name: string, count: int}>
	 */
	private function markup_changes( string $before, string $after ): array {
		$from = $this->profile( $before );
		$to   = $this->profile( $after );

		$lost_tags = $this->dropped( $from['tags'], $to['tags'] );
		$changes   = array();

		foreach ( $lost_tags as $tag => $count ) {
			$changes[] = $this->change( self::KIND_TAG, (string) $tag, '', $count );
		}

		foreach ( $this->dropped( $from['attributes'], $to['attributes'] ) as $key => $count ) {
			list( $tag, $name ) = $this->split( (string) $key );

			// An attribute on an element that vanished entirely is already covered by the tag
			// record; reporting both reads as two problems where the author made one mistake.
			if ( isset( $lost_tags[ $tag ] ) ) {
				continue;
			}

			$changes[] = $this->change( self::KIND_ATTRIBUTE, $tag, $name, $count );
		}

		foreach ( $this->dropped( $from['styles'], $to['styles'] ) as $key => $count ) {
			list( $tag, $name ) = $this->split( (string) $key );

			$changes[] = $this->change( self::KIND_STYLE, $tag, $name, $count );
		}

		return $changes;
	}

	/**
	 * Counts, per key, how much of `$from` did not survive into `$to`.
	 *
	 * @param array<string, int> $from Counts before filtering.
	 * @param array<string, int> $to   Counts after filtering.
	 *
	 * @return array<string, int>
	 */
	private function dropped( array $from, array $to ): array {
		$lost = array();

		foreach ( $from as $key => $count ) {
			$remaining = $to[ $key ] ?? 0;

			if ( $count > $remaining ) {
				$lost[ $key ] = $count - $remaining;
			}
		}

		return $lost;
	}

	/**
	 * Splits a "tag.name" profile key.
	 *
	 * @param string $key Profile key.
	 *
	 * @return array{0: string, 1: string}
	 */
	private function split( string $key ): array {
		$at = strpos( $key, '.' );

		if ( false === $at ) {
			return array( $key, '' );
		}

		return array( substr( $key, 0, $at ), substr( $key, $at + 1 ) );
	}

	/**
	 * Counts tags, attributes and style declarations in a piece of markup.
	 *
	 * Uses the HTML API rather than a regex: it applies the same parsing rules the browser does,
	 * so what it counts is what a reader would actually see as an element.
	 *
	 * @param string $html Markup.
	 *
	 * @return array{tags: array<string, int>, attributes: array<string, int>, styles: array<string, int>}
	 */
	private function profile( string $html ): array {
		$tags       = array();
		$attributes = array();
		$styles     = array();

		$processor = new WP_HTML_Tag_Processor( $html );

		while ( $processor->next_tag() ) {
			$tag = strtolower( (string) $processor->get_tag() );

			$tags[ $tag ] = ( $tags[ $tag ] ?? 0 ) + 1;

			$names = $processor->get_attribute_names_with_prefix( '' );

			foreach ( (array) $names as $name ) {
				$name = strtolower( (string) $name );
				$key  = $tag . '.' . $name;

				$attributes[ $key ] = ( $attributes[ $key ] ?? 0 ) + 1;

				if ( 'style' !== $name ) {
					continue;
				}

				foreach ( $this->style_properties( (string) $processor->get_attribute( 'style' ) ) as $property ) {
					$style_key = $tag . '.' . $property;

					$styles[ $style_key ] = ( $styles[ $style_key ] ?? 0 ) + 1;
				}
			}
		}

		return array(
			'tags'       => $tags,
			'attributes' => $attributes,
			'styles'     => $styles,
		);
	}

	/**
	 * Property names declared in a style attribute.
	 *
	 * @param string $style Value of a style attribute.
	 *
	 * @return string[]
	 */
	private function style_properties( string $style ): array {
		$properties = array();

		foreach ( explode( ';', $style ) as $declaration ) {
			$at = strpos( $declaration, ':' );

			if ( false === $at ) {
				continue;
			}

			$property = strtolower( trim( substr( $declaration, 0, $at ) ) );

			if ( '' !== $property ) {
				$properties[] = $property;
			}
		}

		return $properties;
	}

	/**
	 * Whether any HTML comment was rewritten.
	 *
	 * This is the one that matters most in the block editor. KSES runs its own filter over the
	 * inside of every comment and collapses runs of dashes, and a block's opening delimiter is a
	 * comment. Rewrite it and the block stops matching what the editor expects, so the post opens
	 * with "this block contains unexpected or invalid content" instead of the content.
	 *
	 * @param string $before Markup as written.
	 * @param string $after  Markup as it would be stored.
	 *
	 * @return array<int, array{kind: string, tag: string, name: string, count: int}>
	 */
	private function delimiter_changes( string $before, string $after ): array {
		$from = $this->comments( $before );
		$to   = $this->comments( $after );

		$lost = 0;

		foreach ( $from as $comment ) {
			$at = array_search( $comment, $to, true );

			if ( false === $at ) {
				++$lost;

				continue;
			}

			unset( $to[ $at ] );
		}

		return $lost ? array( $this->change( self::KIND_DELIMITER, '', '', $lost ) ) : array();
	}

	/**
	 * Every HTML comment in a piece of markup, in order.
	 *
	 * @param string $html Markup.
	 *
	 * @return string[]
	 */
	private function comments( string $html ): array {
		if ( ! preg_match_all( '/<!--.*?-->/s', $html, $matches ) ) {
			return array();
		}

		return $matches[0];
	}

	/**
	 * Whether numeric character entities were rewritten.
	 *
	 * WordPress maps the Windows-1252 range onto its Unicode equivalents on the way in, so
	 * `&#147;` is stored as `&#8220;`. Harmless, but it is a change, and a plugin that claims to
	 * report every change has to name this one rather than fall through to "something changed".
	 *
	 * @param string $before Markup as written.
	 * @param string $after  Markup as it would be stored.
	 *
	 * @return array<int, array{kind: string, tag: string, name: string, count: int}>
	 */
	private function entity_changes( string $before, string $after ): array {
		preg_match_all( '/&#[0-9]+;/', $before, $from );
		preg_match_all( '/&#[0-9]+;/', $after, $to );

		$lost = array_diff_assoc( $from[0], $to[0] );

		return $lost ? array( $this->change( self::KIND_ENTITY, '', '', count( $lost ) ) ) : array();
	}

	/**
	 * Whether the only difference is surrounding whitespace.
	 *
	 * Post titles go through `trim()` before KSES ever sees them.
	 *
	 * @param string $before Markup as written.
	 * @param string $after  Markup as it would be stored.
	 *
	 * @return array<int, array{kind: string, tag: string, name: string, count: int}>
	 */
	private function trim_changes( string $before, string $after ): array {
		return trim( $before ) === $after && $before !== $after
			? array( $this->change( self::KIND_TRIMMED, '', '', 1 ) )
			: array();
	}

	/**
	 * Builds one change record.
	 *
	 * @param string $kind  One of the KIND_* constants.
	 * @param string $tag   Element the change applies to, or an empty string.
	 * @param string $name  Attribute or property name, or an empty string.
	 * @param int    $count How many times it happened.
	 *
	 * @return array{kind: string, tag: string, name: string, count: int}
	 */
	private function change( string $kind, string $tag, string $name, int $count ): array {
		return array(
			'kind'  => $kind,
			'tag'   => $tag,
			'name'  => $name,
			'count' => $count,
		);
	}
}
