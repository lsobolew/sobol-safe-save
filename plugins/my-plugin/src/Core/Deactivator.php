<?php
/**
 * Plugin deactivation.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Cleans up the temporary state only. User data is left alone - that is what uninstall.php is for.
 */
final class Deactivator {

	/**
	 * Called by register_deactivation_hook.
	 */
	public static function deactivate(): void {
		delete_option( Activator::FLUSH_FLAG );

		foreach ( Activator::activation_aware_modules() as $class_name ) {
			$class_name::on_deactivate();
		}
	}
}
