<?php
/**
 * Plugin Name:       My Plugin
 * Plugin URI:        https://github.com/lsobolew/wp-plugin-lab
 * Description:       A WordPress plugin scaffolded with WP Plugin Lab.
 * Version:           0.1.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            Lukasz Sobolewski
 * Author URI:        https://github.com/lsobolew
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       my-plugin
 * Domain Path:       /languages
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin;

defined( 'ABSPATH' ) || exit;

define( 'MY_PLUGIN_VERSION', '0.1.0' );
define( 'MY_PLUGIN_FILE', __FILE__ );
define( 'MY_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'MY_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'MY_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );
define( 'MY_PLUGIN_MIN_PHP', '7.4' );
define( 'MY_PLUGIN_MIN_WP', '6.6' );

require_once __DIR__ . '/src/Core/Requirements.php';

// The plugin must never fatal on an unsupported PHP/WP version: show a notice and stay quiet.
if ( ! Core\Requirements::met() ) {
	add_action( 'admin_notices', array( Core\Requirements::class, 'render_notice' ) );

	return;
}

require_once __DIR__ . '/src/Core/Autoloader.php';
Core\Autoloader::register( __NAMESPACE__, __DIR__ . '/src' );

// vendor/ is optional: our own classes come from the autoloader above, this only adds libraries.
if ( is_readable( __DIR__ . '/vendor/autoload.php' ) ) {
	require_once __DIR__ . '/vendor/autoload.php';
}

register_activation_hook( __FILE__, array( Core\Activator::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( Core\Deactivator::class, 'deactivate' ) );

// Boot on `plugins_loaded` rather than at file load: add-ons (such as the Pro edition) are loaded
// after this plugin and need a chance to hook `myplugin_register_modules` before it fires.
add_action(
	'plugins_loaded',
	static function () {
		Core\Plugin::instance()->boot();
	},
	5
);
