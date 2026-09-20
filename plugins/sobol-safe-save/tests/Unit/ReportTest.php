<?php
/**
 * Unit tests for the report value objects.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Unit;

use Sobolewski\SobolSafeSave\Core\Differ;
use Sobolewski\SobolSafeSave\Core\Finding;
use Sobolewski\SobolSafeSave\Core\Report;
use PHPUnit\Framework\TestCase;

/**
 * The report is the wire format: it is what the REST route returns, what the editor renders and
 * what a separately distributed add-on reads. Its shape is a published contract, so these tests
 * pin it down rather than trusting that nobody renames a key in passing.
 */
final class ReportTest extends TestCase {

	/**
	 * A report for an unfiltered user says so and carries nothing else.
	 */
	public function test_a_not_applicable_report_is_empty(): void {
		$report = Report::not_applicable();

		$this->assertFalse( $report->applies() );
		$this->assertFalse( $report->changed() );
		$this->assertSame( array(), $report->fields() );
		$this->assertSame( array(), $report->blocks() );
		$this->assertSame( Report::CONFIDENCE_NONE, $report->confidence() );
	}

	/**
	 * The verdict comes from the field findings, not from the block findings.
	 *
	 * Block findings are attribution. A report with blocks but no field finding would mean
	 * "we found the culprit for damage that did not happen", which is a contradiction the
	 * interface must never be asked to render.
	 */
	public function test_changed_follows_the_fields(): void {
		$this->assertFalse( ( new Report( true ) )->changed() );

		$with_field = new Report( true, array( 'post_content' => $this->finding() ) );

		$this->assertTrue( $with_field->changed() );
	}

	/**
	 * The payload carries every key the editor and an add-on rely on.
	 */
	public function test_the_payload_shape_is_stable(): void {
		$report = new Report(
			true,
			array( 'post_content' => $this->finding() ),
			array( Finding::for_block( 'abc-123', 'core/paragraph', '<p>a</p>', '<p>b</p>', array() ) ),
			Report::CONFIDENCE_FULL
		);

		$payload = $report->to_array();

		$this->assertSame(
			array( 'schemaVersion', 'applies', 'changed', 'confidence', 'fields', 'blocks' ),
			array_keys( $payload )
		);
		$this->assertSame( Report::SCHEMA_VERSION, $payload['schemaVersion'] );
		$this->assertTrue( $payload['applies'] );
		$this->assertTrue( $payload['changed'] );
		$this->assertSame( Report::CONFIDENCE_FULL, $payload['confidence'] );

		$block = $payload['blocks'][0];

		$this->assertSame(
			array( 'scope', 'key', 'label', 'before', 'after', 'changes' ),
			array_keys( $block )
		);
		$this->assertSame( Finding::SCOPE_BLOCK, $block['scope'] );
		$this->assertSame( 'abc-123', $block['key'] );
		$this->assertSame( 'core/paragraph', $block['label'] );
	}

	/**
	 * Fields serialize as an object, so an empty one is `{}` in JSON and not `[]`.
	 *
	 * TypeScript reads `fields` as a record keyed by field name. PHP would encode an empty array
	 * as a JSON array, and the editor would then be handed a list where it expects a map.
	 */
	public function test_empty_fields_serialize_as_an_object(): void {
		$payload = ( new Report( true ) )->to_array();

		$this->assertIsObject( $payload['fields'] );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- wp_json_encode() does not exist here: unit tests run without WordPress, and the behaviour under test is PHP's own.
		$this->assertStringContainsString( '"fields":{}', (string) json_encode( $payload ) );
	}

	/**
	 * Block findings serialize as a list, with the keys renumbered.
	 */
	public function test_blocks_serialize_as_a_list(): void {
		$blocks = array(
			7 => Finding::for_block( 'a', 'core/paragraph', 'x', 'y', array() ),
			9 => Finding::for_block( 'b', 'core/heading', 'x', 'y', array() ),
		);

		$payload = ( new Report( true, array(), $blocks, Report::CONFIDENCE_FULL ) )->to_array();

		$this->assertSame( array( 0, 1 ), array_keys( $payload['blocks'] ) );
	}

	/**
	 * A field finding keeps both sides and its structured changes.
	 */
	public function test_a_field_finding_keeps_both_sides(): void {
		$finding = Finding::for_field(
			'post_content',
			'<iframe></iframe>',
			'',
			array(
				array(
					'kind'  => Differ::KIND_TAG,
					'tag'   => 'iframe',
					'name'  => '',
					'count' => 1,
				),
			)
		);

		$this->assertSame( Finding::SCOPE_FIELD, $finding->scope() );
		$this->assertSame( 'post_content', $finding->key() );
		$this->assertSame( '', $finding->label() );
		$this->assertSame( '<iframe></iframe>', $finding->before() );
		$this->assertSame( '', $finding->after() );
		$this->assertSame( Differ::KIND_TAG, $finding->changes()[0]['kind'] );
	}

	/**
	 * A finding to build reports with.
	 */
	private function finding(): Finding {
		return Finding::for_field( 'post_content', '<iframe></iframe>', '', array() );
	}
}
