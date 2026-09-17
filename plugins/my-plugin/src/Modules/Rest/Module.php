<?php
/**
 * Module: REST API.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Modules\Rest;

use MyVendor\MyPlugin\Core\Module as ModuleContract;
use MyVendor\MyPlugin\Core\Plugin;

defined( 'ABSPATH' ) || exit;

/**
 * Wires up the plugin REST controllers.
 */
final class Module implements ModuleContract {

	/**
	 * REST namespace.
	 */
	const NAMESPACE_V1 = 'my-plugin/v1';

	/**
	 * Plugin instance.
	 *
	 * @var Plugin
	 */
	private $plugin;

	/**
	 * Constructor.
	 *
	 * @param Plugin $plugin Plugin instance.
	 */
	public function __construct( Plugin $plugin ) {
		$this->plugin = $plugin;
	}

	/**
	 * Module identifier.
	 */
	public function id(): string {
		return 'rest';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		add_action(
			'rest_api_init',
			static function () {
				( new ItemsController() )->register_routes();
			}
		);
	}
}
