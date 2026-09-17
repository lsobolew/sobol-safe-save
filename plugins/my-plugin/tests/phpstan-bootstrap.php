<?php
/**
 * Constants that PHPStan cannot infer, because WordPress defines them at runtime.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

define( 'MY_PLUGIN_VERSION', '0.1.0' );
define( 'MY_PLUGIN_FILE', __FILE__ );
define( 'MY_PLUGIN_DIR', dirname( __DIR__ ) . '/' );
define( 'MY_PLUGIN_URL', 'https://example.test/wp-content/plugins/my-plugin/' );
define( 'MY_PLUGIN_BASENAME', 'my-plugin/my-plugin.php' );
define( 'MY_PLUGIN_MIN_PHP', '7.4' );
define( 'MY_PLUGIN_MIN_WP', '6.6' );
