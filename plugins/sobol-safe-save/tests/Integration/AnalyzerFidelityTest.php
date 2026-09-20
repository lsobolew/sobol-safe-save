<?php
/**
 * The plugin's central guarantee: the prediction is what actually gets stored.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Analyzer;
use WP_REST_Request;
use WP_UnitTestCase;

/**
 * Sobol Safe Save tells people what a save will do to their content before they do it. If the prediction
 * and the save ever disagree, the plugin is worse than useless: it either cries wolf over content
 * that is fine, or stays quiet while something is destroyed.
 *
 * These tests are the guarantee. Each case is written by an author - a user without
 * `unfiltered_html`, which is who this plugin exists for - and the prediction is compared against
 * the row WordPress actually wrote.
 *
 * The corpus is chosen to cover the filters a hand-written KSES replica would miss. Several of
 * these cases fail against "just call wp_kses()", which is exactly why {@see Analyzer} replicates
 * `sanitize_post( $postarr, 'db' )` instead:
 *
 * - `cp1252 entities`  - `convert_invalid_entities`, not KSES.
 * - `title whitespace` - `trim()` on `title_save_pre`, not KSES.
 * - `title markup`     - the title uses the restrictive comment allow-list, not the post one.
 * - `backslashes`      - proves the slashing round trip does not eat them.
 */
final class AnalyzerFidelityTest extends WP_UnitTestCase {

	/**
	 * Post fields WordPress filters, paired with the REST field that carries each one.
	 */
	private const REST_FIELDS = array(
		'post_title'   => 'title',
		'post_content' => 'content',
		'post_excerpt' => 'excerpt',
	);

