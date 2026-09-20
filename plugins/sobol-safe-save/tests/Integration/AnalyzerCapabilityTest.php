<?php
/**
 * Who Sobol Safe Save is for.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Analyzer;
use WP_UnitTestCase;

/**
 * Establishes exactly who WordPress filters, because getting this wrong is how the plugin ends up
 * either nagging administrators who lose nothing or staying silent for the people who do.
 *
 * The rule is one capability and nothing else: `unfiltered_html`. Role names are deliberately not
 * consulted anywhere in the plugin, because the same role means different things in different
 * installations - an Administrator is unfiltered on a single site and filtered on multisite.
 */
final class AnalyzerCapabilityTest extends WP_UnitTestCase {

	/**
	 * Content that is only left intact for a user who may post unfiltered HTML.
	 */
	private const RISKY = '<p>hi</p><iframe src="https://x.test"></iframe>';

	/**
	 * Authors and contributors are filtered, on every kind of installation.
	 *
	 * @dataProvider filtered_roles
	 *
	 * @param string $role Role to test.
	 */
	public function test_filtered_roles_are_warned( string $role ): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => $role ) ) );

		$report = ( new Analyzer() )->analyze( array( 'post_content' => self::RISKY ) );

		$this->assertTrue( $report->applies(), "A {$role} should be filtered." );
		$this->assertTrue( $report->changed(), "A {$role} should be warned about an iframe." );
	}

	/**
	 * Roles WordPress filters everywhere.
	 *
	 * @return array<string, array{0: string}>
	 */
	public static function filtered_roles(): array {
		return array(
			'author'      => array( 'author' ),
			'contributor' => array( 'contributor' ),
		);
	}

	/**
	 * An administrator is filtered on multisite and not on a single site.
	 *
	 * This is the case the plugin is most often wrong about elsewhere: on multisite only the super
	 * admin holds `unfiltered_html`, so a site's own administrator loses content exactly like an
	 * author does.
	 */
	public function test_administrators_depend_on_the_installation(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$report = ( new Analyzer() )->analyze( array( 'post_content' => self::RISKY ) );

		if ( is_multisite() ) {
			$this->assertTrue( $report->applies(), 'Site administrators are filtered on multisite.' );
			$this->assertTrue( $report->changed() );

			return;
		}

		$this->assertFalse( $report->applies(), 'Administrators are not filtered on a single site.' );
		$this->assertFalse( $report->changed() );
	}

	/**
	 * A report for an unfiltered user carries nothing else.
	 *
	 * The editor stops asking entirely once `applies` is false, so everything else has to be empty
	 * rather than stale.
	 */
	public function test_an_unfiltered_report_is_empty(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		if ( ! current_user_can( 'unfiltered_html' ) ) {
			$this->markTestSkipped( 'Administrators are filtered on multisite.' );
		}

		$payload = ( new Analyzer() )->analyze( array( 'post_content' => self::RISKY ) )->to_array();

		$this->assertFalse( $payload['applies'] );
		$this->assertFalse( $payload['changed'] );
		$this->assertSame( array(), (array) $payload['fields'] );
		$this->assertSame( array(), $payload['blocks'] );
	}

	/**
	 * DISALLOW_UNFILTERED_HTML filters everybody, including whoever would otherwise be exempt.
	 *
	 * Simulated through `map_meta_cap` rather than by defining the constant, because a constant
	 * cannot be undefined again and would leak into every test that runs after this one.
	 */
	public function test_disallowing_unfiltered_html_filters_everyone(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$deny = static function ( array $caps, string $cap ): array {
			return 'unfiltered_html' === $cap ? array( 'do_not_allow' ) : $caps;
		};

		add_filter( 'map_meta_cap', $deny, 10, 2 );

		/*
		 * Re-register the filters for the new answer. `wp_set_current_user()` will not do it here:
		 * it returns early when the id has not changed, so `set_current_user` never fires. Calling
		 * kses_init() is exactly what that hook does, and it is what really happens in production,
		 * where DISALLOW_UNFILTERED_HTML is a wp-config.php constant and is therefore already true
		 * the first time `init` runs.
		 */
		kses_init();

		$report = ( new Analyzer() )->analyze( array( 'post_content' => self::RISKY ) );

		remove_filter( 'map_meta_cap', $deny, 10 );

		$this->assertTrue( $report->applies() );
		$this->assertTrue( $report->changed() );
	}

	/**
	 * The as_user() helper analyses somebody else's content and puts the current user back.
	 */
	public function test_as_user_switches_and_restores(): void {
		$admin  = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $admin );

		$analyzer = new Analyzer();

		$report = $analyzer->as_user(
			$author,
			static function () use ( $analyzer ) {
				return $analyzer->analyze( array( 'post_content' => self::RISKY ) );
			}
		);

		$this->assertTrue( $report->applies(), 'Inside as_user() the author is the current user.' );
		$this->assertTrue( $report->changed() );
		$this->assertSame( $admin, get_current_user_id(), 'The previous user must be restored.' );
	}
}
