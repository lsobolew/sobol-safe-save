<?php
/**
 * Migrations between plugin versions.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Compares the version stored in the database with the version in code and runs the missing
 * migrations.
 *
 * Add migrations to MIGRATIONS: the key is the version the migration belongs to. Each one runs
 * exactly once, in ascending order.
 */
final class Upgrader {

	/**
	 * Migrations to run, keyed by the version they belong to.
	 *
	 * A method rather than a constant on purpose: a declared return type keeps static analysis
	 * meaningful while the list is still empty, and it leaves room for conditional migrations.
	 *
	 * Example:
	 *   '0.2.0' => array( self::class, 'migrate_0_2_0' ),
	 *
	 * @return array<string, callable>
	 */
	private static function migrations(): array {
		return array();
	}

	/**
	 * Runs the migrations when the stored version lags behind the code.
	 */
	public static function maybe_upgrade(): void {
		$stored = (string) get_option( Activator::VERSION_OPTION, '0.0.0' );

		if ( version_compare( $stored, SOBOL_SAFE_SAVE_VERSION, '>=' ) ) {
			return;
		}

		$migrations = self::migrations();
		uksort( $migrations, 'version_compare' );

		foreach ( $migrations as $version => $callback ) {
			if ( version_compare( $stored, (string) $version, '<' ) && is_callable( $callback ) ) {
				call_user_func( $callback, $stored );
			}
		}

		update_option( Activator::VERSION_OPTION, SOBOL_SAFE_SAVE_VERSION );

		// An upgrade can change what a module registers, so give the modules the same chance they
		// get at activation - and nothing at all if none of them asked for anything.
		foreach ( Activator::activation_aware_modules() as $class_name ) {
			$class_name::on_activate();
		}

		/**
		 * Fires after the plugin has been upgraded.
		 *
		 * @param string $from Previous version.
		 * @param string $to   New version.
		 */
		do_action( 'sobol_safe_save_upgraded', $stored, SOBOL_SAFE_SAVE_VERSION );
	}

	/**
	 * Flushes the rewrite rules once, after an activation or an upgrade.
	 *
	 * Called on `wp_loaded`, that is AFTER the whole `init` cycle. Flushing earlier would rebuild
	 * the rules before modules register their post types, and custom post type archives would 404
	 * until someone re-saved the permalink settings by hand.
	 */
	public static function maybe_flush_rewrite(): void {
		if ( '1' !== (string) get_option( Activator::FLUSH_FLAG, '' ) ) {
			return;
		}

		delete_option( Activator::FLUSH_FLAG );
		flush_rewrite_rules( false );
	}
}
