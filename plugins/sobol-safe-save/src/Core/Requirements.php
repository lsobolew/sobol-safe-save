<?php
/**
 * Environment gate - the only file loaded before the autoloader.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Checks the minimum PHP and WordPress versions.
 */
final class Requirements {

	/**
	 * Why the requirements are not met, rendered in the admin.
	 *
	 * @var string
	 */
	private static $reason = '';

	/**
	 * Whether the environment satisfies the plugin requirements.
	 */
	public static function met(): bool {
		if ( version_compare( PHP_VERSION, SOBOL_SAFE_SAVE_MIN_PHP, '<' ) ) {
			self::$reason = sprintf(
				/* translators: 1: required PHP version, 2: current PHP version */
				'Sobol Safe Save requires PHP %1$s or newer. This server runs %2$s.',
				SOBOL_SAFE_SAVE_MIN_PHP,
				PHP_VERSION
			);

			return false;
		}

		if ( version_compare( (string) get_bloginfo( 'version' ), SOBOL_SAFE_SAVE_MIN_WP, '<' ) ) {
			self::$reason = sprintf(
				/* translators: 1: required WordPress version, 2: current WordPress version */
				'Sobol Safe Save requires WordPress %1$s or newer. This site runs %2$s.',
				SOBOL_SAFE_SAVE_MIN_WP,
				(string) get_bloginfo( 'version' )
			);

			return false;
		}

		return true;
	}

	/**
	 * Admin notice shown when the requirements are not met.
	 */
	public static function render_notice(): void {
		if ( '' === self::$reason || ! current_user_can( 'activate_plugins' ) ) {
			return;
		}

		printf(
			'<div class="notice notice-error"><p>%s</p></div>',
			esc_html( self::$reason )
		);
	}
}
