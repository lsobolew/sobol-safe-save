<?php
/**
 * Unit tests for the settings repository.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Functions;
use MyVendor\MyPlugin\Core\Settings;
use PHPUnit\Framework\TestCase;

/**
 * Sanitization decides what may reach the database at all, which is why it gets its own suite.
 */
final class SettingsTest extends TestCase {

	/**
	 * Sets up the WordPress function stubs.
	 */
	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		Functions\when( 'sanitize_text_field' )->alias(
			static function ( $value ) {
				return trim( (string) preg_replace( '/<[^>]*>/', '', (string) $value ) );
			}
		);
	}

	/**
	 * Tears the stubs down.
	 */
	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Missing keys fall back to the defaults.
	 */
	public function test_sanitize_fills_missing_keys_with_defaults(): void {
		$clean = Settings::sanitize( array() );

		$this->assertSame(
			array( 'enabled', 'items_per_page', 'api_label' ),
			array_keys( $clean )
		);
		$this->assertTrue( $clean['enabled'] );
		$this->assertSame( 10, $clean['items_per_page'] );
	}

	/**
	 * Keys outside the default set are dropped.
	 */
	public function test_sanitize_drops_unknown_keys(): void {
		$clean = Settings::sanitize(
			array(
				'api_label'     => 'ok',
				'evil_option'   => 'value',
				'administrator' => true,
			)
		);

		$this->assertArrayNotHasKey( 'evil_option', $clean );
		$this->assertArrayNotHasKey( 'administrator', $clean );
	}

	/**
	 * HTML tags are stripped from text fields.
	 */
	public function test_sanitize_strips_html_from_text_fields(): void {
		$clean = Settings::sanitize( array( 'api_label' => '<script>alert(1)</script>label' ) );

		$this->assertSame( 'alert(1)label', $clean['api_label'] );
	}

	/**
	 * The item count never drops below one.
	 */
	public function test_sanitize_clamps_items_per_page(): void {
		$this->assertSame( 1, Settings::sanitize( array( 'items_per_page' => 0 ) )['items_per_page'] );
		$this->assertSame( 1, Settings::sanitize( array( 'items_per_page' => -5 ) )['items_per_page'] );
		$this->assertSame( 25, Settings::sanitize( array( 'items_per_page' => '25' ) )['items_per_page'] );
	}

	/**
	 * Stored values win over the defaults.
	 */
	public function test_all_merges_stored_over_defaults(): void {
		Functions\when( 'get_option' )->justReturn( array( 'api_label' => 'from database' ) );

		$all = Settings::all();

		$this->assertSame( 'from database', $all['api_label'] );
		$this->assertSame( 10, $all['items_per_page'] );
	}
}