	/**
	 * Content samples that exercise every filter on the save path.
	 *
	 * Every case carries a title, because `wp_insert_post()` refuses a post whose content, title
	 * and excerpt are all empty - and some of these are emptied entirely by filtering.
	 *
	 * @return array<string, array{0: array<string, string>}>
	 */
	public static function corpus(): array {
		return array(
			'plain content'     => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<p>Nothing to see</p>',
				),
			),
			'backslash path'    => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<p>C:\\Users\\new</p>',
				),
			),
			'escaped quote'     => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<p>a \\" b \\\\ c</p>',
				),
			),
			'nul byte'          => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => "<p>a\0b</p>",
				),
			),
			'cp1252 entities'   => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<p>&#147;hi&#148;</p>',
				),
			),
			'title whitespace'  => array(
				array(
					'post_title'   => '  Hello  ',
					'post_content' => '<p>x</p>',
				),
			),
			'title markup'      => array(
				array(
					'post_title'   => 'A <strong>b</strong> <span>c</span>',
					'post_content' => '<p>x</p>',
				),
			),
			'script'            => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<script>alert(1)</script>',
				),
			),
			'iframe'            => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<iframe src="https://x.test"></iframe>',
				),
			),
			'event handler'     => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<a href="https://x.test" onclick="x()">go</a>',
				),
			),
			'mask-image style'  => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<span style="mask-image:url(a.png);color:red"></span>',
				),
			),
			'form'              => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<form action="/x"><input name="a"></form>',
				),
			),
			'svg'               => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>',
				),
			),
			'data attributes'   => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<div data-x="1" data-y="2">k</div>',
				),
			),
			'orphan lt'         => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => "raw <\n\n<!-- wp:paragraph --><p>b</p><!-- /wp:paragraph -->",
				),
			),
			'unclosed comment'  => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<!-- wp:paragraph --><p>a <!-- b</p><!-- /wp:paragraph -->',
				),
			),
			'delimiter dashes'  => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<!-- wp:paragraph {"x":"a--b"} --><p>x</p><!-- /wp:paragraph -->',
				),
			),
			'delimiter lt'      => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<!-- wp:paragraph {"x":"a<b"} --><p>x</p><!-- /wp:paragraph -->',
				),
			),
			'nested blocks'     => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<!-- wp:group --><div class="wp-block-group">' .
						'<!-- wp:paragraph --><p>safe</p><!-- /wp:paragraph -->' .
						'<!-- wp:html --><iframe src="https://x.test"></iframe><!-- /wp:html -->' .
						'</div><!-- /wp:group -->',
				),
			),
			'excerpt with link' => array(
				array(
					'post_title'   => 'Ok',
					'post_content' => '<p>x</p>',
					'post_excerpt' => 'see <a href="https://x.test" onclick="x()">this</a>',
				),
			),
			'all three fields'  => array(
				array(
					'post_title'   => '  <em>Title</em> <iframe></iframe>  ',
					'post_content' => '<p>body</p><script>bad()</script>',
					'post_excerpt' => '<p>lead</p><object data="x"></object>',
				),
			),
		);
	}

	/**
	 * The prediction matches the row WordPress writes, field for field.
	 *
	 * @dataProvider corpus
	 *
	 * @param array<string, string> $fields Post fields as the editor holds them, unslashed.
	 */
	public function test_prediction_matches_what_wp_insert_post_stores( array $fields ): void {
		global $wpdb;

		$author = $this->become_an_author();

		$predicted = ( new Analyzer() )->predict( $fields );

		// Mirrors WP_REST_Posts_Controller::create_item(), which calls
		// wp_insert_post( wp_slash( (array) $prepared_post ) ). Without the wp_slash() this test
		// would pass for the wrong reason: it would be exercising a path nothing in WordPress uses.
		$post_id = wp_insert_post(
			wp_slash(
				$fields + array(
					'post_status' => 'draft',
					'post_author' => $author,
				)
			),
			true
		);

		$this->assertNotWPError( $post_id );

		// Read the raw row. get_post() applies its own context filters, so asserting against it
		// would compare the prediction with something neither the editor nor the database holds.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- going straight to the row is the point: any caching layer would hand back something other than what was written.
		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT post_title, post_content, post_excerpt FROM {$wpdb->posts} WHERE ID = %d", $post_id ),
			ARRAY_A
		);

		foreach ( array_keys( $fields ) as $field ) {
			$this->assertSame(
				$row[ $field ],
				$predicted[ $field ],
				"Prediction for {$field} does not match what was stored."
			);
		}
	}

	/**
	 * The same, through the REST route the block editor actually saves with.
	 *
	 * `wp_insert_post()` is the shared destination, but the block editor gets there through the
	 * REST controller, which slashes the payload itself and gives `rest_pre_insert_post` a chance
	 * to change the content first. If a site has something on that hook, this is where it shows.
	 *
	 * @dataProvider corpus
	 *
	 * @param array<string, string> $fields Post fields as the editor holds them, unslashed.
	 */
	public function test_prediction_matches_what_the_rest_route_stores( array $fields ): void {
		global $wpdb;

		$this->become_an_author();

		$predicted = ( new Analyzer() )->predict( $fields );

		$request = new WP_REST_Request( 'POST', '/wp/v2/posts' );
		$request->set_param( 'status', 'draft' );

		foreach ( self::REST_FIELDS as $post_field => $rest_field ) {
			if ( isset( $fields[ $post_field ] ) ) {
				$request->set_param( $rest_field, $fields[ $post_field ] );
			}
		}

		$response = rest_do_request( $request );

		$this->assertFalse( $response->is_error(), 'The REST request failed: ' . wp_json_encode( $response->get_data() ) );

		$post_id = (int) $response->get_data()['id'];

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- going straight to the row is the point: any caching layer would hand back something other than what was written.
		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT post_title, post_content, post_excerpt FROM {$wpdb->posts} WHERE ID = %d", $post_id ),
			ARRAY_A
		);

		foreach ( array_keys( $fields ) as $field ) {
			$this->assertSame(
				$row[ $field ],
				$predicted[ $field ],
				"Prediction for {$field} does not match what the REST route stored."
			);
		}
	}

	/**
	 * A user who may post unfiltered HTML loses nothing, and is told so.
	 *
	 * The counter-proof. Without it every assertion above would still pass if the analyzer simply
	 * reported "no change" for everything.
	 *
	 * @dataProvider corpus
	 *
	 * @param array<string, string> $fields Post fields as the editor holds them, unslashed.
	 */
	public function test_an_administrator_is_told_nothing_will_change( array $fields ): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		if ( ! current_user_can( 'unfiltered_html' ) ) {
			// Multisite: only the super admin may post unfiltered HTML, so there is nothing to
			// prove here and the rest of the suite covers the filtered case.
			$this->markTestSkipped( 'Administrators are filtered on multisite.' );
		}

		$report = ( new Analyzer() )->analyze( $fields );

		$this->assertFalse( $report->applies(), 'KSES should not apply to a user with unfiltered_html.' );
		$this->assertFalse( $report->changed() );
	}

	/**
	 * At least one case in the corpus really does lose something.
	 *
	 * Guards against the corpus quietly becoming harmless - every assertion above is satisfied by
	 * content that nothing touches.
	 */
	public function test_the_corpus_actually_exercises_filtering(): void {
		$this->become_an_author();

		$analyzer = new Analyzer();
		$changed  = 0;

		foreach ( self::corpus() as $case ) {
			if ( $analyzer->analyze( $case[0] )->changed() ) {
				++$changed;
			}
		}

		$this->assertGreaterThanOrEqual(
			10,
			$changed,
			'The corpus is supposed to be mostly content that WordPress rewrites.'
		);
	}

	/**
	 * Becomes a user whose content WordPress filters, and proves it.
	 *
	 * @return int The user id.
	 */
	private function become_an_author(): int {
		$author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $author );

		$this->assertFalse(
			current_user_can( 'unfiltered_html' ),
			'These tests prove nothing if the user may post unfiltered HTML.'
		);

		return $author;
	}
}
