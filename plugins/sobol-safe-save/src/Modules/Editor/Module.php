<?php
/**
 * Module: the block editor.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Modules\Editor;

use Sobolewski\SobolSafeSave\Core\Analyzer;
use Sobolewski\SobolSafeSave\Core\Assets;
use Sobolewski\SobolSafeSave\Core\Module as ModuleContract;
use Sobolewski\SobolSafeSave\Core\Plugin;
use Sobolewski\SobolSafeSave\Core\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Puts the warning in the block editor.
 *
 * The script is only loaded where it has something to do. Somebody who may post unfiltered HTML
 * loses nothing on save, so loading a script whose only job is to report losses would be pure
 * overhead on every page load - and on a single site that is every administrator.
 */
final class Module implements ModuleContract {

	/**
	 * Script handle. An add-on enqueueing its own editor script depends on this one.
	 */
	const HANDLE = 'sobol-safe-save-editor';

	/**
	 * Built script, relative to the plugin directory.
	 */
	const SCRIPT = 'build/editor/index.js';

	/**
	 * Built stylesheet, relative to the plugin directory.
	 */
	const STYLE = 'build/editor/index.css';

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
		return 'editor';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue' ) );
	}

	/**
	 * Loads the editor script, where it applies.
	 */
	public function enqueue(): void {
		if ( ! $this->should_load() ) {
			return;
		}

		$assets = $this->assets();

		// The build directory is generated and not committed, so a checkout that has not been
		// built has no script to enqueue. Failing quietly beats a 404 in everyone's console.
		if ( ! $assets->exists( self::SCRIPT ) ) {
			return;
		}

		$meta = $assets->meta( 'editor/index' );

		wp_enqueue_script(
			self::HANDLE,
			$assets->url( self::SCRIPT ),
			$meta['dependencies'],
			$meta['version'],
			true
		);

		// Block metadata would wire this up on its own, but this plugin registers no block, so
		// the JavaScript translations have to be asked for explicitly.
		wp_set_script_translations( self::HANDLE, 'sobol-safe-save', SOBOL_SAFE_SAVE_DIR . 'languages' );

		if ( $assets->exists( self::STYLE ) ) {
			// Depends on wp-components so it loads after the editor's own styles, which is what
			// lets a plain selector here win against them without resorting to !important.
			wp_enqueue_style(
				self::HANDLE,
				$assets->url( self::STYLE ),
				array( 'wp-components' ),
				$meta['version']
			);
		}

		wp_add_inline_script(
			self::HANDLE,
			'window.sobolSafeSave = window.sobolSafeSave || {}; window.sobolSafeSave.settings = '
				. wp_json_encode( array( 'debounceMs' => Settings::debounce_ms() ) ) . ';',
			'before'
		);
	}

	/**
	 * Whether this screen and this user need the script at all.
	 */
	private function should_load(): bool {
		if ( ! Analyzer::applies() ) {
			return false;
		}

		$screen = get_current_screen();

		// `enqueue_block_editor_assets` also fires for the site editor and the widgets screen.
		// Both edit content that WordPress filters, but neither has the document sidebar this
		// plugin hangs its panel on, so version 1.0 stays with the post editor.
		if ( ! $screen || 'post' !== $screen->base ) {
			return false;
		}

		return Settings::checks( (string) $screen->post_type );
	}

	/**
	 * Asset helper from the container.
	 */
	private function assets(): Assets {
		$assets = $this->plugin->container()->get( 'assets' );

		return $assets instanceof Assets ? $assets : new Assets();
	}
}
