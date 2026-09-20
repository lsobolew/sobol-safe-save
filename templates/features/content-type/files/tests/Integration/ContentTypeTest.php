<?php
/**
 * Integration tests for the post type and its meta field.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Plugin;
use Sobolewski\SobolSafeSave\Modules\ContentType\Module as ContentType;
use WP_UnitTestCase;

/**
 * Registration of the post type, the taxonomy and the permission-aware meta field.
 */
final class ContentTypeTest extends WP_UnitTestCase {

	/**
	 * The core test package calls `unregister_all_meta_keys()` before every test, so meta fields
	 * registered on `init` disappear. Post types survive, meta does not - hence the re-registration
	 * here instead of relying on the plugin boot.
	 */
	public function set_up(): void {
		parent::set_up();

		$module = Plugin::instance()->module( 'content-type' );

		if ( $module instanceof ContentType ) {
			$module->register_meta();
		}
	}

	/**
	 * The post type is registered and exposed to REST.
	 */
	public function test_post_type_is_registered_and_rest_enabled(): void {
		$this->assertTrue( post_type_exists( ContentType::POST_TYPE ) );

		$object = get_post_type_object( ContentType::POST_TYPE );

		$this->assertNotNull( $object );
		$this->assertTrue( $object->show_in_rest );
		$this->assertTrue( $object->public );
	}

	/**
	 * The taxonomy is attached to the post type.
	 */
	public function test_taxonomy_is_attached_to_post_type(): void {
		$this->assertTrue( taxonomy_exists( ContentType::TAXONOMY ) );
		$this->assertContains(
			ContentType::TAXONOMY,
			get_object_taxonomies( ContentType::POST_TYPE )
		);
	}

	/**
	 * The meta field is registered and sanitized on save.
	 */
	public function test_priority_meta_is_registered_and_sanitized(): void {
		$registered = get_registered_meta_keys( 'post', ContentType::POST_TYPE );

		$this->assertArrayHasKey( ContentType::META_PRIORITY, $registered );

		$post_id = self::factory()->post->create( array( 'post_type' => ContentType::POST_TYPE ) );
		update_post_meta( $post_id, ContentType::META_PRIORITY, '42abc' );

		// The sanitize_callback (absint) strips the junk on write, but metadata always comes back
		// from the database as a string - the registered type only casts in the REST layer.
		$this->assertSame( '42', get_post_meta( $post_id, ContentType::META_PRIORITY, true ) );
	}

	/**
	 * A user without edit rights on the post cannot write the meta field.
	 */
	public function test_meta_auth_callback_blocks_users_without_edit_rights(): void {
		$post_id    = self::factory()->post->create( array( 'post_type' => ContentType::POST_TYPE ) );
		$subscriber = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		$editor     = self::factory()->user->create( array( 'role' => 'editor' ) );

		wp_set_current_user( $subscriber );
		$this->assertFalse(
			current_user_can( 'edit_post_meta', $post_id, ContentType::META_PRIORITY )
		);

		wp_set_current_user( $editor );
		$this->assertTrue(
			current_user_can( 'edit_post_meta', $post_id, ContentType::META_PRIORITY )
		);
	}
}
