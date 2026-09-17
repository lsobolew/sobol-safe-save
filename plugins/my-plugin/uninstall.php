<?php
/**
 * Plugin uninstall routine - called by WordPress when the plugin is deleted.
 *
 * This file runs WITHOUT the plugin loaded, so there is no autoloader and none of the constants
 * from my-plugin.php. That is why the option names are spelled out literally.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

// Without this constant the file was called directly.
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Removes the plugin data from a single site.
 */
function my_plugin_uninstall_site(): void {
	delete_option( 'my_plugin_settings' );
	delete_option( 'my_plugin_version' );
	delete_option( 'my_plugin_flush_rewrite' );

	// Custom post type entries are kept on purpose - silently deleting user content is a bad default.
}

if ( is_multisite() ) {
	$site_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);

	foreach ( $site_ids as $site_id ) {
		switch_to_blog( (int) $site_id );
		my_plugin_uninstall_site();
		restore_current_blog();
	}
} else {
	my_plugin_uninstall_site();
}
