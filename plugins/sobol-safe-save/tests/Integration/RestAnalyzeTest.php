<?php
/**
 * The route both editors ask before saving.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Report;
use WP_REST_Request;
use WP_UnitTestCase;

/**
 * The analysis route is the only thing the editors talk to, and it is called constantly while
 * somebody types. Two things therefore matter more than usual: that it never answers a question
 * the caller has no business asking, and that its payload keeps the shape the editor and any
 * add-on were written against.
 */
final class RestAnalyzeTest extends WP_UnitTestCase {

	/**
	 * The route under test.
	 */
	private const ROUTE = '/sobol-safe-save/v1/analyze';

	/**
	 * Content an author cannot keep.
	 */
	private const RISKY = '<p>keep</p><iframe src="https://x.test"></iframe>';

	/**
	 * Registers the routes for each test.
	 */
	public function set_up(): void {
		parent::set_up();

		// The REST server is rebuilt per test, so the plugin's routes have to be re-registered.
		global $wp_rest_server;

		$wp_rest_server = new \WP_REST_Server();

		do_action( 'rest_api_init', $wp_rest_server );
	}

	/**
	 * The route exists.
	 */
	public function test_the_route_is_registered(): void {
		$this->assertArrayHasKey( self::ROUTE, rest_get_server()->get_routes() );
	}

	/**
	 * A logged-out visitor is refused.
	 */
	public function test_a_logged_out_visitor_is_refused(): void {
		wp_set_current_user( 0 );

		$response = $this->analyze( array( 'content' => self::RISKY ) );

		$this->assertSame( 401, $response->get_status() );
	}

	/**
	 * A subscriber, who cannot edit anything, is refused.
	 */
	public function test_a_subscriber_is_refused(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$response = $this->analyze( array( 'content' => self::RISKY ) );

		$this->assertSame( 403, $response->get_status() );
	}

