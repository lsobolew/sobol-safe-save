<?php
/**
 * Add-on startup and compatibility check against the free plugin.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\Core;

use MyVendor\MyPlugin\Core\Api;
use MyVendor\MyPlugin\Core\Module as CoreModule;
use MyVendor\MyPlugin\Core\Plugin as CorePlugin;
use MyVendor\MyPluginPro\License\LicenseManager;
use MyVendor\MyPluginPro\License\Updater;

defined( 'ABSPATH' ) || exit;

/**
 * The add-on does not bundle the core classes - it uses them at runtime. So before doing anything
 * it checks that the core exists and that its extension contract is a compatible version.
 */
final class Bootstrap {

	/**
	 * Why the add-on refused to start.
	 *
	 * @var string
	 */
	private static $blocker = '';

	/**
	 * Called on `plugins_loaded` at priority 1, that is before the free plugin boots (priority 5).
	 */
	public static function init(): void {
		if ( ! class_exists( Api::class ) ) {
			self::$blocker = __(
				'My Plugin Pro requires the My Plugin plugin to be active.',
				'my-plugin-pro'
			);
			add_action( 'admin_notices', array( self::class, 'render_notice' ) );

			return;
		}

		if ( ! Api::is_compatible( MY_PLUGIN_PRO_MIN_CORE_API ) ) {
			self::$blocker = sprintf(
				/* translators: 1: required API version, 2: available API version */
				__(
					'My Plugin Pro needs extension API %1$s, but My Plugin provides %2$s. Please update both plugins.',
					'my-plugin-pro'
				),
				MY_PLUGIN_PRO_MIN_CORE_API,
				Api::version()
			);
			add_action( 'admin_notices', array( self::class, 'render_notice' ) );

			return;
		}

		$license = new LicenseManager();
		$license->register();

		// Updates are the only licence-gated feature: the functionality itself keeps working, so an
		// expired licence never breaks a running customer site.
		( new Updater( $license ) )->register();

		add_action( 'myplugin_register_modules', array( self::class, 'register_modules' ) );
	}

	/**
	 * Adds the add-on modules to the free plugin registry.
	 *
	 * @param CorePlugin $plugin Free plugin instance.
	 */
	public static function register_modules( CorePlugin $plugin ): void {
		$file = MY_PLUGIN_PRO_DIR . 'config/modules.php';

		if ( ! is_readable( $file ) ) {
			return;
		}

		$classes = require $file;

		foreach ( (array) $classes as $class_name ) {
			if ( ! is_string( $class_name ) || ! class_exists( $class_name ) ) {
				continue;
			}

			$module = new $class_name( $plugin );

			if ( $module instanceof CoreModule ) {
				$plugin->add_module( $module );
			}
		}
	}

	/**
	 * Admin notice shown when the add-on cannot start.
	 */
	public static function render_notice(): void {
		if ( '' === self::$blocker || ! current_user_can( 'activate_plugins' ) ) {
			return;
		}

		printf( '<div class="notice notice-warning"><p>%s</p></div>', esc_html( self::$blocker ) );
	}
}
