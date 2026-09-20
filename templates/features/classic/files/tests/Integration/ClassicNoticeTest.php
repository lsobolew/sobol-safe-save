<?php
/**
 * Telling a classic editor author what the save actually cost.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Settings;
use Sobolewski\SobolSafeSave\Modules\Classic\Module;
use WP_UnitTestCase;

/**
 * The classic editor's safety net.
 *
 * Everywhere else in this plugin the warning comes first; this is the one place that reports after
 * the fact, and it exists because the classic editor is a plain HTML form. Anything can post to
 * it: a metabox plugin submitting the form itself, a browser with JavaScript switched off, a
 * session that expired while somebody was writing. In all of those the warning script never ran,
 * and this is the only thing standing between the author and content that vanished in silence.
 *
 * It also has a property nothing else here has: it compares what the browser sent against what the
 * database actually holds, so it cannot be wrong about what happened.
 */
final class ClassicNoticeTest extends WP_UnitTestCase {

	/**
	 * Content an author cannot keep.
	 */
	private const RISKY = '<p>Keep this.</p><iframe src="https://x.test"></iframe>';

	/**
	 * The author doing the editing.
	 *
	 * @var int
	 */
	private $author;

	/**
	 * Becomes a filtered user.
	 */
	public function set_up(): void {
		parent::set_up();

		$this->author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $this->author );
	}

	/**
	 * Clears anything left in the request superglobal.
	 */
	public function tear_down(): void {
		unset( $_POST['content'], $_POST['post_title'], $_POST['excerpt'] );

		delete_option( Settings::OPTION );

		parent::tear_down();
	}

	/**
	 * A save that loses content leaves a report behind.
	 */
	public function test_a_lossy_save_is_recorded(): void {
		$post_id = $this->save( self::RISKY );

		$report = get_transient( Module::TRANSIENT . $this->author . '_' . $post_id );

		$this->assertIsArray( $report );
		$this->assertTrue( $report['changed'] );
	}

	/**
	 * A save that loses nothing leaves nothing behind.
	 */
	public function test_a_clean_save_records_nothing(): void {
		$post_id = $this->save( '<p>Perfectly ordinary.</p>' );

		$this->assertFalse( get_transient( Module::TRANSIENT . $this->author . '_' . $post_id ) );
	}

	/**
	 * What the report says matches what the database actually holds.
	 *
	 * The assertion that makes this a safety net rather than a second opinion.
	 */
	public function test_the_report_matches_what_was_stored(): void {
		$post_id = $this->save( self::RISKY );

		$stored = get_post( $post_id )->post_content;

		$this->assertStringNotContainsString( 'iframe', $stored, 'The iframe should not have survived.' );

		$report = get_transient( Module::TRANSIENT . $this->author . '_' . $post_id );

		// `fields` is cast to an object on the way out, so that an empty one serialises as {} for
		// the editor rather than as an empty JSON array.
		$fields = (array) $report['fields'];

		$this->assertSame( $stored, $fields['post_content']['after'] );
	}

	/**
	 * The notice names what was lost, and is shown only once.
	 */
	public function test_the_notice_is_shown_once(): void {
		$post_id = $this->save( self::RISKY );

		$this->go_to_the_editor( $post_id );

		ob_start();
		do_action( 'admin_notices' );
		$first = (string) ob_get_clean();

		$this->assertStringContainsString( 'Sobol Safe Save', $first );
		$this->assertStringContainsString( 'iframe', $first );

		ob_start();
		do_action( 'admin_notices' );
		$second = (string) ob_get_clean();

		$this->assertStringNotContainsString( 'Sobol Safe Save', $second, 'The notice should not nag.' );
	}

	/**
	 * One author is never shown another's losses.
	 *
	 * Two people editing the same post is ordinary on any site with an editorial workflow, and the
	 * report is about what *this* user's role cost them.
	 */
	public function test_reports_are_per_user(): void {
		$post_id = $this->save( self::RISKY );

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );

		$this->go_to_the_editor( $post_id );

		ob_start();
		do_action( 'admin_notices' );
		$output = (string) ob_get_clean();

		$this->assertStringNotContainsString( 'Sobol Safe Save', $output );
	}

	/**
	 * A post type the site does not check is left alone.
	 */
	public function test_an_unchecked_post_type_is_skipped(): void {
		Settings::update( array( 'post_types' => array( 'page' ) ) );

		$post_id = $this->save( self::RISKY );

		$this->assertFalse( get_transient( Module::TRANSIENT . $this->author . '_' . $post_id ) );
	}

	/**
	 * A save that did not come from the classic form is left alone.
	 *
	 * The block editor saves over REST, where the warning has already been shown before anything
	 * was sent; reporting it again afterwards would be telling somebody what they already declined
	 * to act on.
	 */
	public function test_a_save_without_the_form_is_ignored(): void {
		$post_id = self::factory()->post->create(
			array(
				'post_author'  => $this->author,
				'post_content' => self::RISKY,
			)
		);

		$this->assertFalse( get_transient( Module::TRANSIENT . $this->author . '_' . $post_id ) );
	}

	/**
	 * Saves a post the way the classic editor form does.
	 *
	 * @param string $content Content as the browser would send it.
	 *
	 * @return int The post id.
	 */
	private function save( string $content ): int {
		$post_id = self::factory()->post->create(
			array(
				'post_author' => $this->author,
				'post_title'  => 'Draft',
			)
		);

		// The classic editor posts slashed data, which is what wp_unslash() in the module undoes.
		$_POST['content'] = wp_slash( $content );

		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => wp_slash( $content ),
			)
		);

		return $post_id;
	}

	/**
	 * Puts the test on the screen the author is redirected to after saving.
	 *
	 * @param int $post_id Post being edited.
	 */
	private function go_to_the_editor( int $post_id ): void {
		global $post;

		// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- standing in for the admin screen, which is exactly what sets this global before admin_notices fires.
		$post = get_post( $post_id );

		setup_postdata( $post );
		set_current_screen( 'post' );
	}
}
