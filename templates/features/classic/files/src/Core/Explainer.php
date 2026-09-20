<?php
/**
 * Change records, in sentences.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Says, in words, what a change record means.
 *
 * The block editor does this in TypeScript and this does it in PHP, deliberately. {@see Differ}
 * returns structure rather than prose precisely so that neither side has to translate the other's
 * English: each renders in its own language, from its own text domain, in its own place.
 */
final class Explainer {

	/**
	 * A single change, as a sentence.
	 *
	 * @param array{kind: string, tag: string, name: string, count: int} $change Change record.
	 */
	public function change( array $change ): string {
		$kind  = (string) ( $change['kind'] ?? Differ::KIND_OTHER );
		$tag   = (string) ( $change['tag'] ?? '' );
		$name  = (string) ( $change['name'] ?? '' );
		$count = (int) ( $change['count'] ?? 1 );

		switch ( $kind ) {
			case Differ::KIND_TAG:
				return sprintf(
					/* translators: 1: number of elements, 2: HTML tag name, for example "iframe". */
					_n(
						'The <%2$s> element was removed (%1$d).',
						'The <%2$s> elements were removed (%1$d).',
						$count,
						'sobol-safe-save'
					),
					$count,
					$tag
				);

			case Differ::KIND_ATTRIBUTE:
				return sprintf(
					/* translators: 1: attribute name, for example "onclick", 2: HTML tag name. */
					__( 'The %1$s attribute was removed from <%2$s>.', 'sobol-safe-save' ),
					$name,
					$tag
				);

			case Differ::KIND_STYLE:
				return sprintf(
					/* translators: 1: CSS property name, for example "mask-image", 2: HTML tag name. */
					__( 'The %1$s style was removed from <%2$s>.', 'sobol-safe-save' ),
					$name,
					$tag
				);

			case Differ::KIND_DELIMITER:
				return __(
					'A block marker was rewritten, so that block will open as invalid.',
					'sobol-safe-save'
				);

			case Differ::KIND_ENTITY:
				return __( 'Some characters were rewritten to their standard equivalents.', 'sobol-safe-save' );

			case Differ::KIND_TRIMMED:
				return __( 'Leading and trailing spaces were removed.', 'sobol-safe-save' );

			default:
				return __( 'Part of it was rewritten.', 'sobol-safe-save' );
		}
	}

	/**
	 * Every change in a finding, as sentences.
	 *
	 * @param Finding $finding Finding to describe.
	 *
	 * @return string[]
	 */
	public function finding( Finding $finding ): array {
		return array_map( array( $this, 'change' ), $finding->changes() );
	}

	/**
	 * The name of a post field, as a person would say it.
	 *
	 * @param string $field Field name.
	 */
	public function field_label( string $field ): string {
		switch ( $field ) {
			case 'post_title':
				return __( 'Title', 'sobol-safe-save' );
			case 'post_excerpt':
				return __( 'Excerpt', 'sobol-safe-save' );
			case 'post_content':
				return __( 'Content', 'sobol-safe-save' );
			default:
				return $field;
		}
	}

	/**
	 * The name of a block, as a person would say it.
	 *
	 * @param string $name Registered block name, such as `core/html`.
	 */
	public function block_label( string $name ): string {
		if ( '' === $name ) {
			return __( 'Classic content', 'sobol-safe-save' );
		}

		$type = \WP_Block_Type_Registry::get_instance()->get_registered( $name );

		return $type && $type->title ? (string) $type->title : $name;
	}
}
