<?php
/**
 * What a paid add-on will be able to build on.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Tests\Integration;

use Sobolewski\SobolSafeSave\Core\Api;
use Sobolewski\SobolSafeSave\Core\Module as ModuleContract;
use Sobolewski\SobolSafeSave\Core\Plugin;
use Sobolewski\SobolSafeSave\Core\Report;
use Sobolewski\SobolSafeSave\Core\Settings;
use WP_REST_Request;
use WP_UnitTestCase;

/**
 * Proves the extension surface is real, by using it the way a separately distributed add-on would.
 *
 * This matters more than a normal test, for two reasons.
 *
 * The first is that hooks cannot be added later. Once the free plugin is in the WordPress.org
 * directory, an add-on shipped to customers can only reach what the published version already
 * exposes; a missing hook means either a broken add-on or asking every customer to update two
 * plugins in step. So the whole surface is built and exercised now, while it is still free to
 * change, even though nothing uses most of it yet.
 *
 * The second is guideline 5 of the directory: a plugin may not contain functionality that is
 * restricted or locked pending payment. The answer is not a flag - it is that the code genuinely
 * is not here. {@see self::test_the_free_edition_cannot_block_a_save()} is what keeps that true.
 */
final class ExtensionApiTest extends WP_UnitTestCase {

	/**
	 * Content an author cannot keep.
	 */
	private const RISKY = '<p>keep</p><iframe src="https://x.test"></iframe>';

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
	 * Clears anything a test left on the option row.
	 */
	public function tear_down(): void {
		delete_option( Settings::OPTION );

		parent::tear_down();
	}

	/**
	 * An add-on can add a module to the same registry the free plugin uses.
	 */
	public function test_an_add_on_can_register_a_module(): void {
		$module = $this->fake_module();

		$register = static function ( Plugin $plugin ) use ( $module ): void {
			$plugin->add_module( $module );
		};

		add_action( 'sobol_safe_save_register_modules', $register );

		// Re-run the registration hook the way a second boot would.
		do_action( 'sobol_safe_save_register_modules', Plugin::instance() );

		remove_action( 'sobol_safe_save_register_modules', $register );

		$this->assertTrue( $module->registered );
		$this->assertSame( $module, Plugin::instance()->module( 'pro-audit' ) );
	}

	/**
	 * An add-on can take the module list away entirely, which is what an "off" switch looks like.
	 */
	public function test_an_add_on_can_filter_the_module_list(): void {
		add_filter( 'sobol_safe_save_modules', '__return_empty_array' );

		$classes = apply_filters( 'sobol_safe_save_modules', array( 'Something' ) );

		remove_filter( 'sobol_safe_save_modules', '__return_empty_array' );

		$this->assertSame( array(), $classes );
	}

	/**
	 * Every analysis reaches an add-on with the context an audit log needs.
	 *
	 * This is the hook the paid edition's history, alerts and reports are all built on, so it
	 * carries the identity of the content as well as the finding.
	 */
	public function test_an_add_on_sees_every_analysis(): void {
		$seen = array();

		$listen = static function ( Report $report, array $context ) use ( &$seen ): void {
			$seen[] = array(
				'changed' => $report->changed(),
				'surface' => $context['surface'] ?? '',
				'type'    => $context['post_type'] ?? '',
			);
		};

		add_action( 'sobol_safe_save_analysis_complete', $listen, 10, 2 );

		$this->analyze( array( 'content' => self::RISKY ) );

		remove_action( 'sobol_safe_save_analysis_complete', $listen, 10 );

		$this->assertCount( 1, $seen );
		$this->assertTrue( $seen[0]['changed'] );
		$this->assertSame( 'rest', $seen[0]['surface'] );
		$this->assertSame( 'post', $seen[0]['type'] );
	}

	/**
	 * An add-on can add its own settings, and have the last word on what is stored.
	 */
	public function test_an_add_on_can_add_settings(): void {
		$defaults = static function ( array $values ): array {
			$values['pro_retention_days'] = 30;

			return $values;
		};

		add_filter( 'sobol_safe_save_settings_defaults', $defaults );

		$this->assertSame( 30, Settings::defaults()['pro_retention_days'] );
		$this->assertSame( 90, Settings::sanitize( array( 'pro_retention_days' => '90' ) )['pro_retention_days'] );

		remove_filter( 'sobol_safe_save_settings_defaults', $defaults );
	}

