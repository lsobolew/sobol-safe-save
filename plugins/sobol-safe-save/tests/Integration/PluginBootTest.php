<?php
/**
 * Integration tests for the plugin boot sequence.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Api;
use Sobolewski\SobolSafeSave\Core\Module;
use Sobolewski\SobolSafeSave\Core\Plugin;
use WP_UnitTestCase;

/**
 * Verifies that the module registry works and that the extension points are available to add-ons.
 */
final class PluginBootTest extends WP_UnitTestCase {

	/**
	 * Modules from config/modules.php are registered.
	 */
	public function test_configured_modules_are_registered(): void {
		$ids = array_keys( Plugin::instance()->modules() );

		$this->assertContains( 'editor', $ids );
		$this->assertContains( 'rest', $ids );
		$this->assertContains( 'settings', $ids );
	}

	/**
	 * Every registered module honours the contract.
	 */
	public function test_modules_implement_contract(): void {
		foreach ( Plugin::instance()->modules() as $id => $module ) {
			$this->assertInstanceOf( Module::class, $module, "Module {$id}" );
			$this->assertSame( $id, $module->id() );
		}
	}

	/**
	 * A third-party module can join through the registration action.
	 */
	public function test_third_party_module_can_be_added(): void {
		$module = new class() implements Module {
			/**
			 * Whether register() has been called.
			 *
			 * @var bool
			 */
			public $registered = false;

			/**
			 * Module identifier.
			 */
			public function id(): string {
				return 'test-addon';
			}

			/**
			 * Registers the hooks.
			 */
			public function register(): void {
				$this->registered = true;
			}
		};

		Plugin::instance()->add_module( $module );

		$this->assertTrue( $module->registered );
		$this->assertSame( $module, Plugin::instance()->module( 'test-addon' ) );
	}

	/**
	 * The API version is valid semver.
	 */
	public function test_api_version_is_semver(): void {
		$this->assertMatchesRegularExpression( '/^\d+\.\d+\.\d+$/', Api::version() );
	}
}
