<?php
/**
 * Plugin activation.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Records the data version, then lets each module do its own activation work.
 *
 * Core deliberately knows nothing about what that work is. A module that registers post types asks
 * for a rewrite flush; one with settings seeds its defaults; a plugin with neither does neither,
 * without anybody having to remember to take the code out.
 */
final class Activator {

	/**
	 * Option holding the data schema version.
	 */
	const VERSION_OPTION = 'sobol_safe_save_version';

	/**
	 * Flag requesting a rewrite rules flush.
	 */
	const FLUSH_FLAG = 'sobol_safe_save_flush_rewrite';

	/**
	 * Called by register_activation_hook.
	 *
	 * @param bool $network_wide Whether the plugin is being activated network-wide.
	 */
	public static function activate( $network_wide = false ): void {
		if ( $network_wide && is_multisite() ) {
			foreach ( self::site_ids() as $site_id ) {
				switch_to_blog( $site_id );
				self::activate_single_site();
				restore_current_blog();
			}

			return;
		}

		self::activate_single_site();
	}

	/**
	 * Initializes a single site.
	 */
	private static function activate_single_site(): void {
		update_option( self::VERSION_OPTION, SOBOL_SAFE_SAVE_VERSION );

		foreach ( self::activation_aware_modules() as $class_name ) {
			$class_name::on_activate();
		}
	}

	/**
	 * Module classes that have activation work of their own.
	 *
	 * Read straight from config/modules.php rather than from the booted plugin: activation happens
	 * on a request where no module has been instantiated yet.
	 *
	 * @return string[]
	 */
	public static function activation_aware_modules(): array {
		$file = SOBOL_SAFE_SAVE_DIR . 'config/modules.php';

		if ( ! is_readable( $file ) ) {
			return array();
		}

		$classes = require $file;

		if ( ! is_array( $classes ) ) {
			return array();
		}

		return array_values(
			array_filter(
				$classes,
				static function ( $class_name ): bool {
					return is_string( $class_name )
						&& class_exists( $class_name )
						&& is_a( $class_name, ActivationAware::class, true );
				}
			)
		);
	}

	/**
	 * Site ids in the network.
	 *
	 * @return int[]
	 */
	private static function site_ids(): array {
		if ( ! is_multisite() ) {
			return array();
		}

		return array_map(
			'intval',
			get_sites(
				array(
					'fields' => 'ids',
					'number' => 0,
				)
			)
		);
	}
}
