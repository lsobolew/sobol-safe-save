<?php
/**
 * Unit tests for the settings repository.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Sobolewski\SobolSafeSave\Core\Settings;
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

		Functions\when( 'sanitize_key' )->alias(
			static function ( $value ) {
				return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $value ) );
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
			array( 'post_types', 'check_title', 'check_excerpt', 'debounce_ms' ),
			array_keys( $clean )
		);
		$this->assertSame( array(), $clean['post_types'] );
		$this->assertTrue( $clean['check_title'] );
		$this->assertTrue( $clean['check_excerpt'] );
		$this->assertSame( 800, $clean['debounce_ms'] );
	}

	/**
	 * Keys outside the default set are dropped.
	 *
	 * The settings form posts a whole array, so without this a crafted form could write arbitrary
	 * keys into the option row.
	 */
	public function test_sanitize_drops_unknown_keys(): void {
		$clean = Settings::sanitize(
			array(
				'check_title'   => true,
				'evil_option'   => 'value',
				'administrator' => true,
			)
		);

		$this->assertArrayNotHasKey( 'evil_option', $clean );
		$this->assertArrayNotHasKey( 'administrator', $clean );
	}

	/**
	 * Post types are reduced to key-safe strings.
	 */
	public function test_sanitize_cleans_the_post_type_list(): void {
		$clean = Settings::sanitize(
			array( 'post_types' => array( 'post', 'My Page!', '', '<script>x</script>' ) )
		);

		$this->assertSame( array( 'post', 'mypage', 'scriptxscript' ), $clean['post_types'] );
	}

	/**
	 * A post type list that is not a list at all does not become one silently.
	 */
	public function test_sanitize_copes_with_a_scalar_post_type(): void {
		$this->assertSame( array( 'post' ), Settings::sanitize( array( 'post_types' => 'post' ) )['post_types'] );
	}

	/**
	 * Checkboxes come back from a form as strings.
	 */
	public function test_sanitize_reads_checkboxes_the_way_a_form_sends_them(): void {
		$this->assertTrue( Settings::sanitize( array( 'check_title' => '1' ) )['check_title'] );
		$this->assertFalse( Settings::sanitize( array( 'check_title' => '0' ) )['check_title'] );
	}

	/**
	 * A missing key keeps the default, which is why the form must not rely on omission.
	 *
	 * This is the behaviour that made an unticked checkbox impossible to save: a browser sends
	 * nothing for one, the key arrives missing, and a setting that defaults to on could never be
	 * turned off. The fix is a hidden input rendering an explicit 0 - and this test pins down the
	 * behaviour that makes the hidden input necessary, so nobody removes it as redundant markup.
	 */
	public function test_a_missing_key_keeps_the_default(): void {
		$this->assertTrue( Settings::sanitize( array() )['check_title'] );
	}

	/**
	 * Stored values win over the defaults.
	 */
	public function test_all_merges_stored_over_defaults(): void {
		Functions\when( 'get_option' )->justReturn( array( 'check_excerpt' => false ) );

		$all = Settings::all();

		$this->assertFalse( $all['check_excerpt'] );
		$this->assertTrue( $all['check_title'] );
	}

	/**
	 * The delay is clamped on the way out, whatever is in the database.
	 *
	 * The option can be written by WP-CLI, a migration or by hand, none of which go through the
	 * settings form. A stored zero would mean a request per keystroke.
	 */
	public function test_the_delay_is_clamped_on_read(): void {
		Functions\when( 'get_option' )->justReturn( array( 'debounce_ms' => 0 ) );
		$this->assertSame( 200, Settings::debounce_ms() );

		Functions\when( 'get_option' )->justReturn( array( 'debounce_ms' => 999999 ) );
		$this->assertSame( 5000, Settings::debounce_ms() );

		Functions\when( 'get_option' )->justReturn( array( 'debounce_ms' => 1200 ) );
		$this->assertSame( 1200, Settings::debounce_ms() );
	}
}
