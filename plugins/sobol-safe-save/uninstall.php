<?php
/**
 * Plugin uninstall routine - called by WordPress when the plugin is deleted.
 *
 * This file runs WITHOUT the plugin loaded, so there is no autoloader and none of the constants
 * from sobol-safe-save.php. That is why the option names are spelled out literally.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

// Without this constant the file was called directly.
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Removes the plugin data from a single site.
 */
function sobol_safe_save_uninstall_site(): void {
	delete_option( 'sobol_safe_save_settings' );
	delete_option( 'sobol_safe_save_version' );
	delete_option( 'sobol_safe_save_flush_rewrite' );

	/*
	 * The `sobol_safe_save_loss_*` transients are deliberately left to expire on their own. They hold a
	 * report for the five minutes between a classic editor save and the notice on the next screen,
	 * so by the time anybody uninstalls the plugin they are long gone - and chasing them would mean
	 * a direct query against the options table to delete rows that delete themselves.
	 */
}

if ( is_multisite() ) {
	// Prefixed because this file runs at the top level, where a bare $site_ids would be a global.
	$sobol_safe_save_site_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);

	foreach ( $sobol_safe_save_site_ids as $sobol_safe_save_site_id ) {
		switch_to_blog( (int) $sobol_safe_save_site_id );
		sobol_safe_save_uninstall_site();
		restore_current_blog();
	}
} else {
	sobol_safe_save_uninstall_site();
}
