<?php
/**
 * Pointing at the block that will lose something.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Analyzer;
use Sobolewski\SobolSafeSave\Core\Report;
use WP_UnitTestCase;

/**
 * Attribution is a weaker claim than the verdict, and the plugin is built so the two can never be
 * confused. The verdict comes from filtering the whole document, exactly as `wp_insert_post()`
 * does. Attribution comes from filtering each block's own markup separately, which is an
 * approximation for reasons these tests pin down.
 *
 * `confidence()` is how the interface knows which sentence it is allowed to say: "4 blocks will
 * lose content" or "something will be lost, but not which block".
 */
final class AnalyzerAttributionTest extends WP_UnitTestCase {

	/**
	 * A document whose damage sits in the second of three blocks.
	 */
	private const NESTED = '<!-- wp:paragraph --><p>fine</p><!-- /wp:paragraph -->' .
		'<!-- wp:group --><div class="wp-block-group">' .
		'<!-- wp:html --><iframe src="https://x.test"></iframe><!-- /wp:html -->' .
		'</div><!-- /wp:group -->';

	/**
	 * Becomes a filtered user.
	 */
	public function set_up(): void {
		parent::set_up();

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
	}

	/**
	 * Only the block that actually loses something is named.
	 *
	 * The trap this guards against: `serialize_block()` inlines a block's children, so filtering
	 * a Group's full markup also filters the broken block inside it. A naive implementation
	 * reports the Group *and* the block within it, turning one mistake into a list of three.
	 */
	public function test_only_the_responsible_block_is_named(): void {
		$analyzer = new Analyzer();

		$report = $analyzer->analyze(
			array( 'post_content' => self::NESTED ),
			$analyzer->fragments_from_content( self::NESTED )
		);

		$this->assertTrue( $report->changed() );
		$this->assertSame( Report::CONFIDENCE_FULL, $report->confidence() );

		$named = array();

		foreach ( $report->blocks() as $finding ) {
			$named[] = $finding->label();
		}

		$this->assertSame( array( 'core/html' ), $named );
	}

	/**
	 * Content nothing touches produces no findings at all.
	 */
	public function test_clean_content_is_not_attributed(): void {
		$clean    = '<!-- wp:paragraph --><p>perfectly ordinary</p><!-- /wp:paragraph -->';
		$analyzer = new Analyzer();

		$report = $analyzer->analyze(
			array( 'post_content' => $clean ),
			$analyzer->fragments_from_content( $clean )
		);

		$this->assertFalse( $report->changed() );
		$this->assertSame( array(), $report->blocks() );
	}

	/**
	 * With no fragments supplied, the verdict still stands and attribution is declared absent.
	 *
	 * This is the first phase of the editor's two-phase check: it sends the document alone, and
	 * only sends the per-block markup once the answer comes back dirty.
	 */
	public function test_without_fragments_there_is_a_verdict_but_no_attribution(): void {
		$report = ( new Analyzer() )->analyze( array( 'post_content' => self::NESTED ) );

		$this->assertTrue( $report->changed() );
		$this->assertSame( array(), $report->blocks() );
		$this->assertSame( Report::CONFIDENCE_NONE, $report->confidence() );
	}

	/**
	 * When the content changes but no block accounts for it, the report says so.
	 *
	 * A token can straddle a block boundary: filtering the document as a whole consumes from a
	 * stray `<` to the next `>`, which may sit inside the next block's opening delimiter - damage
	 * that block's own markup cannot show. Rather than claim the document is fine or invent a
	 * culprit, the report drops to "partial" and the interface says it cannot point at a block.
	 */
	public function test_unattributable_damage_is_reported_as_partial(): void {
		$analyzer = new Analyzer();

		// Fragments that are deliberately not the ones the content is made of: the document is
		// damaged, none of the supplied blocks is. That is the shape of the straddling case,
		// produced here directly so the test does not depend on a parser quirk staying put.
		$report = $analyzer->analyze(
			array( 'post_content' => '<p>text</p><iframe src="https://x.test"></iframe>' ),
			array(
				array(
					'clientId' => 'abc',
					'name'     => 'core/paragraph',
					'html'     => '<!-- wp:paragraph --><p>text</p><!-- /wp:paragraph -->',
				),
			)
		);

		$this->assertTrue( $report->changed() );
		$this->assertSame( array(), $report->blocks() );
		$this->assertSame( Report::CONFIDENCE_PARTIAL, $report->confidence() );
	}

	/**
	 * The balanceTags option makes attribution meaningless, and the report admits it.
	 *
	 * It closes unbalanced tags across the whole document at priority 50, so no individual block
	 * owns the result. Claiming otherwise would point the user at an innocent block.
	 */
	public function test_balance_tags_disables_attribution(): void {
		update_option( 'use_balanceTags', 1 );

		$analyzer = new Analyzer();

		$report = $analyzer->analyze(
			array( 'post_content' => self::NESTED ),
			$analyzer->fragments_from_content( self::NESTED )
		);

		update_option( 'use_balanceTags', 0 );

		$this->assertTrue( $report->changed() );
		$this->assertSame( array(), $report->blocks() );
		$this->assertSame( Report::CONFIDENCE_NONE, $report->confidence() );
	}

	/**
	 * A title or excerpt change is full confidence with no blocks, because neither has any.
	 */
	public function test_a_title_change_needs_no_block(): void {
		$analyzer = new Analyzer();

		$report = $analyzer->analyze(
			array(
				'post_title'   => 'A <span>title</span>',
				'post_content' => '<p>clean</p>',
			),
			$analyzer->fragments_from_content( '<p>clean</p>' )
		);

		$this->assertTrue( $report->changed() );
		$this->assertArrayHasKey( 'post_title', $report->fields() );
		$this->assertArrayNotHasKey( 'post_content', $report->fields() );
		$this->assertSame( Report::CONFIDENCE_FULL, $report->confidence() );
	}

	/**
	 * Fragments keep their block delimiters, and skip the whitespace between blocks.
	 *
	 * Both matter. The delimiter is where the most damaging failure shows up, and the parser emits
	 * the whitespace between two blocks as a nameless block that the editor does not keep - count
	 * it and every position disagrees with what is on screen.
	 */
	public function test_fragments_carry_delimiters_and_skip_whitespace(): void {
		$content = '<!-- wp:paragraph --><p>one</p><!-- /wp:paragraph -->' . "\n\n" .
			'<!-- wp:paragraph --><p>two</p><!-- /wp:paragraph -->';

		$fragments = ( new Analyzer() )->fragments_from_content( $content );

		$this->assertCount( 2, $fragments );
		$this->assertStringContainsString( '<!-- wp:paragraph -->', $fragments[0]['html'] );
		$this->assertStringContainsString( '<!-- /wp:paragraph -->', $fragments[0]['html'] );
		$this->assertSame( array( '0', '1' ), wp_list_pluck( $fragments, 'clientId' ) );
	}

	/**
	 * A parent's fragment excludes its children's markup.
	 */
	public function test_a_parent_fragment_excludes_its_children(): void {
		$fragments = ( new Analyzer() )->fragments_from_content( self::NESTED );

		$group = null;

		foreach ( $fragments as $fragment ) {
			if ( 'core/group' === $fragment['name'] ) {
				$group = $fragment;
			}
		}

		$this->assertNotNull( $group, 'The group should be among the fragments.' );
		$this->assertStringNotContainsString( 'iframe', $group['html'] );
		$this->assertStringContainsString( 'wp-block-group', $group['html'] );
	}
}
