<?php
/**
 * Public extension API.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * The contract between the free plugin and its add-ons (such as the Pro edition).
 *
 * VERSION is versioned semantically and INDEPENDENTLY of the plugin version: a major bump means
 * a breaking change for add-ons. An add-on declares the minimum API version it needs and refuses
 * to start on its own instead of taking the site down with a fatal error.
 */
final class Api {

	/**
	 * Version of the extension contract.
	 */
	const VERSION = '1.0.0';

	/**
	 * The API version.
	 */
	public static function version(): string {
		return self::VERSION;
	}

	/**
	 * The plugin instance.
	 */
	public static function plugin(): Plugin {
		return Plugin::instance();
	}

	/**
	 * Whether the current API satisfies an add-on requirement.
	 *
	 * @param string $required Minimum API version required by the add-on.
	 */
	public static function is_compatible( string $required ): bool {
		$current = explode( '.', self::VERSION );
		$wanted  = explode( '.', $required );

		// A different major version means the contract is incompatible.
		if ( ( $current[0] ?? '0' ) !== ( $wanted[0] ?? '0' ) ) {
			return false;
		}

		return version_compare( self::VERSION, $required, '>=' );
	}
}
