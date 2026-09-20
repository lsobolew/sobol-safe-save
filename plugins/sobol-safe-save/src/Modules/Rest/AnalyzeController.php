<?php
/**
 * The route both editors ask "what will this save cost me?".
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Modules\Rest;

use Sobolewski\SobolSafeSave\Core\Analyzer;
use Sobolewski\SobolSafeSave\Core\Report;
use Sobolewski\SobolSafeSave\Core\Settings;
use WP_Error;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * Analyses content the editor is holding, without saving anything.
 *
 * Reads, despite being a POST: a document is far too big for a query string, and there is no
 * other way to send one. Nothing here writes, and that is worth keeping true - the route is
 * called every time the user pauses typing.
 */
final class AnalyzeController extends WP_REST_Controller {

	/**
	 * How much content is analysed before the route gives up, in bytes.
	 *
	 * Generous on purpose. The analysis is linear in the size of the document and this route runs
	 * on a debounce while somebody types, so there has to be a ceiling; it should sit well above
	 * any real post, so that hitting it means something is wrong rather than something is long.
	 */
	const DEFAULT_MAX_LENGTH = 2097152;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->namespace = Module::NAMESPACE_V1;
		$this->rest_base = 'analyze';
	}

	/**
	 * Registers the route.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'analyze' ),
					// permission_callback is MANDATORY - omitting it is flagged by Plugin Check
					// and makes the route effectively public.
					'permission_callback' => array( $this, 'analyze_permissions_check' ),
					'args'                => $this->get_endpoint_args(),
				),
				'schema' => array( $this, 'get_public_item_schema' ),
			)
		);
	}

	/**
	 * Whether the caller may edit the content they are asking about.
	 *
	 * The analysis reflects what *this* user would lose, so the check is the same one the editor
	 * itself applies: may you edit this post. For a post that does not exist yet there is nothing
	 * to check against, so the post type's own create capability stands in.
	 *
	 * @param WP_REST_Request $request Request.
	 *
	 * @return true|WP_Error
	 */
	public function analyze_permissions_check( $request ) {
		$post_id = (int) $request['post_id'];

		if ( $post_id > 0 ) {
			if ( ! current_user_can( 'edit_post', $post_id ) ) {
				return new WP_Error(
					'sobol_safe_save_rest_cannot_edit',
					__( 'You are not allowed to edit this post.', 'sobol-safe-save' ),
					array( 'status' => rest_authorization_required_code() )
				);
			}

			return true;
		}

		$post_type = get_post_type_object( (string) $request['post_type'] );

		if ( ! $post_type ) {
			return new WP_Error(
				'sobol_safe_save_rest_unknown_post_type',
				__( 'Unknown post type.', 'sobol-safe-save' ),
				array( 'status' => 400 )
			);
		}

		if ( ! current_user_can( $post_type->cap->edit_posts ) ) {
			return new WP_Error(
				'sobol_safe_save_rest_cannot_edit',
				__( 'You are not allowed to edit posts of this type.', 'sobol-safe-save' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * Answers what a save would do to the submitted content.
	 *
	 * @param WP_REST_Request $request Request.
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function analyze( $request ) {
		$post_id   = (int) $request['post_id'];
		$post_type = (string) $request['post_type'];

		$fields = array( 'post_content' => (string) $request['content'] );

		// Applied here rather than trusted to the editor: the settings are a site policy, and a
		// policy that only holds when the client cooperates is not one.
		if ( Settings::get( 'check_title', true ) ) {
			$fields['post_title'] = (string) $request['title'];
		}

		if ( Settings::get( 'check_excerpt', true ) ) {
			$fields['post_excerpt'] = (string) $request['excerpt'];
		}

		$context = array(
			'surface'   => 'rest',
			'post_id'   => $post_id,
			'post_type' => $post_type,
		);

		$too_long = $this->exceeds_limit( $fields );

		if ( $too_long instanceof WP_Error ) {
			return $too_long;
		}

		// A post type the site has switched off looks exactly like a user who is never filtered:
		// nothing to say, stop asking.
		if ( ! Settings::checks( $post_type ) ) {
			return rest_ensure_response( Report::not_applicable()->to_array() );
		}

		/**
		 * Filters whether this content should be analysed at all.
		 *
		 * Returning false produces the same answer as a user who may post unfiltered HTML: the
		 * editor is told Sobol Safe Save has nothing to say and stops asking. That is what a policy
		 * such as "do not check this post type" or "do not check editors" should look like from
		 * the outside, which is why it is not an error.
		 *
		 * @param bool                 $should_check Whether to analyse.
		 * @param array<string, mixed> $context      `surface`, `post_id`, `post_type`.
		 */
		if ( ! apply_filters( 'sobol_safe_save_should_check', true, $context ) ) {
			return rest_ensure_response( Report::not_applicable()->to_array() );
		}

		$report = ( new Analyzer() )->analyze( $fields, $this->fragments( $request ), $context );

		$payload = $report->to_array();

		/**
		 * Filters the payload sent to the editor.
		 *
		 * The wire format, not the analysis - add fields here for an add-on's own editor script
		 * to read. `schemaVersion` tells that script whether it understands what it is given.
		 *
		 * @param array<string, mixed> $payload The response body.
		 * @param Report               $report  The analysis it was built from.
		 * @param array<string, mixed> $context `surface`, `post_id`, `post_type`.
		 */
		$payload = apply_filters( 'sobol_safe_save_report', $payload, $report, $context );

		return rest_ensure_response( $payload );
	}

	/**
	 * Per-block markup from the request, if the editor sent any.
	 *
	 * @param WP_REST_Request $request Request.
	 *
	 * @return array<int, array{clientId: string, name: string, html: string}>
	 */
	private function fragments( WP_REST_Request $request ): array {
		$fragments = array();

		foreach ( (array) $request['fragments'] as $fragment ) {
			if ( ! is_array( $fragment ) ) {
				continue;
			}

			$fragments[] = array(
				'clientId' => isset( $fragment['clientId'] ) ? (string) $fragment['clientId'] : '',
				'name'     => isset( $fragment['name'] ) ? (string) $fragment['name'] : '',
				'html'     => isset( $fragment['html'] ) ? (string) $fragment['html'] : '',
			);
		}

		return $fragments;
	}

	/**
	 * Whether the submitted content is larger than this site is willing to analyse.
	 *
	 * @param array<string, string> $fields Submitted fields.
	 *
	 * @return WP_Error|null An error when the content is too large.
	 */
	private function exceeds_limit( array $fields ): ?WP_Error {
		/**
		 * Filters the largest document Sobol Safe Save will analyse, in bytes.
		 *
		 * @param int $bytes Maximum combined length of the analysed fields.
		 */
		$maximum = (int) apply_filters( 'sobol_safe_save_max_content_length', self::DEFAULT_MAX_LENGTH );

		if ( $maximum <= 0 ) {
			return null;
		}

		$length = 0;

		foreach ( $fields as $value ) {
			$length += strlen( $value );
		}

		if ( $length <= $maximum ) {
			return null;
		}

		return new WP_Error(
			'sobol_safe_save_rest_content_too_large',
			__( 'This content is too large for Sobol Safe Save to check.', 'sobol-safe-save' ),
			array( 'status' => 413 )
		);
	}

	/**
	 * Accepted parameters.
	 *
	 * Note there is no `sanitize_callback` on the three content fields, and that is deliberate:
	 * the whole point is to analyse exactly what the editor holds. Sanitising it first would
	 * analyse something the user never wrote and quietly hide the very changes being looked for.
	 * Nothing here is stored or echoed - it is filtered, measured and thrown away.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function get_endpoint_args(): array {
		$raw = array(
			'type'        => 'string',
			'default'     => '',
			'arg_options' => array( 'sanitize_callback' => null ),
		);

		return array(
			'post_id'   => array(
				'description'       => __( 'The post being edited, or 0 for one that does not exist yet.', 'sobol-safe-save' ),
				'type'              => 'integer',
				'default'           => 0,
				'sanitize_callback' => 'absint',
			),
			'post_type' => array(
				'description'       => __( 'Post type of the content being edited.', 'sobol-safe-save' ),
				'type'              => 'string',
				'default'           => 'post',
				'sanitize_callback' => 'sanitize_key',
			),
			'title'     => array( 'description' => __( 'Post title as the editor holds it.', 'sobol-safe-save' ) ) + $raw,
			'content'   => array( 'description' => __( 'Post content as the editor holds it.', 'sobol-safe-save' ) ) + $raw,
			'excerpt'   => array( 'description' => __( 'Post excerpt as the editor holds it.', 'sobol-safe-save' ) ) + $raw,
			'fragments' => array(
				'description' => __( 'Per-block markup, so findings can be tied back to a block on screen.', 'sobol-safe-save' ),
				'type'        => 'array',
				'default'     => array(),
				'items'       => array(
					'type'       => 'object',
					'properties' => array(
						'clientId' => array( 'type' => 'string' ),
						'name'     => array( 'type' => 'string' ),
						'html'     => array(
							'type'        => 'string',
							'arg_options' => array( 'sanitize_callback' => null ),
						),
					),
				),
			),
		);
	}

	/**
	 * Schema of the analysis.
	 *
	 * @return array<string, mixed>
	 */
	public function get_item_schema(): array {
		if ( $this->schema ) {
			return $this->add_additional_fields_schema( $this->schema );
		}

		$change = array(
			'type'       => 'object',
			'properties' => array(
				'kind'  => array(
					'description' => __( 'What sort of change this is.', 'sobol-safe-save' ),
					'type'        => 'string',
				),
				'tag'   => array(
					'description' => __( 'Element the change applies to, if any.', 'sobol-safe-save' ),
					'type'        => 'string',
				),
				'name'  => array(
					'description' => __( 'Attribute or style property, if any.', 'sobol-safe-save' ),
					'type'        => 'string',
				),
				'count' => array(
					'description' => __( 'How many times it happens.', 'sobol-safe-save' ),
					'type'        => 'integer',
				),
			),
		);

		$finding = array(
			'type'       => 'object',
			'properties' => array(
				'scope'   => array(
					'description' => __( 'Whether this describes a field or a block.', 'sobol-safe-save' ),
					'type'        => 'string',
					'enum'        => array( 'field', 'block' ),
				),
				'key'     => array(
					'description' => __( 'Field name, or the block client id.', 'sobol-safe-save' ),
					'type'        => 'string',
				),
				'label'   => array(
					'description' => __( 'Block name, empty for a field.', 'sobol-safe-save' ),
					'type'        => 'string',
				),
				'before'  => array(
					'description' => __( 'The text as written.', 'sobol-safe-save' ),
					'type'        => 'string',
				),
				'after'   => array(
					'description' => __( 'The text as it would be stored.', 'sobol-safe-save' ),
					'type'        => 'string',
				),
				'changes' => array(
					'description' => __( 'What was lost.', 'sobol-safe-save' ),
					'type'        => 'array',
					'items'       => $change,
				),
			),
		);

		$this->schema = array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'sobol-safe-save-analysis',
			'type'       => 'object',
			'properties' => array(
				'schemaVersion' => array(
					'description' => __( 'Version of this payload, for add-ons that read it.', 'sobol-safe-save' ),
					'type'        => 'integer',
					'context'     => array( 'view' ),
				),
				'applies'       => array(
					'description' => __( 'Whether WordPress filters this user\'s content at all.', 'sobol-safe-save' ),
					'type'        => 'boolean',
					'context'     => array( 'view' ),
				),
				'changed'       => array(
					'description' => __( 'Whether saving would change the content.', 'sobol-safe-save' ),
					'type'        => 'boolean',
					'context'     => array( 'view' ),
				),
				'confidence'    => array(
					'description' => __( 'How far the changes could be traced to individual blocks.', 'sobol-safe-save' ),
					'type'        => 'string',
					'enum'        => array( 'none', 'partial', 'full' ),
					'context'     => array( 'view' ),
				),
				'fields'        => array(
					'description'          => __( 'Findings per post field.', 'sobol-safe-save' ),
					'type'                 => 'object',
					'context'              => array( 'view' ),
					'additionalProperties' => $finding,
				),
				'blocks'        => array(
					'description' => __( 'Findings per block.', 'sobol-safe-save' ),
					'type'        => 'array',
					'context'     => array( 'view' ),
					'items'       => $finding,
				),
			),
		);

		return $this->add_additional_fields_schema( $this->schema );
	}
}
