<?php
/**
 * Plugin core: container, module registry, boot.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * The single entry point. Loads the module list, lets it be filtered (this is how the Pro
 * edition plugs in) and registers every module.
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Service container.
	 *
	 * @var Container
	 */
	private $container;

	/**
	 * Registered modules, keyed by id.
	 *
	 * @var array<string, Module>
	 */
	private $modules = array();

	/**
	 * Whether boot() already ran.
	 *
	 * @var bool
	 */
	private $booted = false;

	/**
	 * Private constructor - use instance().
	 */
	private function __construct() {
		$this->container = new Container();
	}

	/**
	 * Returns the shared plugin instance.
	 */
	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * The plugin service container.
	 */
	public function container(): Container {
		return $this->container;
	}

	/**
	 * Plugin version taken from the plugin header.
	 */
	public function version(): string {
		return SOBOL_SAFE_SAVE_VERSION;
	}

	/**
	 * A registered module, or null.
	 *
	 * @param string $id Module identifier.
	 */
	public function module( string $id ): ?Module {
		return $this->modules[ $id ] ?? null;
	}

	/**
	 * All registered modules.
	 *
	 * @return array<string, Module>
	 */
	public function modules(): array {
		return $this->modules;
	}

	/**
	 * Adds a module to the registry and registers its hooks.
	 *
	 * Public on purpose: this is how Pro edition modules join in on `sobol_safe_save_register_modules`.
	 *
	 * @param Module $module Module to register.
	 */
	public function add_module( Module $module ): void {
		$id = $module->id();

		if ( isset( $this->modules[ $id ] ) ) {
			return;
		}

		$this->modules[ $id ] = $module;
		$module->register();
	}

	/**
	 * Boots the plugin. Idempotent.
	 */
	public function boot(): void {
		if ( $this->booted ) {
			return;
		}

		$this->booted = true;

		$this->register_services();

		add_action( 'init', array( $this->container->get( 'i18n' ), 'load' ), 0 );
		add_action( 'init', array( Upgrader::class, 'maybe_upgrade' ), 5 );
		add_action( 'wp_loaded', array( Upgrader::class, 'maybe_flush_rewrite' ), 100 );

		/**
		 * Filters the list of module classes.
		 *
		 * @param string[] $classes Class names implementing Module.
		 */
		$classes = apply_filters( 'sobol_safe_save_modules', $this->module_classes() );

		foreach ( $classes as $class_name ) {
			if ( ! is_string( $class_name ) || ! class_exists( $class_name ) ) {
				continue;
			}

			$module = new $class_name( $this );

			if ( $module instanceof Module ) {
				$this->add_module( $module );
			}
		}

		/**
		 * Fires when add-ons may register their own modules (used by the Pro edition).
		 *
		 * @param Plugin $plugin Plugin instance.
		 */
		do_action( 'sobol_safe_save_register_modules', $this );

		/**
		 * Fires once the plugin is fully booted.
		 *
		 * @param Plugin $plugin Plugin instance.
		 */
		do_action( 'sobol_safe_save_loaded', $this );
	}

	/**
	 * Module classes from config/modules.php.
	 *
	 * @return string[]
	 */
	private function module_classes(): array {
		$file = SOBOL_SAFE_SAVE_DIR . 'config/modules.php';

		if ( ! is_readable( $file ) ) {
			return array();
		}

		$classes = require $file;

		return is_array( $classes ) ? $classes : array();
	}

	/**
	 * Services shared between modules.
	 */
	private function register_services(): void {
		$this->container->set(
			'i18n',
			static function () {
				return new I18n();
			}
		);

		$this->container->set(
			'assets',
			static function () {
				return new Assets();
			}
		);
	}
}
