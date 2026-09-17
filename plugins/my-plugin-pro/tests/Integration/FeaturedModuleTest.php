<?php
/**
 * Integration tests for the Pro module.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\Tests\Integration;

use MyVendor\MyPlugin\Core\Plugin as CorePlugin;
use MyVendor\MyPlugin\Core\Settings;
use MyVendor\MyPlugin\Modules\ContentType\Module as ContentType;
use MyVendor\MyPluginPro\Modules\Featured\Module as Featured;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

/**
 * Verifies that the add-on really plugs into the core through its public extension points.
 */
final class FeaturedModuleTest extends WP_UnitTestCase {

	/**
	 * REST server.
	 *
	 * @var WP_REST_Server
	 */
	private $server;

	/**
	 * Sets up a fresh REST server and re-registers the meta fields.
	 */
	public function set_up(): void {
		parent::set_up();

		$core = CorePlugin::instance()->module( 'content-type' );
		if ( $core instanceof ContentType ) {
			$core->register_meta();
		}

		$pro = CorePlugin::instance()->module( 'pro-featured' );
		if ( $pro instanceof Featured ) {
			$pro->register_meta();
		}

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		$this->server   = $wp_rest_server;
		do_action( 'rest_api_init' );
	}

	/**
	 * Tears the test down.
	 */
	public function tear_down(): void {
		global $wp_rest_server;
		$wp_rest_server = null;

		parent::tear_down();
	}

	/**
	 * The Pro module lands in the free plugin registry.
	 */
	public function test_pro_module_is_registered_in_core_registry(): void {
		$this->assertNotNull( CorePlugin::instance()->module( 'pro-featured' ) );
	}

	/**
	 * The add-on extends the core default settings.
	 */
	public function test_pro_adds_settings_default(): void {
		$this->assertArrayHasKey( 'featured_label', Settings::defaults() );
	}

	/**
	 * The add-on meta field is registered on the core post type.
	 */
	public function test_featured_meta_is_registered(): void {
		$registered = get_registered_meta_keys( 'post', ContentType::POST_TYPE );

		$this->assertArrayHasKey( Featured::META_FEATURED, $registered );
	}

	/**
	 * The core REST response carries the fields added by the add-on.
	 */
	public function test_rest_item_is_extended_with_pro_fields(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );

		$post_id = self::factory()->post->create(
			array(
				'post_type'   => ContentType::POST_TYPE,
				'post_status' => 'publish',
			)
		);
		update_post_meta( $post_id, Featured::META_FEATURED, true );

		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/my-plugin/v1/items' ) );
		$data     = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertArrayHasKey( 'featured', $data[0] );
		$this->assertTrue( $data[0]['featured'] );
		$this->assertSame( 'pro', $data[0]['edition'] );
	}
}
