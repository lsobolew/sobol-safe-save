<?php
/**
 * Plugin settings repository.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

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
	const OPTION = 'sobol_safe_save_settings';

	/**
	 * Settings group for the Settings API.
	 */
	const GROUP = 'sobol_safe_save_settings_group';

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
			'sobol_safe_save_settings_defaults',
			array(

				/*
				 * An empty list means every post type that has an editor, rather than a snapshot
				 * of the types that happened to exist when the plugin was first activated. A post
				 * type registered by a theme or plugin next month is then covered without anybody
				 * having to remember to tick it.
				 */
				'post_types'    => array(),
				'check_title'   => true,
				'check_excerpt' => true,
				'debounce_ms'   => 800,
			)
		);
	}

	/**
	 * Post types that can be checked at all.
	 *
	 * Anything with an editor and a screen to edit it on. A post type with no editor has no
	 * content for WordPress to filter, so warning about it would be meaningless.
	 *
	 * @return string[]
	 */
	public static function available_post_types(): array {
		$types = get_post_types( array( 'show_ui' => true ), 'names' );

		return array_values(
			array_filter(
				$types,
				static function ( $type ): bool {
					return post_type_supports( $type, 'editor' );
				}
			)
		);
	}

	/**
	 * Post types this site actually checks.
	 *
	 * @return string[]
	 */
	public static function checked_post_types(): array {
		$available = self::available_post_types();
		$stored    = array_filter( array_map( 'strval', (array) self::get( 'post_types', array() ) ) );

		if ( ! $stored ) {
			return $available;
		}

		// Intersecting rather than trusting the stored list: a post type can be deregistered long
		// after somebody ticked it, and checking one that no longer exists helps nobody.
		return array_values( array_intersect( $stored, $available ) );
	}

	/**
	 * Whether a given post type is checked.
	 *
	 * @param string $post_type Post type name.
	 */
	public static function checks( string $post_type ): bool {
		return in_array( $post_type, self::checked_post_types(), true );
	}

	/**
	 * How long typing has to stop before the editor asks the server, in milliseconds.
	 *
	 * Clamped on the way out rather than on the way in. The option is a database row and can be
	 * set by WP-CLI, a migration or a hand-edited row, none of which go through the settings form
	 * - and a stored 0 would mean a request per keystroke.
	 */
	public static function debounce_ms(): int {
		return min( 5000, max( 200, (int) self::get( 'debounce_ms', 800 ) ) );
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

			if ( is_array( $default_value ) ) {
				$clean[ $key ] = array_values(
					array_filter( array_map( 'sanitize_key', array_map( 'strval', (array) $value ) ) )
				);
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
		return apply_filters( 'sobol_safe_save_settings_sanitize', $clean, $input );
	}
}
