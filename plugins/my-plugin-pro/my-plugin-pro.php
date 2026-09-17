<?php
/**
 * Plugin Name:       My Plugin Pro
 * Plugin URI:        https://github.com/lsobolew/wp-plugin-lab-pro
 * Update URI:        https://github.com/lsobolew/wp-plugin-lab-pro
 * Description:       Paid add-on for the My Plugin plugin.
 * Version:           0.1.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Requires Plugins:  my-plugin
 * Author:            Lukasz Sobolewski
 * Author URI:        https://github.com/lsobolew
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       my-plugin-pro
 * Domain Path:       /languages
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro;

defined( 'ABSPATH' ) || exit;

define( 'MY_PLUGIN_PRO_VERSION', '0.1.0' );
define( 'MY_PLUGIN_PRO_FILE', __FILE__ );
define( 'MY_PLUGIN_PRO_DIR', plugin_dir_path( __FILE__ ) );
define( 'MY_PLUGIN_PRO_URL', plugin_dir_url( __FILE__ ) );
define( 'MY_PLUGIN_PRO_BASENAME', plugin_basename( __FILE__ ) );

// Minimum version of the free plugin extension contract (MyVendor\MyPlugin\Core\Api::VERSION).
define( 'MY_PLUGIN_PRO_MIN_CORE_API', '1.0.0' );

require_once __DIR__ . '/src/Core/Autoloader.php';
Core\Autoloader::register( __NAMESPACE__, __DIR__ . '/src' );

if ( is_readable( __DIR__ . '/vendor/autoload.php' ) ) {
	require_once __DIR__ . '/vendor/autoload.php';
}

// The "Requires Plugins" header only enforces the dependency from WP 6.5 on, and it never checks
// the contract version. So the add-on verifies for itself that the core is present and compatible,
// and shows a notice instead of taking the site down with a fatal error.
add_action( 'plugins_loaded', array( Core\Bootstrap::class, 'init' ), 1 );
