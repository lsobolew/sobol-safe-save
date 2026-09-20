<?php
/**
 * Module: WP-CLI commands.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Modules\Cli;

use Sobolewski\SobolSafeSave\Core\Module as ModuleContract;
use Sobolewski\SobolSafeSave\Core\Plugin;
use WP_CLI;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the commands only when the code runs under WP-CLI.
 */
final class Module implements ModuleContract {

	/**
	 * Plugin instance.
	 *
	 * @var Plugin
	 */
	private $plugin;

	/**
	 * Constructor.
	 *
	 * @param Plugin $plugin Plugin instance.
	 */
	public function __construct( Plugin $plugin ) {
		$this->plugin = $plugin;
	}

	/**
	 * Module identifier.
	 */
	public function id(): string {
		return 'cli';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
			return;
		}

		WP_CLI::add_command( 'sobol-safe-save', Command::class );
	}
}
