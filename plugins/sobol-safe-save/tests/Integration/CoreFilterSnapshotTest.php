<?php
/**
 * Canary: notices when WordPress changes what happens on save.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use WP_UnitTestCase;

/**
 * Watches the filters WordPress runs on the save path.
 *
 * {@see \Sobolewski\SobolSafeSave\Core\Analyzer} does not need this test: it replicates
 * `sanitize_post( $postarr, 'db' )` and therefore picks up new core filters on its own. What it
 * cannot do on its own is *explain* them. {@see \Sobolewski\SobolSafeSave\Core\Differ} turns a
 * before/after pair into "the iframe was removed"; a filter nobody anticipated falls through to
 * "something changed", which is a poor thing to show somebody who is about to lose work.
 *
 * So this fails loudly when the list changes, as a prompt to decide whether the new filter needs
 * its own explanation - rather than shipping an unexplained diff and finding out from a review.
 *
 * That this matters is not hypothetical: `wp_strip_custom_css_from_blocks` joined at priority 8 in
 * WordPress 7.0 and is absent from the 6.8 the matrix still tests.
 */
final class CoreFilterSnapshotTest extends WP_UnitTestCase {

	/**
	 * Callbacks Sobol Safe Save knows about, per hook.
	 *
	 * An allow-list rather than an exact snapshot: the set legitimately differs between the
	 * WordPress versions in the matrix, and pinning it per version would mean editing this file
	 * on every release whether or not anything meaningful changed.
	 *
	 * @var array<string, string[]>
	 */
	private const KNOWN = array(
		'content_save_pre' => array(
			'wp_strip_custom_css_from_blocks',
			'wp_filter_global_styles_post',
			'convert_invalid_entities',
			'wp_filter_post_kses',
			'balanceTags',
		),
		'title_save_pre'   => array(
			'trim',
			'wp_filter_kses',
		),
		'excerpt_save_pre' => array(
			'convert_invalid_entities',
			'wp_filter_post_kses',
			'balanceTags',
		),
	);

	/**
	 * Callbacks that must be present, or this plugin has nothing to warn about.
	 *
	 * @var array<string, string>
	 */
	private const REQUIRED = array(
		'content_save_pre' => 'wp_filter_post_kses',
		'title_save_pre'   => 'wp_filter_kses',
		'excerpt_save_pre' => 'wp_filter_post_kses',
	);

	/**
	 * Becomes a filtered user before every test, because that is when kses_init() registers.
	 */
	public function set_up(): void {
		parent::set_up();

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$this->assertFalse( current_user_can( 'unfiltered_html' ) );
	}

	/**
	 * Every callback on the save path is one Sobol Safe Save can explain.
	 */
	public function test_no_unknown_filters_run_on_save(): void {
		foreach ( self::KNOWN as $hook => $known ) {
			$unknown = array_diff( $this->callbacks( $hook ), $known );

			$this->assertSame(
				array(),
				array_values( $unknown ),
				"WordPress now runs a callback on {$hook} that Sobol Safe Save does not know about. " .
				'Decide whether Differ needs to explain it, then add it to the allow-list.'
			);
		}
	}

	/**
	 * The filters this plugin exists to warn about are actually in place.
	 *
	 * Without this, an environment that quietly stopped filtering would make the suite green and
	 * the plugin pointless at the same time.
	 */
	public function test_the_filters_that_matter_are_registered(): void {
		foreach ( self::REQUIRED as $hook => $callback ) {
			$this->assertContains( $callback, $this->callbacks( $hook ), "{$hook} is not filtered." );
		}
	}

	/**
	 * Names of the callbacks registered on a hook.
	 *
	 * @param string $hook Hook name.
	 *
	 * @return string[]
	 */
	private function callbacks( string $hook ): array {
		if ( empty( $GLOBALS['wp_filter'][ $hook ] ) ) {
			return array();
		}

		$names = array();

		foreach ( $GLOBALS['wp_filter'][ $hook ]->callbacks as $callbacks ) {
			foreach ( $callbacks as $callback ) {
				$function = $callback['function'];

				$names[] = is_string( $function ) ? $function : '(closure or object)';
			}
		}

		return $names;
	}
}
