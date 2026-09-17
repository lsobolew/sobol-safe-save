<?php
/**
 * REST controller for the plugin items.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Modules\Rest;

use MyVendor\MyPlugin\Core\Settings;
use MyVendor\MyPlugin\Modules\ContentType\Module as ContentType;
use WP_Error;
use WP_Post;
use WP_Query;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * The /my-plugin/v1/items endpoints.
 */
final class ItemsController extends WP_REST_Controller {

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->namespace = Module::NAMESPACE_V1;
		$this->rest_base = 'items';
	}

	/**
	 * Registers the routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_items' ),
					// permission_callback is MANDATORY - omitting it is flagged by Plugin Check
					// and makes the route effectively public.
					'permission_callback' => array( $this, 'get_items_permissions_check' ),
					'args'                => $this->get_collection_params(),
				),
				'schema' => array( $this, 'get_public_item_schema' ),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<id>[\d]+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_item' ),
					'permission_callback' => array( $this, 'get_item_permissions_check' ),
					'args'                => array(
						'id' => array(
							'description' => __( 'Item identifier.', 'my-plugin' ),
							'type'        => 'integer',
							'required'    => true,
						),
					),
				),
				'schema' => array( $this, 'get_public_item_schema' ),
			)
		);
	}

	/**
	 * Who may read the collection.
	 *
	 * @param WP_REST_Request $request Request object.
	 *
	 * @return bool|WP_Error
	 */
	public function get_items_permissions_check( $request ) {
		if ( ! current_user_can( 'read' ) ) {
			return new WP_Error(
				'my_plugin_rest_forbidden',
				__( 'You are not allowed to read items.', 'my-plugin' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * Who may read a single item.
	 *
	 * @param WP_REST_Request $request Request object.
	 *
	 * @return bool|WP_Error
	 */
	public function get_item_permissions_check( $request ) {
		return $this->get_items_permissions_check( $request );
	}

	/**
	 * Returns a list of items.
	 *
	 * @param WP_REST_Request $request Request object.
	 *
	 * @return WP_REST_Response
	 */
	public function get_items( $request ) {
		$per_page = (int) $request->get_param( 'per_page' );

		if ( $per_page <= 0 ) {
			$per_page = (int) Settings::get( 'items_per_page', 10 );
		}

		$query = new WP_Query(
			array(
				'post_type'      => ContentType::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => $per_page,
				'paged'          => max( 1, (int) $request->get_param( 'page' ) ),
			)
		);

		$items = array();

		foreach ( $query->posts as $post ) {
			$items[] = $this->prepare_response_for_collection(
				$this->prepare_item_for_response( $post, $request )
			);
		}

		$response = rest_ensure_response( $items );
		$response->header( 'X-WP-Total', (string) $query->found_posts );
		$response->header( 'X-WP-TotalPages', (string) $query->max_num_pages );

		return $response;
	}

	/**
	 * Returns a single item.
	 *
	 * @param WP_REST_Request $request Request object.
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_item( $request ) {
		$post = get_post( (int) $request->get_param( 'id' ) );

		if ( ! $post instanceof WP_Post || ContentType::POST_TYPE !== $post->post_type ) {
			return new WP_Error(
				'my_plugin_rest_not_found',
				__( 'Item not found.', 'my-plugin' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response( $this->prepare_item_for_response( $post, $request ) );
	}

	/**
	 * Maps a post onto the REST response.
	 *
	 * @param WP_Post         $item    Post object.
	 * @param WP_REST_Request $request Request object.
	 *
	 * @return WP_REST_Response
	 */
	public function prepare_item_for_response( $item, $request ) {
		$data = array(
			'id'       => (int) $item->ID,
			'title'    => get_the_title( $item ),
			'excerpt'  => wp_strip_all_tags( (string) get_the_excerpt( $item ) ),
			'link'     => (string) get_permalink( $item ),
			'priority' => (int) get_post_meta( $item->ID, ContentType::META_PRIORITY, true ),
			'label'    => (string) Settings::get( 'api_label', '' ),
		);

		/**
		 * Filters a single item in the REST response, letting add-ons append their own fields.
		 *
		 * @param array<string, mixed> $data    Item data.
		 * @param WP_Post              $item    Source post.
		 * @param WP_REST_Request      $request Request object.
		 */
		$data = apply_filters( 'myplugin_rest_item', $data, $item, $request );

		return rest_ensure_response( $data );
	}

	/**
	 * Schema of a single item.
	 *
	 * @return array<string, mixed>
	 */
	public function get_item_schema(): array {
		if ( $this->schema ) {
			return $this->add_additional_fields_schema( $this->schema );
		}

		$this->schema = array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'my-plugin-item',
			'type'       => 'object',
			'properties' => array(
				'id'       => array(
					'description' => __( 'Item identifier.', 'my-plugin' ),
					'type'        => 'integer',
					'context'     => array( 'view' ),
					'readonly'    => true,
				),
				'title'    => array(
					'description' => __( 'Item title.', 'my-plugin' ),
					'type'        => 'string',
					'context'     => array( 'view' ),
				),
				'excerpt'  => array(
					'description' => __( 'Item excerpt.', 'my-plugin' ),
					'type'        => 'string',
					'context'     => array( 'view' ),
				),
				'link'     => array(
					'description' => __( 'Item URL.', 'my-plugin' ),
					'type'        => 'string',
					'format'      => 'uri',
					'context'     => array( 'view' ),
				),
				'priority' => array(
					'description' => __( 'Item priority.', 'my-plugin' ),
					'type'        => 'integer',
					'context'     => array( 'view' ),
				),
				'label'    => array(
					'description' => __( 'Label taken from the plugin settings.', 'my-plugin' ),
					'type'        => 'string',
					'context'     => array( 'view' ),
				),
			),
		);

		return $this->add_additional_fields_schema( $this->schema );
	}

	/**
	 * Collection parameters.
	 *
	 * @return array<string, mixed>
	 */
	public function get_collection_params(): array {
		return array(
			'page'     => array(
				'description'       => __( 'Result page number.', 'my-plugin' ),
				'type'              => 'integer',
				'default'           => 1,
				'minimum'           => 1,
				'sanitize_callback' => 'absint',
			),
			'per_page' => array(
				'description'       => __( 'Number of items per page.', 'my-plugin' ),
				'type'              => 'integer',
				'minimum'           => 1,
				'maximum'           => 100,
				'sanitize_callback' => 'absint',
			),
		);
	}
}
