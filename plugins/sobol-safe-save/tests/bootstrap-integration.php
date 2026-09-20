<?php
/**
 * Bootstrap for the integration test suite.
 *
 * Boots a real WordPress from the core test package (WP_UnitTestCase, factories, database).
 * `env/bin/install-test-suite.sh` installs the package matching the core inside the container.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

$tests_dir = getenv( 'WP_TESTS_DIR' );
$tests_dir = is_string( $tests_dir ) && '' !== $tests_dir ? $tests_dir : '/tmp/wordpress-tests-lib';

if ( ! is_readable( $tests_dir . '/includes/functions.php' ) ) {
	fwrite( // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- CLI bootstrap, WP_Filesystem is not loaded yet.
		STDERR,
		"WordPress test package missing in {$tests_dir}.\n" .
		"Run: ./bin/wpx test integration (it installs the package for you).\n"
	);
	exit( 1 );
}

// The core test package needs the PHPUnit polyfills; point it at the ones in the plugin vendor/.
if ( ! defined( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH' ) ) {
	define( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH', dirname( __DIR__ ) . '/vendor/yoast/phpunit-polyfills' );
}

require_once $tests_dir . '/includes/functions.php';

// The plugin is loaded as an mu-plugin, that is before WordPress reaches `init`.
tests_add_filter(
	'muplugins_loaded',
	static function () {
		require dirname( __DIR__ ) . '/sobol-safe-save.php';

		// In the "pro" edition the same core suite runs with the add-on active, which is how
		// regressions where the add-on breaks the free plugin surface.
		if ( 'pro' === getenv( 'WPLAB_EDITION' ) ) {
			$pro_env  = getenv( 'WPLAB_PRO_DIR' );
			$pro_dir  = dirname( __DIR__, 2 ) . '/' . ( is_string( $pro_env ) && '' !== $pro_env ? $pro_env : 'sobol-safe-save-pro' );
			$pro_file = $pro_dir . '/' . basename( $pro_dir ) . '.php';

			if ( is_readable( $pro_file ) ) {
				require $pro_file;
			}
		}
	}
);

require $tests_dir . '/includes/bootstrap.php';
