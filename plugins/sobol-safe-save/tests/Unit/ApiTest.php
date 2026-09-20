<?php
/**
 * Unit tests for the extension contract.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Unit;

use Sobolewski\SobolSafeSave\Core\Api;
use PHPUnit\Framework\TestCase;

/**
 * Api::is_compatible() decides whether the Pro edition starts at all - a bug here means either a
 * dead Pro plugin or a fatal error on a customer site.
 */
final class ApiTest extends TestCase {

	/**
	 * The same version is compatible.
	 */
	public function test_same_version_is_compatible(): void {
		$this->assertTrue( Api::is_compatible( Api::VERSION ) );
	}

	/**
	 * An older requirement within the same major is compatible.
	 */
	public function test_older_requirement_in_same_major_is_compatible(): void {
		$this->assertTrue( Api::is_compatible( '1.0.0' ) );
	}

	/**
	 * A requirement newer than the exposed API is incompatible.
	 */
	public function test_newer_requirement_is_incompatible(): void {
		$this->assertFalse( Api::is_compatible( '1.9.0' ) );
	}

	/**
	 * A different major is always incompatible, even when numerically lower.
	 */
	public function test_different_major_is_incompatible(): void {
		$this->assertFalse( Api::is_compatible( '0.9.0' ) );
		$this->assertFalse( Api::is_compatible( '2.0.0' ) );
	}
}
