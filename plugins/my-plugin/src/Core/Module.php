<?php
/**
 * Contract for a feature module.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Core;

defined( 'ABSPATH' ) || exit;

/**
 * A module is a self-contained slice of functionality: its own directory, its own tests and a
 * single entry in config/modules.php. Removing a module must never break the rest of the plugin.
 */
interface Module {

	/**
	 * Stable module identifier, used in filters and by `wpx feature`.
	 */
	public function id(): string;

	/**
	 * Registers the module hooks. Called once while the plugin boots.
	 */
	public function register(): void;
}
