<?php
/**
 * Plugin settings repository.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Settings storage belongs to the core rather than to the settings-screen module, so removing the
 * "settings" module only takes away the UI - the stored data and defaults keep working.
 *
 * Everything lives in a single option (one database row instead of a dozen autoloaded ones).
 */
final class Settings {

	/**
	 * Option name in the database.
	 */
	const OPTION = 'my_plugin_settings';

	/**
	 * Settings group for the Settings API.
	 */
	const GROUP = 'my_plugin_settings_group';

	/**
	 * Default values.
	 *
	 * @return array<string, mixed>
	 */
	public static function defaults(): array {
		/**
		 * Filters the default settings - modules add their own keys here.
		 *
		 * @param array<string, mixed> $defaults Default settings.
		 */
		return apply_filters(
			'myplugin_settings_defaults',
			array(
				'enabled'        => true,
				'items_per_page' => 10,
				'api_label'      => '',
			)
		);
	}

	/**
	 * All settings, filled in with the defaults.
	 *
	 * @return array<string, mixed>
	 */
	public static function all(): array {
		$stored = get_option( self::OPTION, array() );

		return array_merge( self::defaults(), is_array( $stored ) ? $stored : array() );
	}

	/**
	 * A single setting.
	 *
	 * @param string $key      Setting key.
	 * @param mixed  $fallback Value returned when the key does not exist.
	 *
	 * @return mixed
	 */
	public static function get( string $key, $fallback = null ) {
		$all = self::all();

		return array_key_exists( $key, $all ) ? $all[ $key ] : $fallback;
	}

	/**
	 * Stores the settings after sanitization.
	 *
	 * @param array<string, mixed> $values New values.
	 */
	public static function update( array $values ): bool {
		return update_option( self::OPTION, self::sanitize( $values ) );
	}

	/**
	 * Sanitizes the whole settings array.
	 *
	 * Unknown keys are dropped - this is the single place deciding what may reach the database.
	 *
	 * @param mixed $input Raw data, usually straight from the settings form.
	 *
	 * @return array<string, mixed>
	 */
	public static function sanitize( $input ): array {
		$input    = is_array( $input ) ? $input : array();
		$defaults = self::defaults();
		$clean    = array();

		foreach ( $defaults as $key => $default_value ) {
			$value = $input[ $key ] ?? $default_value;

			if ( is_bool( $default_value ) ) {
				$clean[ $key ] = (bool) $value;
				continue;
			}

			if ( is_int( $default_value ) ) {
				// Deliberately (int) rather than absint(): absint( -5 ) returns 5, so a negative
				// value from the form would flip sign instead of being clamped to the minimum.
				$clean[ $key ] = max( 1, (int) $value );
				continue;
			}

			$clean[ $key ] = sanitize_text_field( (string) $value );
		}

		/**
		 * Filters the sanitized settings, the last word before they are stored.
		 *
		 * @param array<string, mixed> $clean Sanitized data.
		 * @param mixed                $input Raw input.
		 */
		return apply_filters( 'myplugin_settings_sanitize', $clean, $input );
	}
}
