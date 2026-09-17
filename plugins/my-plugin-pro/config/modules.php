<?php
/**
 * Pro add-on modules.
 *
 * They implement the same interface as the free plugin modules and land in the same registry.
 * This file is managed by `./bin/wpx feature add|remove --edition=pro`.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

defined( 'ABSPATH' ) || exit;

return array(
	MyVendor\MyPluginPro\Modules\Featured\Module::class,
);
