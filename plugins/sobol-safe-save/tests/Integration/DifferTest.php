<?php
/**
 * Turning a before/after pair into something a person can act on.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Analyzer;
use Sobolewski\SobolSafeSave\Core\Differ;
use WP_UnitTestCase;

/**
 * "Your content will change" is not useful on its own; "the iframe will be removed" is.
 *
 * An integration test rather than a unit test because {@see Differ} reads markup with
 * `WP_HTML_Tag_Processor`, and mocking the HTML parser to test a description of HTML would only
 * be testing the mock. The before/after pairs are produced by the real filters, so these cases
 * stay honest if WordPress changes what it strips.
 */
final class DifferTest extends WP_UnitTestCase {

	/**
	 * Becomes a filtered user, so the analyzer produces a real "after".
	 */
	public function set_up(): void {
		parent::set_up();

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
	}

	/**
	 * Identical input and output produce no changes at all.
	 */
	public function test_unchanged_markup_reports_nothing(): void {
		$this->assertSame( array(), ( new Differ() )->describe( '<p>hi</p>', '<p>hi</p>' ) );
	}

	/**
	 * Each kind of loss is named, using what the real filters actually do.
	 *
	 * @dataProvider losses
	 *
	 * @param string $field   Post field the markup belongs to.
	 * @param string $markup  Content as written.
	 * @param string $kind    Expected Differ::KIND_* constant.
	 * @param string $subject Expected tag or property, or an empty string.
	 */
	public function test_losses_are_named( string $field, string $markup, string $kind, string $subject ): void {
		$analyzer  = new Analyzer();
		$predicted = $analyzer->predict( array( $field => $markup ) );

		$this->assertNotSame( $markup, $predicted[ $field ], 'This case is supposed to lose something.' );

		$changes = ( new Differ() )->describe( $markup, $predicted[ $field ] );
		$kinds   = wp_list_pluck( $changes, 'kind' );

		$this->assertContains( $kind, $kinds, 'Expected a ' . $kind . ' change, got: ' . implode( ', ', $kinds ) );

		if ( '' === $subject ) {
			return;
		}

		$subjects = array();

		foreach ( $changes as $change ) {
			if ( $kind === $change['kind'] ) {
				$subjects[] = '' !== $change['name'] ? $change['name'] : $change['tag'];
			}
		}

		$this->assertContains( $subject, $subjects );
	}

	/**
	 * One case per kind of change Differ can describe.
	 *
	 * @return array<string, array{0: string, 1: string, 2: string, 3: string}>
	 */
	public static function losses(): array {
		return array(
			'a removed element'     => array( 'post_content', '<p>x</p><iframe src="https://x.test"></iframe>', Differ::KIND_TAG, 'iframe' ),
			'a removed attribute'   => array( 'post_content', '<a href="https://x.test" onclick="x()">go</a>', Differ::KIND_ATTRIBUTE, 'onclick' ),
			'a removed declaration' => array( 'post_content', '<span style="color:red;mask-image:url(a.png)">x</span>', Differ::KIND_STYLE, 'mask-image' ),
			'a rewritten entity'    => array( 'post_content', '<p>&#147;quoted&#148;</p>', Differ::KIND_ENTITY, '' ),
			'a trimmed title'       => array( 'post_title', '  Hello  ', Differ::KIND_TRIMMED, '' ),
		);
	}

	/**
	 * An attribute lost with its element is not reported twice.
	 *
	 * An author who pasted an iframe made one mistake. Reporting "the iframe was removed" and
	 * "the src attribute was removed" makes it read like two, and the second is noise.
	 */
	public function test_an_attribute_on_a_removed_element_is_not_reported_separately(): void {
		$markup    = '<p>x</p><iframe src="https://x.test" width="500"></iframe>';
		$predicted = ( new Analyzer() )->predict( array( 'post_content' => $markup ) );

		$changes = ( new Differ() )->describe( $markup, $predicted['post_content'] );

		foreach ( $changes as $change ) {
			$this->assertNotSame(
				Differ::KIND_ATTRIBUTE,
				$change['kind'],
				'Attributes of a removed element should be covered by the element itself.'
			);
		}
	}

	/**
	 * A mangled block delimiter is called out as such.
	 *
	 * This is the failure that costs the most and explains itself the least: KSES filters the
	 * inside of every HTML comment, a block's opening delimiter is a comment, and a rewritten one
	 * means the post reopens with "this block contains unexpected or invalid content".
	 */
	public function test_a_rewritten_block_delimiter_is_called_out(): void {
		$markup    = '<!-- wp:paragraph {"x":"a--b"} --><p>x</p><!-- /wp:paragraph -->';
		$predicted = ( new Analyzer() )->predict( array( 'post_content' => $markup ) );

		if ( $markup === $predicted['post_content'] ) {
			$this->markTestSkipped( 'This WordPress leaves the delimiter alone.' );
		}

		$kinds = wp_list_pluck( ( new Differ() )->describe( $markup, $predicted['post_content'] ), 'kind' );

		$this->assertContains( Differ::KIND_DELIMITER, $kinds );
	}

	/**
	 * A difference no rule recognises is still reported.
	 *
	 * Silence would be the worst outcome: the verdict says content will be lost while the detail
	 * pane shows nothing, so the warning reads as a bug in the plugin rather than a problem with
	 * the content.
	 */
	public function test_an_unrecognised_difference_still_reports_something(): void {
		$changes = ( new Differ() )->describe( 'one', 'two' );

		$this->assertCount( 1, $changes );
		$this->assertSame( Differ::KIND_OTHER, $changes[0]['kind'] );
	}

	/**
	 * Repeated losses are counted rather than listed one by one.
	 */
	public function test_repeated_losses_are_counted(): void {
		$markup    = str_repeat( '<iframe src="https://x.test"></iframe>', 3 ) . '<p>x</p>';
		$predicted = ( new Analyzer() )->predict( array( 'post_content' => $markup ) );

		$changes = ( new Differ() )->describe( $markup, $predicted['post_content'] );

		foreach ( $changes as $change ) {
			if ( Differ::KIND_TAG === $change['kind'] && 'iframe' === $change['tag'] ) {
				$this->assertSame( 3, $change['count'] );

				return;
			}
		}

		$this->fail( 'The removed iframes were not reported.' );
	}
}
