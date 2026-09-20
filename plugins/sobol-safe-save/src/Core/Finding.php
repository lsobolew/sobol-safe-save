<?php
/**
 * One thing the save would change.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * A single changed thing: either a whole post field, or one block inside the content.
 *
 * Field findings are the verdict - they come from running the whole document through the same
 * path `wp_insert_post()` uses. Block findings are attribution: a best effort at saying which
 * block the damage belongs to, which is a separate question from whether there is damage.
 */
final class Finding {

	/**
	 * A whole post field changed.
	 */
	const SCOPE_FIELD = 'field';

	/**
	 * One block within the content changed.
	 */
	const SCOPE_BLOCK = 'block';

	/**
	 * Whether this describes a field or a block.
	 *
	 * @var string
	 */
	private $scope;

	/**
	 * Field name, or the editor's client id for a block.
	 *
	 * @var string
	 */
	private $key;

	/**
	 * Block name such as `core/paragraph`, empty for a field.
	 *
	 * @var string
	 */
	private $label;

	/**
	 * The text as written.
	 *
	 * @var string
	 */
	private $before;

	/**
	 * The text as it would be stored.
	 *
	 * @var string
	 */
	private $after;

	/**
	 * Structured changes from Differ.
	 *
	 * @var array<int, array{kind: string, tag: string, name: string, count: int}>
	 */
	private $changes;

	/**
	 * Constructor.
	 *
	 * @param string                                                                 $scope   SCOPE_* constant.
	 * @param string                                                                 $key     Field name or client id.
	 * @param string                                                                 $label   Block name, or an empty string.
	 * @param string                                                                 $before  Text as written.
	 * @param string                                                                 $after   Text as it would be stored.
	 * @param array<int, array{kind: string, tag: string, name: string, count: int}> $changes Structured changes.
	 */
	private function __construct( string $scope, string $key, string $label, string $before, string $after, array $changes ) {
		$this->scope   = $scope;
		$this->key     = $key;
		$this->label   = $label;
		$this->before  = $before;
		$this->after   = $after;
		$this->changes = $changes;
	}

	/**
	 * A finding about a whole post field.
	 *
	 * @param string                                                                 $field   Field name, e.g. `post_content`.
	 * @param string                                                                 $before  Text as written.
	 * @param string                                                                 $after   Text as it would be stored.
	 * @param array<int, array{kind: string, tag: string, name: string, count: int}> $changes Structured changes.
	 */
	public static function for_field( string $field, string $before, string $after, array $changes ): self {
		return new self( self::SCOPE_FIELD, $field, '', $before, $after, $changes );
	}

	/**
	 * A finding about one block.
	 *
	 * @param string                                                                 $client_id  The editor's client id for the block.
	 * @param string                                                                 $block_name Block name such as `core/paragraph`.
	 * @param string                                                                 $before     Markup as written.
	 * @param string                                                                 $after      Markup as it would be stored.
	 * @param array<int, array{kind: string, tag: string, name: string, count: int}> $changes    Structured changes.
	 */
	public static function for_block( string $client_id, string $block_name, string $before, string $after, array $changes ): self {
		return new self( self::SCOPE_BLOCK, $client_id, $block_name, $before, $after, $changes );
	}

	/**
	 * Whether this describes a field or a block.
	 */
	public function scope(): string {
		return $this->scope;
	}

	/**
	 * Field name, or the editor's client id for a block.
	 */
	public function key(): string {
		return $this->key;
	}

	/**
	 * Block name such as `core/paragraph`, empty for a field.
	 */
	public function label(): string {
		return $this->label;
	}

	/**
	 * The text as written.
	 */
	public function before(): string {
		return $this->before;
	}

	/**
	 * The text as it would be stored.
	 */
	public function after(): string {
		return $this->after;
	}

	/**
	 * Structured changes from Differ.
	 *
	 * @return array<int, array{kind: string, tag: string, name: string, count: int}>
	 */
	public function changes(): array {
		return $this->changes;
	}

	/**
	 * The finding as a plain array, for the REST response.
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return array(
			'scope'   => $this->scope,
			'key'     => $this->key,
			'label'   => $this->label,
			'before'  => $this->before,
			'after'   => $this->after,
			'changes' => $this->changes,
		);
	}
}
