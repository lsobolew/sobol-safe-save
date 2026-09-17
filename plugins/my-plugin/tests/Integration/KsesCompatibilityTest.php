<?php
/**
 * Integration tests for how block markup survives KSES.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Tests\Integration;

use WP_UnitTestCase;

/**
 * Block markup has to survive being saved by a user without `unfiltered_html`.
 *
 * WordPress runs post content through wp_kses_post() for anyone lacking that capability. On a
 * single site that means authors and contributors; **on multisite it means everybody except the
 * super admin**, a regular site administrator included. So the author of a plugin, testing as an
 * administrator on their own machine, never sees what their users get.
 *
 * For a static block this is not merely cosmetic. KSES rewrites the stored markup, the markup then
 * no longer matches what save() produces, and the editor reports the block as invalid the next
 * time somebody opens the post.
 *
 * Measured behaviour (WordPress 7.x), worth knowing before designing block output:
 *
 *   survives    class, data-* attributes, CSS custom properties (`--x: url(…)` included),
 *               background-color, width/height, display
 *   stripped    <script>, mask-image, -webkit-mask-image, behavior:
 *
 * That last row is why an icon built on `mask-image` has to put the URL in a custom property and
 * let a stylesheet consume it, rather than writing mask-image into the style attribute.
 */
final class KsesCompatibilityTest extends WP_UnitTestCase {

	/**
	 * Markup as each block's save() writes it.
	 *
	 * @return array<string, array{0: string}>
	 */
	public static function block_markup_provider(): array {
		return array(
			'callout'   => array(
				'<!-- wp:my-plugin/callout {"tone":"warning"} -->' .
				'<div class="wp-block-my-plugin-callout is-tone-warning"><p>Mind the gap</p></div>' .
				'<!-- /wp:my-plugin/callout -->',
			),
			'section'   => array(
				'<!-- wp:my-plugin/section {"tone":"muted"} -->' .
				'<div class="wp-block-my-plugin-section is-tone-muted">' .
				'<!-- wp:paragraph --><p>Nested</p><!-- /wp:paragraph -->' .
				'</div><!-- /wp:my-plugin/section -->',
			),
			'item-list' => array(
				'<!-- wp:my-plugin/item-list {"limit":3} /-->',
			),
		);
	}

	/**
	 * Saved markup passes through KSES untouched.
	 *
	 * @dataProvider block_markup_provider
	 *
	 * @param string $markup Markup as stored in a post.
	 */
	public function test_block_markup_survives_kses( string $markup ): void {
		$this->assertSame(
			$markup,
			wp_kses_post( $markup ),
			'KSES rewrote this block. Users without unfiltered_html would see it as invalid.'
		);
	}

	/**
	 * A user without the capability saves the same markup an administrator would.
	 *
	 * @dataProvider block_markup_provider
	 *
	 * @param string $markup Markup as stored in a post.
	 */
	public function test_author_saves_the_same_markup_as_an_administrator( string $markup ): void {
		$author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $author );

		$this->assertFalse(
			current_user_can( 'unfiltered_html' ),
			'This test is meaningless if the user can post unfiltered HTML.'
		);

		$post_id = self::factory()->post->create(
			array(
				'post_content' => $markup,
				'post_author'  => $author,
			)
		);

		$this->assertSame( $markup, get_post( $post_id )->post_content );
	}

	/**
	 * Block delimiters themselves are never touched, whoever saves them.
	 */
	public function test_block_delimiters_are_preserved(): void {
		$author = self::factory()->user->create( array( 'role' => 'contributor' ) );

		wp_set_current_user( $author );

		$markup = '<!-- wp:my-plugin/callout {"tone":"info"} -->' .
			'<div class="wp-block-my-plugin-callout is-tone-info"><p>Text</p></div>' .
			'<!-- /wp:my-plugin/callout -->';

		$filtered = wp_kses_post( $markup );

		$this->assertStringContainsString( '<!-- wp:my-plugin/callout {"tone":"info"} -->', $filtered );
		$this->assertStringContainsString( '<!-- /wp:my-plugin/callout -->', $filtered );
	}
}
