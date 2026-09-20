<?php
/**
 * The result of analysing one prospective save.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * What a save would do to the content, and how much of it we can point at.
 *
 * Two kinds of knowledge live here and they are deliberately kept apart:
 *
 * - **The verdict** comes from running the whole document through the same path `wp_insert_post()`
 *   takes. It is authoritative: if `changed()` is true, something really will be lost.
 * - **The attribution** comes from running each block's own markup through that path separately.
 *   It is a best effort. A stray `<` at a block boundary can be consumed differently when the
 *   fragment is filtered on its own than when the whole document is, and `balanceTags` works on
 *   the document as a whole and cannot be attributed at all.
 *
 * `confidence()` says which of those applies, so the interface can tell the user "4 blocks affected"
 * or "something will change, but we cannot say where" rather than quietly showing the second as
 * though it were the first.
 */
final class Report {

	/**
	 * Wire format version, so a separately distributed add-on can refuse a payload it predates.
	 */
	const SCHEMA_VERSION = 1;

	/**
	 * No block-level attribution is available or trustworthy.
	 */
	const CONFIDENCE_NONE = 'none';

	/**
	 * The content changes, but no individual block accounts for it.
	 */
	const CONFIDENCE_PARTIAL = 'partial';

	/**
	 * Every change is accounted for by at least one block.
	 */
	const CONFIDENCE_FULL = 'full';

	/**
	 * Whether KSES filtering applies to the user this report was produced for.
	 *
	 * @var bool
	 */
	private $applies;

	/**
	 * Field findings, keyed by field name.
	 *
	 * @var array<string, Finding>
	 */
	private $fields;

	/**
	 * Block findings.
	 *
	 * @var Finding[]
	 */
	private $blocks;

	/**
	 * How much the block findings can be trusted.
	 *
	 * @var string
	 */
	private $confidence;

	/**
	 * Constructor.
	 *
	 * @param bool                   $applies    Whether KSES applies to this user.
	 * @param array<string, Finding> $fields     Field findings, keyed by field name.
	 * @param Finding[]              $blocks     Block findings.
	 * @param string                 $confidence One of the CONFIDENCE_* constants.
	 */
	public function __construct( bool $applies, array $fields = array(), array $blocks = array(), string $confidence = self::CONFIDENCE_NONE ) {
		$this->applies    = $applies;
		$this->fields     = $fields;
		$this->blocks     = $blocks;
		$this->confidence = $confidence;
	}

	/**
	 * A report for a user whose content WordPress does not filter at all.
	 */
	public static function not_applicable(): self {
		return new self( false );
	}

	/**
	 * Whether KSES filtering applies to the user this report was produced for.
	 *
	 * When this is false nothing else in the report means anything: the user may post unfiltered
	 * HTML, so the editor can stop asking altogether.
	 */
	public function applies(): bool {
		return $this->applies;
	}

	/**
	 * Whether saving would change the content. This is the authoritative verdict.
	 */
	public function changed(): bool {
		return (bool) $this->fields;
	}

	/**
	 * Field findings, keyed by field name.
	 *
	 * @return array<string, Finding>
	 */
	public function fields(): array {
		return $this->fields;
	}

	/**
	 * Block findings.
	 *
	 * @return Finding[]
	 */
	public function blocks(): array {
		return $this->blocks;
	}

	/**
	 * How much the block findings can be trusted.
	 */
	public function confidence(): string {
		return $this->confidence;
	}

	/**
	 * The report as a plain array, for the REST response and the JavaScript store.
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		$fields = array();

		foreach ( $this->fields as $name => $finding ) {
			$fields[ $name ] = $finding->to_array();
		}

		return array(
			'schemaVersion' => self::SCHEMA_VERSION,
			'applies'       => $this->applies,
			'changed'       => $this->changed(),
			'confidence'    => $this->confidence,
			'fields'        => (object) $fields,
			'blocks'        => array_map(
				static function ( Finding $finding ) {
					return $finding->to_array();
				},
				array_values( $this->blocks )
			),
		);
	}
}
