<?php
/**
 * Modules loaded by the plugin.
 *
 * Order only matters when a module assumes another one is present (here the blocks and REST
 * modules use constants from the content-type module, but they also work without it).
 *
 * This file is managed by `./bin/wpx feature add|remove`.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

defined( 'ABSPATH' ) || exit;

return array(
	MyVendor\MyPlugin\Modules\Blocks\Module::class,
	MyVendor\MyPlugin\Modules\Settings\Module::class,
	MyVendor\MyPlugin\Modules\ContentType\Module::class,
	MyVendor\MyPlugin\Modules\Rest\Module::class,
	MyVendor\MyPlugin\Modules\Cli\Module::class,
);
