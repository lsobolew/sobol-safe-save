<?php
/**
 * Constants that PHPStan cannot infer, because WordPress defines them at runtime.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

define( 'MY_PLUGIN_PRO_VERSION', '0.1.0' );
define( 'MY_PLUGIN_PRO_FILE', __FILE__ );
define( 'MY_PLUGIN_PRO_DIR', dirname( __DIR__ ) . '/' );
define( 'MY_PLUGIN_PRO_URL', 'https://example.test/wp-content/plugins/my-plugin-pro/' );
define( 'MY_PLUGIN_PRO_BASENAME', 'my-plugin-pro/my-plugin-pro.php' );
define( 'MY_PLUGIN_PRO_MIN_CORE_API', '1.0.0' );
