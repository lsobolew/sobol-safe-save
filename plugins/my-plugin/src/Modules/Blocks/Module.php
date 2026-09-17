<?php
/**
 * Module: editor blocks.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Modules\Blocks;

use MyVendor\MyPlugin\Core\Module as ModuleContract;
use MyVendor\MyPlugin\Core\Plugin;

defined( 'ABSPATH' ) || exit;

/**
 * Registers every block found in build/ (produced by Vite from the sources in blocks/).
 *
 * Nothing here names an individual block: adding one means adding a directory with a block.json,
 * not editing PHP. Dynamic blocks bring their own render.php, which WordPress picks up from the
 * metadata, so this module never grows render callbacks either.
 */
final class Module implements ModuleContract {

	/**
	 * Directory holding the built blocks, relative to the plugin root.
	 */
	const BUILD_DIR = 'build';

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
		return 'blocks';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		add_action( 'init', array( $this, 'register_blocks' ) );
	}

	/**
	 * Registers all built blocks from their block.json metadata.
	 */
	public function register_blocks(): void {
		foreach ( $this->block_directories() as $directory ) {
			register_block_type( $directory );
		}
	}

	/**
	 * Directories under build/ that contain a block.json.
	 *
	 * @return string[]
	 */
	public function block_directories(): array {
		$build = MY_PLUGIN_DIR . self::BUILD_DIR;

		// A missing build (fresh clone, module removed, `npm run build` never ran) must never take
		// the site down - the plugin simply registers no blocks.
		if ( ! is_dir( $build ) ) {
			return array();
		}

		$found = glob( $build . '/*/block.json' );

		if ( ! is_array( $found ) ) {
			return array();
		}

		return array_map( 'dirname', $found );
	}
}
