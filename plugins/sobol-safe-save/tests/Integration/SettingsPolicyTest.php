<?php
/**
 * The site's settings decide what gets checked, and the server enforces them.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Settings;
use WP_REST_Request;
use WP_UnitTestCase;

/**
 * Settings are a site policy, so they are applied where the answer is produced rather than where
 * it is displayed. A policy that only holds while the browser cooperates is not a policy.
 */
final class SettingsPolicyTest extends WP_UnitTestCase {

	/**
	 * The route under test.
	 */
	private const ROUTE = '/sobol-safe-save/v1/analyze';

	/**
	 * Registers the routes and becomes a filtered user.
	 */
	public function set_up(): void {
		parent::set_up();

		global $wp_rest_server;

		$wp_rest_server = new \WP_REST_Server();

		do_action( 'rest_api_init', $wp_rest_server );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
	}

	/**
	 * Restores the defaults.
	 */
	public function tear_down(): void {
		delete_option( Settings::OPTION );

		parent::tear_down();
	}

	/**
	 * With nothing ticked, every post type that has an editor is checked.
	 *
	 * The default is "all" rather than a snapshot taken at activation, so a post type registered
	 * by a theme next month is covered without anybody revisiting this screen.
	 */
	public function test_an_empty_list_means_every_editable_post_type(): void {
		register_post_type(
			'lab_thing',
			array(
				'public'   => true,
				'show_ui'  => true,
				'supports' => array( 'editor' ),
			)
		);

		$this->assertContains( 'post', Settings::checked_post_types() );
		$this->assertContains( 'page', Settings::checked_post_types() );
		$this->assertContains( 'lab_thing', Settings::checked_post_types() );

		unregister_post_type( 'lab_thing' );
	}

	/**
	 * A post type with no editor is never offered, because it has no content to filter.
	 */
	public function test_a_post_type_without_an_editor_is_not_offered(): void {
		register_post_type(
			'lab_meta_only',
			array(
				'public'   => true,
				'show_ui'  => true,
				'supports' => array( 'title' ),
			)
		);

		$this->assertNotContains( 'lab_meta_only', Settings::available_post_types() );

		unregister_post_type( 'lab_meta_only' );
	}

	/**
	 * A post type that no longer exists is dropped from a stored list.
	 */
	public function test_a_deregistered_post_type_is_dropped(): void {
		Settings::update( array( 'post_types' => array( 'post', 'gone_away' ) ) );

		$this->assertSame( array( 'post' ), Settings::checked_post_types() );
	}

	/**
	 * An unchecked post type is answered like a user who is never filtered.
	 */
	public function test_an_unchecked_post_type_is_not_analysed(): void {
		Settings::update( array( 'post_types' => array( 'page' ) ) );

		$body = $this->analyze(
			array(
				'post_type' => 'post',
				'content'   => '<iframe src="https://x.test"></iframe>',
			)
		);

		$this->assertFalse( $body['applies'] );
		$this->assertFalse( $body['changed'] );
	}

	/**
	 * Switching the title check off means the title is not reported, even if the editor sends it.
	 */
	public function test_the_title_check_can_be_switched_off(): void {
		$risky = array(
			'title'   => 'A <span>title</span>',
			'content' => '<p>clean</p>',
		);

		$on = $this->analyze( $risky );

		$this->assertArrayHasKey( 'post_title', (array) $on['fields'] );

		Settings::update( array( 'check_title' => false ) );

		$off = $this->analyze( $risky );

		$this->assertFalse( $off['changed'] );
		$this->assertArrayNotHasKey( 'post_title', (array) $off['fields'] );
	}

	/**
	 * The same for the excerpt.
	 */
	public function test_the_excerpt_check_can_be_switched_off(): void {
		$risky = array(
			'excerpt' => 'see <a href="https://x.test" onclick="x()">this</a>',
			'content' => '<p>clean</p>',
		);

		$this->assertArrayHasKey( 'post_excerpt', (array) $this->analyze( $risky )['fields'] );

		Settings::update( array( 'check_excerpt' => false ) );

		$this->assertFalse( $this->analyze( $risky )['changed'] );
	}

	/**
	 * The content is checked whatever the settings say.
	 *
	 * Title and excerpt are opt-out; the content is the whole point of the plugin.
	 */
	public function test_the_content_is_always_checked(): void {
		Settings::update(
			array(
				'check_title'   => false,
				'check_excerpt' => false,
			)
		);

		$body = $this->analyze( array( 'content' => '<iframe src="https://x.test"></iframe>' ) );

		$this->assertTrue( $body['changed'] );
		$this->assertArrayHasKey( 'post_content', (array) $body['fields'] );
	}

	/**
	 * Sends a request to the route and returns the body.
	 *
	 * @param array<string, mixed> $params Request parameters.
	 *
	 * @return array<string, mixed>
	 */
	private function analyze( array $params ): array {
		$request = new WP_REST_Request( 'POST', self::ROUTE );

		foreach ( $params as $name => $value ) {
			$request->set_param( $name, $value );
		}

		return (array) rest_get_server()->dispatch( $request )->get_data();
	}
}
