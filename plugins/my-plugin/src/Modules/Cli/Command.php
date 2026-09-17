<?php
/**
 * WP-CLI commands for the plugin.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Modules\Cli;

use MyVendor\MyPlugin\Core\Api;
use MyVendor\MyPlugin\Core\Plugin;
use MyVendor\MyPlugin\Core\Settings;
use MyVendor\MyPlugin\Modules\ContentType\Module as ContentType;
use WP_CLI;
use WP_CLI\Utils;

defined( 'ABSPATH' ) || exit;

/**
 * Manage the plugin from the command line.
 */
final class Command {

	/**
	 * Shows the plugin state: version, extension API and active modules.
	 *
	 * ## OPTIONS
	 *
	 * [--format=<format>]
	 * : Output format.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     wp my-plugin info
	 *     wp my-plugin info --format=json
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Named arguments.
	 */
	public function info( $args, $assoc_args ): void {
		$plugin = Plugin::instance();

		$rows = array(
			array(
				'key'   => 'version',
				'value' => $plugin->version(),
			),
			array(
				'key'   => 'api_version',
				'value' => Api::version(),
			),
			array(
				'key'   => 'modules',
				'value' => implode( ', ', array_keys( $plugin->modules() ) ),
			),
			array(
				'key'   => 'enabled',
				'value' => Settings::get( 'enabled' ) ? 'yes' : 'no',
			),
		);

		Utils\format_items(
			(string) ( $assoc_args['format'] ?? 'table' ),
			$rows,
			array( 'key', 'value' )
		);
	}

	/**
	 * Creates sample items - handy for tests and demos.
	 *
	 * ## OPTIONS
	 *
	 * [--count=<count>]
	 * : How many items to create.
	 * ---
	 * default: 5
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     wp my-plugin seed --count=20
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Named arguments.
	 */
	public function seed( $args, $assoc_args ): void {
		if ( ! post_type_exists( ContentType::POST_TYPE ) ) {
			WP_CLI::error( 'The content-type module is disabled - there is nothing to create.' );
		}

		$count   = max( 1, (int) ( $assoc_args['count'] ?? 5 ) );
		$created = 0;

		for ( $i = 1; $i <= $count; $i++ ) {
			$post_id = wp_insert_post(
				array(
					'post_type'    => ContentType::POST_TYPE,
					'post_status'  => 'publish',
					'post_title'   => sprintf( 'Item %d', $i ),
					'post_content' => sprintf( 'Content of sample item %d.', $i ),
					'post_excerpt' => sprintf( 'Excerpt of item %d.', $i ),
				),
				true
			);

			if ( is_wp_error( $post_id ) ) {
				WP_CLI::warning( $post_id->get_error_message() );
				continue;
			}

			update_post_meta( $post_id, ContentType::META_PRIORITY, $i );
			++$created;
		}

		WP_CLI::success( sprintf( 'Created %d items.', $created ) );
	}
}
