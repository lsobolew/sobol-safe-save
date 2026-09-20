<?php
/**
 * Contract for a module with work to do at activation or deactivation.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Lets a module claim its own activation side effects.
 *
 * Without this the core had to know what every feature needed: it seeded the settings option and
 * asked for a rewrite flush whether or not the plugin had settings or post types. Remove those
 * features with `wpx feature remove` and the core kept doing both - seeding a row nothing reads,
 * and rebuilding the rewrite rules for a plugin that registers none. Neither is visible, and the
 * second is expensive.
 *
 * So each module declares its own. Core calls whatever is listed in config/modules.php and knows
 * nothing about what any of it does; removing the feature removes its activation work with it.
 *
 * The methods are static because activation runs before any module is instantiated - WordPress
 * calls the activation hook on a request where the plugin has only just been loaded.
 */
interface ActivationAware {

	/**
	 * Runs once when the plugin is activated, for each site on a network activation.
	 */
	public static function on_activate(): void;

	/**
	 * Runs once when the plugin is deactivated.
	 */
	public static function on_deactivate(): void;
}
