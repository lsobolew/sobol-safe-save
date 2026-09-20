<?php
/**
 * Modules loaded by the plugin.
 *
 * Order only matters when a module assumes another one is present (here the blocks and REST
 * modules use constants from the content-type module, but they also work without it).
 *
 * This file is managed by `./bin/wpx feature add|remove`.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

defined( 'ABSPATH' ) || exit;

return array(
	Sobolewski\SobolSafeSave\Modules\Editor\Module::class,
	Sobolewski\SobolSafeSave\Modules\Rest\Module::class,
	Sobolewski\SobolSafeSave\Modules\Settings\Module::class,
);
