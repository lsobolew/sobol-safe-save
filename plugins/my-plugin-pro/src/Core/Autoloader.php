<?php
/**
 * PSR-4 autoloader for the add-on.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\Core;

defined( 'ABSPATH' ) || exit;

/**
 * The add-on ships its own autoloader, independent of the free plugin.
 */
final class Autoloader {

	/**
	 * Registers the autoloader for a namespace prefix.
	 *
	 * @param string $prefix   Namespace prefix.
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

				$file = $base_dir . str_replace( '\\', '/', substr( $class_name, $length ) ) . '.php';

				if ( is_readable( $file ) ) {
					require_once $file;
				}
			}
		);
	}
}
