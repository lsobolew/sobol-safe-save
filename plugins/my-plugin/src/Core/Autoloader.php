<?php
/**
 * Minimal PSR-4 autoloader for the plugin classes.
 *
 * It lets the plugin run without `composer install` (for example when installed from a zip),
 * so vendor/ is only ever needed for third-party libraries.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Maps a namespace prefix onto a directory.
 */
final class Autoloader {

	/**
	 * Registers the autoloader for a namespace prefix.
	 *
	 * @param string $prefix   Namespace prefix, for example MyVendor\MyPlugin.
	 * @param string $base_dir Directory holding the classes.
	 */
	public static function register( string $prefix, string $base_dir ): void {
		$prefix   = rtrim( $prefix, '\\' ) . '\\';
		$base_dir = rtrim( $base_dir, '/\\' ) . '/';
		$length   = strlen( $prefix );

		spl_autoload_register(
			static function ( $class_name ) use ( $prefix, $base_dir, $length ) {
				if ( 0 !== strncmp( $prefix, $class_name, $length ) ) {
					return;
				}

				$relative = substr( $class_name, $length );
				$file     = $base_dir . str_replace( '\\', '/', $relative ) . '.php';

				if ( is_readable( $file ) ) {
					require_once $file;
				}
			}
		);
	}
}
