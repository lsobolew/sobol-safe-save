<?php
/**
 * Plugin Name:       Sobol Safe Save
 * Plugin URI:        https://github.com/lsobolew/sobol-safe-save
 * Description:       Warns you before saving when WordPress will strip or change part of your content, and shows exactly which blocks are affected.
 * Version:           0.1.0
 * Requires at least: 6.8
 * Requires PHP:      7.4
 * Author:            Lukasz Sobolewski
 * Author URI:        https://github.com/lsobolew
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       sobol-safe-save
 * Domain Path:       /languages
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave;

defined( 'ABSPATH' ) || exit;

define( 'SOBOL_SAFE_SAVE_VERSION', '0.1.0' );
define( 'SOBOL_SAFE_SAVE_FILE', __FILE__ );
define( 'SOBOL_SAFE_SAVE_DIR', plugin_dir_path( __FILE__ ) );
define( 'SOBOL_SAFE_SAVE_URL', plugin_dir_url( __FILE__ ) );
define( 'SOBOL_SAFE_SAVE_BASENAME', plugin_basename( __FILE__ ) );
define( 'SOBOL_SAFE_SAVE_MIN_PHP', '7.4' );
define( 'SOBOL_SAFE_SAVE_MIN_WP', '6.8' );

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
// after this plugin and need a chance to hook `sobol_safe_save_register_modules` before it fires.
add_action(
	'plugins_loaded',
	static function () {
		Core\Plugin::instance()->boot();
	},
	5
);
