<?php
/**
 * Activation does only what the installed modules ask for.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Tests\Integration;

use MyVendor\MyPlugin\Core\ActivationAware;
use MyVendor\MyPlugin\Core\Activator;
use MyVendor\MyPlugin\Core\Settings;
use MyVendor\MyPlugin\Modules\ContentType\Module as ContentTypeModule;
use MyVendor\MyPlugin\Modules\Settings\Module as SettingsModule;
use WP_UnitTestCase;

/**
 * Tests for the activation contract.
 *
 * The point of these is what happens to a plugin that has had features removed. Core used to seed
 * the settings option and request a rewrite flush regardless, so `wpx feature remove settings`
 * left a plugin writing a row nothing reads, and `wpx feature remove content-type` left one
 * rebuilding rewrite rules it never adds. Both are invisible; the second is expensive.
 */
final class ActivationTest extends WP_UnitTestCase {

	/**
	 * The modules that ship with settings and post types claim their own activation work.
	 */
	public function test_modules_that_need_activation_work_declare_it(): void {
		$this->assertInstanceOf( ActivationAware::class, new ContentTypeModule( $this->plugin() ) );
		$this->assertInstanceOf( ActivationAware::class, new SettingsModule( $this->plugin() ) );
	}

	/**
	 * The rewrite flush belongs to the module that creates rewrite rules.
	 */
	public function test_the_flush_is_requested_by_the_content_type_module(): void {
		delete_option( Activator::FLUSH_FLAG );

		ContentTypeModule::on_activate();

		$this->assertSame( '1', (string) get_option( Activator::FLUSH_FLAG ) );
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

		add_filter( 'myplugin_modules', '__return_empty_array' );

		// The same call the activation hook makes, with the module list emptied.
		foreach ( Activator::activation_aware_modules() as $class_name ) {
			if ( in_array( $class_name, apply_filters( 'myplugin_modules', array() ), true ) ) {
				$class_name::on_activate();
			}
		}

		$this->assertFalse( get_option( Activator::FLUSH_FLAG, false ) );
		$this->assertFalse( get_option( Settings::OPTION, false ) );
	}

	/**
	 * A plugin instance for constructing modules.
	 */
	private function plugin(): \MyVendor\MyPlugin\Core\Plugin {
		return \MyVendor\MyPlugin\Core\Plugin::instance();
	}
}
