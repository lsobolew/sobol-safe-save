<?php
/**
 * Uninstall routine for the Pro add-on.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Removes the add-on data from a single site.
 */
function my_plugin_pro_uninstall_site(): void {
	delete_option( 'my_plugin_pro_license' );
	delete_transient( 'my_plugin_pro_license_check' );
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
		my_plugin_pro_uninstall_site();
		restore_current_blog();
	}
} else {
	my_plugin_pro_uninstall_site();
}
