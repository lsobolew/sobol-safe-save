<?php
/**
 * Bootstrap for the add-on integration suite - boots WordPress with both plugins loaded.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

$tests_dir = getenv( 'WP_TESTS_DIR' );
$tests_dir = is_string( $tests_dir ) && '' !== $tests_dir ? $tests_dir : '/tmp/wordpress-tests-lib';

if ( ! is_readable( $tests_dir . '/includes/functions.php' ) ) {
	fwrite( // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- CLI bootstrap, WP_Filesystem is not available.
		STDERR,
		"WordPress test package missing in {$tests_dir}.\n"
	);
	exit( 1 );
}

$free_env = getenv( 'WPLAB_FREE_DIR' );
$free_dir = dirname( __DIR__, 2 ) . '/' . ( is_string( $free_env ) && '' !== $free_env ? $free_env : 'my-plugin' );

if ( ! defined( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH' ) ) {
	define( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH', $free_dir . '/vendor/yoast/phpunit-polyfills' );
}

require_once $tests_dir . '/includes/functions.php';

tests_add_filter(
	'muplugins_loaded',
	static function () use ( $free_dir ) {
		// Order matters: the add-on checks for the core classes as soon as it is loaded.
		require $free_dir . '/my-plugin.php';
		require dirname( __DIR__ ) . '/my-plugin-pro.php';
	}
);

require $tests_dir . '/includes/bootstrap.php';

MyVendor\MyPluginPro\Core\Autoloader::register( 'MyVendor\MyPluginPro\Tests', __DIR__ );