	/**
	 * An add-on can put its own data on the wire for its own editor script.
	 */
	public function test_an_add_on_can_extend_the_payload(): void {
		$extend = static function ( array $payload, Report $report ): array {
			$payload['proSeverity'] = $report->changed() ? 'high' : 'none';

			return $payload;
		};

		add_filter( 'sobol_safe_save_report', $extend, 10, 2 );

		$body = $this->analyze( array( 'content' => self::RISKY ) );

		remove_filter( 'sobol_safe_save_report', $extend, 10 );

		$this->assertSame( 'high', $body['proSeverity'] );

		// The version an add-on checks before trusting anything else in here.
		$this->assertSame( Report::SCHEMA_VERSION, $body['schemaVersion'] );
	}

	/**
	 * An add-on can decide some content is none of Sobol Safe Save's business.
	 *
	 * Per-role and per-post-type policies are a paid feature; this is the hook they hang on.
	 */
	public function test_an_add_on_can_apply_a_policy(): void {
		$policy = static function ( bool $should, array $context ): bool {
			return 'post' !== ( $context['post_type'] ?? '' );
		};

		add_filter( 'sobol_safe_save_should_check', $policy, 10, 2 );

		$body = $this->analyze( array( 'content' => self::RISKY ) );

		remove_filter( 'sobol_safe_save_should_check', $policy, 10 );

		$this->assertFalse( $body['applies'] );
	}

	/**
	 * The contract version is semver, and refuses a major it does not implement.
	 */
	public function test_the_contract_version_guards_compatibility(): void {
		$this->assertMatchesRegularExpression( '/^\d+\.\d+\.\d+$/', Api::version() );
		$this->assertTrue( Api::is_compatible( '1.0.0' ) );
		$this->assertFalse( Api::is_compatible( '2.0.0' ) );
	}

	/**
	 * The free edition contains no way to block a save, and that is checked rather than asserted.
	 *
	 * Guideline 5 of the WordPress.org directory forbids shipping functionality that is present
	 * but withheld pending payment. "Prevent save" is a paid feature, so the honest implementation
	 * is not a disabled code path here - it is an add-on, distributed separately, that listens to
	 * `sobol_safe_save.report` and calls `lockPostSaving` in its own script.
	 *
	 * Reading the built bundle rather than the sources on purpose: what is shipped is what a
	 * reviewer sees, and an import that only shows up after bundling would still be shipped.
	 */
	public function test_the_free_edition_cannot_block_a_save(): void {
		$bundle = SOBOL_SAFE_SAVE_DIR . 'build/editor/index.js';

		if ( ! is_readable( $bundle ) ) {
			$this->markTestSkipped( 'The editor script has not been built; run `wpx build --skip-package`.' );
		}

		$code = (string) file_get_contents( $bundle ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- reading a file this repository just built, not a remote resource.

		foreach ( array( 'lockPostSaving', 'unlockPostSaving', 'isPostSavingLocked' ) as $forbidden ) {
			$this->assertStringNotContainsString(
				$forbidden,
				$code,
				"The free edition must not ship {$forbidden}: blocking a save is the add-on's job, " .
				'and code that is present but switched off is what guideline 5 exists to catch.'
			);
		}
	}

	/**
	 * A module of the kind an add-on would register.
	 */
	private function fake_module(): object {
		return new class() implements ModuleContract {

			/**
			 * Whether register() has been called.
			 *
			 * @var bool
			 */
			public $registered = false;

			/**
			 * Module identifier.
			 */
			public function id(): string {
				return 'pro-audit';
			}

			/**
			 * Registers the hooks.
			 */
			public function register(): void {
				$this->registered = true;
			}
		};
	}

	/**
	 * Sends a request to the analysis route and returns the body.
	 *
	 * @param array<string, mixed> $params Request parameters.
	 *
	 * @return array<string, mixed>
	 */
	private function analyze( array $params ): array {
		$request = new WP_REST_Request( 'POST', '/sobol-safe-save/v1/analyze' );

		foreach ( $params as $name => $value ) {
			$request->set_param( $name, $value );
		}

		return (array) rest_get_server()->dispatch( $request )->get_data();
	}
}
