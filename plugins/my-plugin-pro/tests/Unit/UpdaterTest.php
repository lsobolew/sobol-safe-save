<?php
/**
 * Unit tests for the update mechanism.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\Tests\Unit;

use Brain\Monkey;
use Mockery;
use MyVendor\MyPluginPro\License\LicenseManager;
use MyVendor\MyPluginPro\License\Provider;
use MyVendor\MyPluginPro\License\Updater;
use PHPUnit\Framework\TestCase;

/**
 * Updater decides what WordPress offers a customer as an update - a bug here means missing
 * updates at best, and replacing somebody else's plugin at worst.
 */
final class UpdaterTest extends TestCase {

	/**
	 * Sets the test up.
	 */
	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	/**
	 * Tears the test down.
	 */
	protected function tearDown(): void {
		Mockery::close();
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Builds an Updater with a stubbed licence manager.
	 *
	 * @param bool                 $valid   Whether the licence is valid.
	 * @param array<string, mixed> $release Release data returned by the provider.
	 */
	private function updater( bool $valid, array $release = array() ): Updater {
		$provider = Mockery::mock( Provider::class );
		$provider->shouldReceive( 'latest_release' )->andReturn( $release );

		$license = Mockery::mock( LicenseManager::class );
		$license->shouldReceive( 'is_valid' )->andReturn( $valid );
		$license->shouldReceive( 'key' )->andReturn( 'KEY' );
		$license->shouldReceive( 'site_url' )->andReturn( 'https://example.test' );
		$license->shouldReceive( 'provider' )->andReturn( $provider );

		return new Updater( $license );
	}

	/**
	 * The filter leaves other plugins alone.
	 */
	public function test_ignores_other_plugins(): void {
		$updater = $this->updater(
			true,
			array(
				'version' => '9.9.9',
				'package' => 'https://x/y.zip',
			)
		);

		$this->assertFalse(
			$updater->check_for_update( false, array(), 'another-plugin/another-plugin.php' )
		);
	}

	/**
	 * No update is offered without a valid licence.
	 */
	public function test_no_update_without_valid_license(): void {
		$updater = $this->updater(
			false,
			array(
				'version' => '9.9.9',
				'package' => 'https://x/y.zip',
			)
		);

		$this->assertFalse(
			$updater->check_for_update( false, array(), MY_PLUGIN_PRO_BASENAME )
		);
	}

	/**
	 * The same or an older version is not an update.
	 */
	public function test_no_update_when_version_not_newer(): void {
		$updater = $this->updater(
			true,
			array(
				'version' => MY_PLUGIN_PRO_VERSION,
				'package' => 'https://x/y.zip',
			)
		);

		$this->assertFalse(
			$updater->check_for_update( false, array(), MY_PLUGIN_PRO_BASENAME )
		);
	}

	/**
	 * An incomplete server response never produces an update without a package URL.
	 */
	public function test_no_update_without_package_url(): void {
		$updater = $this->updater( true, array( 'version' => '9.9.9' ) );

		$this->assertFalse(
			$updater->check_for_update( false, array(), MY_PLUGIN_PRO_BASENAME )
		);
	}

	/**
	 * A newer version with a package yields correct update data.
	 */
	public function test_returns_update_for_newer_version(): void {
		$updater = $this->updater(
			true,
			array(
				'version'  => '9.9.9',
				'package'  => 'https://example.com/my-plugin-pro-9.9.9.zip',
				'requires' => '6.6',
				'tested'   => '7.1',
			)
		);

		$update = $updater->check_for_update( false, array(), MY_PLUGIN_PRO_BASENAME );

		$this->assertIsArray( $update );
		$this->assertSame( '9.9.9', $update['version'] );
		$this->assertSame( 'https://example.com/my-plugin-pro-9.9.9.zip', $update['package'] );
		$this->assertSame( 'my-plugin-pro', $update['slug'] );
	}
}
