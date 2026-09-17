<?php
/**
 * Integration tests for the REST endpoints.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Tests\Integration;

use MyVendor\MyPlugin\Core\Settings;
use MyVendor\MyPlugin\Modules\ContentType\Module as ContentType;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

/**
 * The /my-plugin/v1/items routes: availability, permissions and response shape.
 */
final class RestItemsTest extends WP_UnitTestCase {

	/**
	 * REST server used by the test.
	 *
	 * @var WP_REST_Server
	 */
	private $server;

	/**
	 * Spins up a fresh REST server before every test.
	 */
	public function set_up(): void {
		parent::set_up();

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		$this->server   = $wp_rest_server;

		do_action( 'rest_api_init' );
	}

	/**
	 * Clears the global server.
	 */
	public function tear_down(): void {
		global $wp_rest_server;
		$wp_rest_server = null;

		parent::tear_down();
	}

	/**
	 * The routes are registered.
	 */
	public function test_routes_are_registered(): void {
		$routes = $this->server->get_routes();

		$this->assertArrayHasKey( '/my-plugin/v1/items', $routes );
		$this->assertArrayHasKey( '/my-plugin/v1/items/(?P<id>[\d]+)', $routes );
	}

	/**
	 * Anonymous requests get nothing.
	 */
	public function test_anonymous_request_is_rejected(): void {
		wp_set_current_user( 0 );

		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/my-plugin/v1/items' ) );

		$this->assertSame( 401, $response->get_status() );
	}

	/**
	 * A logged-in user receives the item list.
	 */
	public function test_logged_in_user_gets_items(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		self::factory()->post->create_many(
			3,
			array(
				'post_type'   => ContentType::POST_TYPE,
				'post_status' => 'publish',
			)
		);

		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/my-plugin/v1/items' ) );
		$data     = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertCount( 3, $data );
		$this->assertArrayHasKey( 'title', $data[0] );
		$this->assertArrayHasKey( 'priority', $data[0] );
	}

	/**
	 * The per_page parameter limits the result set and the headers carry the pagination info.
	 */
	public function test_per_page_limits_results(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		self::factory()->post->create_many(
			5,
			array(
				'post_type'   => ContentType::POST_TYPE,
				'post_status' => 'publish',
			)
		);

		$request = new WP_REST_Request( 'GET', '/my-plugin/v1/items' );
		$request->set_param( 'per_page', 2 );

		$response = $this->server->dispatch( $request );

		$this->assertCount( 2, $response->get_data() );
		$this->assertSame( '5', $response->get_headers()['X-WP-Total'] );
	}

	/**
	 * The default limit comes from the plugin settings.
	 */
	public function test_default_limit_comes_from_settings(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		Settings::update( array( 'items_per_page' => 2 ) );

		self::factory()->post->create_many(
			4,
			array(
				'post_type'   => ContentType::POST_TYPE,
				'post_status' => 'publish',
			)
		);

		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/my-plugin/v1/items' ) );

		$this->assertCount( 2, $response->get_data() );
	}

	/**
	 * A missing item returns 404.
	 */
	public function test_missing_item_returns_404(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$response = $this->server->dispatch(
			new WP_REST_Request( 'GET', '/my-plugin/v1/items/999999' )
		);

		$this->assertSame( 404, $response->get_status() );
	}
}
