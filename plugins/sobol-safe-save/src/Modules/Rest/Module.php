<?php
/**
 * Module: REST API.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Modules\Rest;

use Sobolewski\SobolSafeSave\Core\Module as ModuleContract;
use Sobolewski\SobolSafeSave\Core\Plugin;

defined( 'ABSPATH' ) || exit;

/**
 * Exposes the analysis to the editors.
 *
 * Both editors ask the same question over the same route. The analysis has to happen on the
 * server because it is the server that decides what survives: the answer depends on the user's
 * capabilities, on `wp_kses_allowed_html` as every other plugin on the site has filtered it, and
 * on WordPress's own version. None of that is knowable in the browser.
 */
final class Module implements ModuleContract {

	/**
	 * REST namespace.
	 */
	const NAMESPACE_V1 = 'sobol-safe-save/v1';

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
		return 'rest';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		add_action(
			'rest_api_init',
			static function () {
				( new AnalyzeController() )->register_routes();
			}
		);
	}
}
