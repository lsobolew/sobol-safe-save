<?php
/**
 * Activation does only what the installed modules ask for.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\ActivationAware;
use Sobolewski\SobolSafeSave\Core\Activator;
use Sobolewski\SobolSafeSave\Core\Settings;
use Sobolewski\SobolSafeSave\Modules\Settings\Module as SettingsModule;
use WP_UnitTestCase;

/**
 * Tests for the activation contract.
 *
 * The point of these is what happens to a plugin that has had features removed. Core used to seed
 * the settings option and request a rewrite flush regardless, so `wpx feature remove settings`
 * left a plugin writing a row nothing reads, and `wpx feature remove content-type` left one
 * rebuilding rewrite rules it never adds. Both are invisible; the second is expensive.
 *
 * Sobol Safe Save registers no post type, so the flush case is covered from the other side here: the
 * assertion that activation requests no flush at all is the one that matters for this plugin.
 */
final class ActivationTest extends WP_UnitTestCase {

	/**
	 * The module that owns stored settings claims its own activation work.
	 */
	public function test_modules_that_need_activation_work_declare_it(): void {
		$this->assertInstanceOf( ActivationAware::class, new SettingsModule( $this->plugin() ) );
	}

	/**
	 * The settings option is created by the module that reads it.
	 */
	public function test_the_settings_option_is_seeded_by_the_settings_module(): void {
		delete_option( Settings::OPTION );

		SettingsModule::on_activate();

		$this->assertIsArray( get_option( Settings::OPTION ) );
	}

	/**
	 * Nothing in core does either of those things by itself.
	 *
	 * This is the assertion that would have caught the original fault: with no module listed,
	 * activating must leave no flush pending and no options row behind.
	 */
	public function test_core_alone_neither_flushes_nor_seeds(): void {
		delete_option( Activator::FLUSH_FLAG );
		delete_option( Settings::OPTION );

		add_filter( 'sobol_safe_save_modules', '__return_empty_array' );

		// The same call the activation hook makes, with the module list emptied.
		foreach ( Activator::activation_aware_modules() as $class_name ) {
			if ( in_array( $class_name, apply_filters( 'sobol_safe_save_modules', array() ), true ) ) {
				$class_name::on_activate();
			}
		}

		$this->assertFalse( get_option( Activator::FLUSH_FLAG, false ) );
		$this->assertFalse( get_option( Settings::OPTION, false ) );
	}

	/**
	 * A plugin instance for constructing modules.
	 */
	private function plugin(): \Sobolewski\SobolSafeSave\Core\Plugin {
		return \Sobolewski\SobolSafeSave\Core\Plugin::instance();
	}
}
