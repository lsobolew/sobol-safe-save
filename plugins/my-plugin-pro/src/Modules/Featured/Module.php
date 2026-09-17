<?php
/**
 * Pro module: featured items.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\Modules\Featured;

use MyVendor\MyPlugin\Core\Module as CoreModule;
use MyVendor\MyPlugin\Core\Plugin as CorePlugin;
use MyVendor\MyPlugin\Modules\ContentType\Module as ContentType;
use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Adds a "featured" flag to the items and exposes it through REST.
 *
 * The module only uses the public extension points of the free plugin
 * (`myplugin_settings_defaults`, `myplugin_rest_item`) - it never reaches into its internals.
 */
final class Module implements CoreModule {

	/**
	 * Meta key.
	 */
	const META_FEATURED = '_myplugin_featured';

	/**
	 * Free plugin instance.
	 *
	 * @var CorePlugin
	 */
	private $plugin;

	/**
	 * Constructor.
	 *
	 * @param CorePlugin $plugin Free plugin instance.
	 */
	public function __construct( CorePlugin $plugin ) {
		$this->plugin = $plugin;
	}

	/**
	 * Module identifier.
	 */
	public function id(): string {
		return 'pro-featured';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		add_action( 'init', array( $this, 'register_meta' ) );
		add_filter( 'myplugin_settings_defaults', array( $this, 'add_settings_defaults' ) );
		add_filter( 'myplugin_rest_item', array( $this, 'extend_rest_item' ), 10, 2 );
	}

	/**
	 * Registers the meta field on the free plugin post type.
	 */
	public function register_meta(): void {
		if ( ! class_exists( ContentType::class ) || ! post_type_exists( ContentType::POST_TYPE ) ) {
			return;
		}

		register_post_meta(
			ContentType::POST_TYPE,
			self::META_FEATURED,
			array(
				'type'              => 'boolean',
				'description'       => __( 'Whether the item is featured.', 'my-plugin-pro' ),
				'single'            => true,
				'default'           => false,
				'show_in_rest'      => true,
				'sanitize_callback' => static function ( $value ) {
					return (bool) $value;
				},
				'auth_callback'     => static function ( $allowed, $meta_key, $post_id ) {
					return current_user_can( 'edit_post', (int) $post_id );
				},
			)
		);
	}

	/**
	 * Adds its own setting to the free plugin defaults.
	 *
	 * @param array<string, mixed> $defaults Default settings.
	 *
	 * @return array<string, mixed>
	 */
	public function add_settings_defaults( $defaults ): array {
		$defaults = is_array( $defaults ) ? $defaults : array();

		$defaults['featured_label'] = __( 'Featured', 'my-plugin-pro' );

		return $defaults;
	}

	/**
	 * Adds the "featured" field to the free plugin REST response.
	 *
	 * @param array<string, mixed> $data Item data.
	 * @param WP_Post              $item Source post.
	 *
	 * @return array<string, mixed>
	 */
	public function extend_rest_item( $data, $item ): array {
		$data = is_array( $data ) ? $data : array();

		$data['featured'] = (bool) get_post_meta( (int) $item->ID, self::META_FEATURED, true );
		$data['edition']  = 'pro';

		return $data;
	}
}
