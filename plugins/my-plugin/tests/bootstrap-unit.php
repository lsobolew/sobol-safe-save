<?php
/**
 * Bootstrap for the unit test suite.
 *
 * Unit tests do not load WordPress - core functions are replaced by Brain Monkey. That keeps the
 * whole suite in the sub-second range and free of any database dependency.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

// Every plugin file starts with `defined( 'ABSPATH' ) || exit;`, so the constant must exist.
define( 'ABSPATH', __DIR__ . '/fixtures/wordpress/' );

define( 'MY_PLUGIN_VERSION', '0.1.0' );
define( 'MY_PLUGIN_FILE', dirname( __DIR__ ) . '/my-plugin.php' );
define( 'MY_PLUGIN_DIR', dirname( __DIR__ ) . '/' );
define( 'MY_PLUGIN_URL', 'https://example.test/wp-content/plugins/my-plugin/' );
define( 'MY_PLUGIN_BASENAME', 'my-plugin/my-plugin.php' );
define( 'MY_PLUGIN_MIN_PHP', '7.4' );
define( 'MY_PLUGIN_MIN_WP', '6.6' );

// WordPress time constants. They are used inside class constant expressions, which PHP evaluates
// when the class is loaded - long before any mock could provide them.
defined( 'MINUTE_IN_SECONDS' ) || define( 'MINUTE_IN_SECONDS', 60 );
defined( 'HOUR_IN_SECONDS' ) || define( 'HOUR_IN_SECONDS', 60 * MINUTE_IN_SECONDS );
defined( 'DAY_IN_SECONDS' ) || define( 'DAY_IN_SECONDS', 24 * HOUR_IN_SECONDS );
defined( 'WEEK_IN_SECONDS' ) || define( 'WEEK_IN_SECONDS', 7 * DAY_IN_SECONDS );
defined( 'MONTH_IN_SECONDS' ) || define( 'MONTH_IN_SECONDS', 30 * DAY_IN_SECONDS );
defined( 'YEAR_IN_SECONDS' ) || define( 'YEAR_IN_SECONDS', 365 * DAY_IN_SECONDS );

require_once dirname( __DIR__ ) . '/vendor/autoload.php';
