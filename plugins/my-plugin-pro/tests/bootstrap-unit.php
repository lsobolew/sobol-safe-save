<?php
/**
 * Bootstrap for the add-on unit test suite.
 *
 * The tooling (PHPUnit, Brain Monkey, Mockery) comes from the free plugin vendor/ - the add-on
 * cannot run without it anyway, so a second copy of the same packages would be pure waste.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

define( 'ABSPATH', __DIR__ . '/fixtures/wordpress/' );

define( 'MY_PLUGIN_PRO_VERSION', '0.1.0' );
define( 'MY_PLUGIN_PRO_FILE', dirname( __DIR__ ) . '/my-plugin-pro.php' );
define( 'MY_PLUGIN_PRO_DIR', dirname( __DIR__ ) . '/' );
define( 'MY_PLUGIN_PRO_URL', 'https://example.test/wp-content/plugins/my-plugin-pro/' );
define( 'MY_PLUGIN_PRO_BASENAME', 'my-plugin-pro/my-plugin-pro.php' );
define( 'MY_PLUGIN_PRO_MIN_CORE_API', '1.0.0' );

// WordPress time constants. They are used inside class constant expressions, which PHP evaluates
// when the class is loaded - long before any mock could provide them.
defined( 'MINUTE_IN_SECONDS' ) || define( 'MINUTE_IN_SECONDS', 60 );
defined( 'HOUR_IN_SECONDS' ) || define( 'HOUR_IN_SECONDS', 60 * MINUTE_IN_SECONDS );
defined( 'DAY_IN_SECONDS' ) || define( 'DAY_IN_SECONDS', 24 * HOUR_IN_SECONDS );
defined( 'WEEK_IN_SECONDS' ) || define( 'WEEK_IN_SECONDS', 7 * DAY_IN_SECONDS );
defined( 'MONTH_IN_SECONDS' ) || define( 'MONTH_IN_SECONDS', 30 * DAY_IN_SECONDS );
defined( 'YEAR_IN_SECONDS' ) || define( 'YEAR_IN_SECONDS', 365 * DAY_IN_SECONDS );

$free_env    = getenv( 'WPLAB_FREE_DIR' );
$free_dir    = is_string( $free_env ) && '' !== $free_env ? $free_env : 'my-plugin';
$core_vendor = dirname( __DIR__, 2 ) . '/' . $free_dir . '/vendor/autoload.php';

if ( ! is_readable( $core_vendor ) ) {
	fwrite( // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- CLI bootstrap, WP_Filesystem is not available.
		STDERR,
		"Free plugin vendor/ not found ({$core_vendor}).\n"
	);
	exit( 1 );
}

require_once $core_vendor;
require_once dirname( __DIR__ ) . '/src/Core/Autoloader.php';

MyVendor\MyPluginPro\Core\Autoloader::register( 'MyVendor\MyPluginPro', dirname( __DIR__ ) . '/src' );
MyVendor\MyPluginPro\Core\Autoloader::register( 'MyVendor\MyPluginPro\Tests', __DIR__ );