	/**
	 * An author may not ask about somebody else's post.
	 *
	 * The analysis says what *this* user would lose, so answering for a post they cannot edit
	 * would both be meaningless and hand back its content.
	 */
	public function test_an_author_cannot_ask_about_another_users_post(): void {
		$other = self::factory()->post->create(
			array(
				'post_author'  => self::factory()->user->create( array( 'role' => 'author' ) ),
				'post_content' => 'private',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$response = $this->analyze(
			array(
				'post_id' => $other,
				'content' => self::RISKY,
			)
		);

		$this->assertSame( 403, $response->get_status() );
	}

	/**
	 * An author gets an answer about their own draft.
	 */
	public function test_an_author_is_answered(): void {
		$author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $author );

		$post_id = self::factory()->post->create( array( 'post_author' => $author ) );

		$response = $this->analyze(
			array(
				'post_id' => $post_id,
				'content' => self::RISKY,
			)
		);

		$this->assertSame( 200, $response->get_status() );

		$body = $response->get_data();

		$this->assertTrue( $body['applies'] );
		$this->assertTrue( $body['changed'] );
		$this->assertArrayHasKey( 'post_content', (array) $body['fields'] );
	}

	/**
	 * An unknown post type is a bad request, not a server error.
	 */
	public function test_an_unknown_post_type_is_rejected(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$response = $this->analyze(
			array(
				'post_type' => 'not_a_type',
				'content'   => self::RISKY,
			)
		);

		$this->assertSame( 400, $response->get_status() );
	}

	/**
	 * The payload carries every key the editor and an add-on were written against.
	 */
	public function test_the_payload_shape_is_stable(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$body = $this->analyze( array( 'content' => self::RISKY ) )->get_data();

		foreach ( array( 'schemaVersion', 'applies', 'changed', 'confidence', 'fields', 'blocks' ) as $key ) {
			$this->assertArrayHasKey( $key, $body );
		}

		$this->assertSame( Report::SCHEMA_VERSION, $body['schemaVersion'] );
	}

	/**
	 * Per-block markup comes back tied to the client id the editor sent.
	 *
	 * This is what lets a finding in the sidebar select the offending block: the editor keeps the
	 * client ids, sends them with each block's markup, and gets them back on the findings.
	 */
	public function test_fragments_come_back_keyed_by_client_id(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$body = $this->analyze(
			array(
				'content'   => self::RISKY,
				'fragments' => array(
					array(
						'clientId' => 'client-abc',
						'name'     => 'core/html',
						'html'     => '<!-- wp:html --><iframe src="https://x.test"></iframe><!-- /wp:html -->',
					),
				),
			)
		)->get_data();

		$this->assertSame( Report::CONFIDENCE_FULL, $body['confidence'] );
		$this->assertCount( 1, $body['blocks'] );
		$this->assertSame( 'client-abc', $body['blocks'][0]['key'] );
		$this->assertSame( 'core/html', $body['blocks'][0]['label'] );
	}

	/**
	 * Content is analysed exactly as submitted, not as the REST API would sanitise it.
	 *
	 * If the route sanitised its own input, it would analyse something the user never wrote and
	 * the answer would always be "nothing will change" - the plugin would be silently useless.
	 */
	public function test_the_content_is_not_sanitised_on_the_way_in(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$body = $this->analyze( array( 'content' => '<script>alert(1)</script>' ) )->get_data();

		$this->assertTrue( $body['changed'], 'A script tag has to survive long enough to be analysed.' );
		$this->assertStringContainsString( '<script>', ( (array) $body['fields'] )['post_content']['before'] );
	}

	/**
	 * Content beyond the limit is refused rather than analysed on every keystroke.
	 */
	public function test_oversized_content_is_refused(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$cap = static function (): int {
			return 100;
		};

		add_filter( 'sobol_safe_save_max_content_length', $cap );

		$response = $this->analyze( array( 'content' => str_repeat( 'x', 200 ) ) );

		remove_filter( 'sobol_safe_save_max_content_length', $cap );

		$this->assertSame( 413, $response->get_status() );
	}

	/**
	 * An add-on can switch the analysis off for content it has a policy about.
	 *
	 * The editor treats this exactly like a user who may post unfiltered HTML: nothing to say,
	 * stop asking. A policy is not an error.
	 */
	public function test_an_add_on_can_skip_the_analysis(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		add_filter( 'sobol_safe_save_should_check', '__return_false' );

		$body = $this->analyze( array( 'content' => self::RISKY ) )->get_data();

		remove_filter( 'sobol_safe_save_should_check', '__return_false' );

		$this->assertFalse( $body['applies'] );
		$this->assertFalse( $body['changed'] );
	}

	/**
	 * An add-on can add its own fields to the payload.
	 */
	public function test_an_add_on_can_extend_the_payload(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$extend = static function ( array $payload ): array {
			$payload['proField'] = 'from an add-on';

			return $payload;
		};

		add_filter( 'sobol_safe_save_report', $extend );

		$body = $this->analyze( array( 'content' => self::RISKY ) )->get_data();

		remove_filter( 'sobol_safe_save_report', $extend );

		$this->assertSame( 'from an add-on', $body['proField'] );
	}

	/**
	 * Every analysis is announced, with the context an audit log would need.
	 */
	public function test_every_analysis_is_announced(): void {
		$author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $author );

		$post_id = self::factory()->post->create( array( 'post_author' => $author ) );
		$seen    = array();

		$listen = static function ( $report, $context ) use ( &$seen ): void {
			$seen[] = array( $report, $context );
		};

		add_action( 'sobol_safe_save_analysis_complete', $listen, 10, 2 );

		$this->analyze(
			array(
				'post_id'   => $post_id,
				'post_type' => 'post',
				'content'   => self::RISKY,
			)
		);

		remove_action( 'sobol_safe_save_analysis_complete', $listen, 10 );

		$this->assertCount( 1, $seen );
		$this->assertInstanceOf( Report::class, $seen[0][0] );
		$this->assertSame( 'rest', $seen[0][1]['surface'] );
		$this->assertSame( $post_id, $seen[0][1]['post_id'] );
		$this->assertSame( 'post', $seen[0][1]['post_type'] );
	}

	/**
	 * Sends a request to the route.
	 *
	 * @param array<string, mixed> $params Request parameters.
	 */
	private function analyze( array $params ): \WP_REST_Response {
		$request = new WP_REST_Request( 'POST', self::ROUTE );

		foreach ( $params as $name => $value ) {
			$request->set_param( $name, $value );
		}

		return rest_get_server()->dispatch( $request );
	}
}
