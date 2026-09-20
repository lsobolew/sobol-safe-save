<?php
/**
 * Constants that PHPStan cannot infer, because WordPress defines them at runtime.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

define( 'SOBOL_SAFE_SAVE_VERSION', '0.1.0' );
define( 'SOBOL_SAFE_SAVE_FILE', __FILE__ );
define( 'SOBOL_SAFE_SAVE_DIR', dirname( __DIR__ ) . '/' );
define( 'SOBOL_SAFE_SAVE_URL', 'https://example.test/wp-content/plugins/sobol-safe-save/' );
define( 'SOBOL_SAFE_SAVE_BASENAME', 'sobol-safe-save/sobol-safe-save.php' );
define( 'SOBOL_SAFE_SAVE_MIN_PHP', '7.4' );
define( 'SOBOL_SAFE_SAVE_MIN_WP', '6.6' );
