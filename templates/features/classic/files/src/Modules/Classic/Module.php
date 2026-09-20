<?php
/**
 * Module: the classic editor.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Modules\Classic;

use Sobolewski\SobolSafeSave\Core\Analyzer;
use Sobolewski\SobolSafeSave\Core\Assets;
use Sobolewski\SobolSafeSave\Core\Explainer;
use Sobolewski\SobolSafeSave\Core\Module as ModuleContract;
use Sobolewski\SobolSafeSave\Core\Plugin;
use Sobolewski\SobolSafeSave\Core\Settings;
use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Sobol Safe Save in the classic editor.
 *
 * Same promise as in the block editor: warn while there is still time to do something about it,
 * and never stand in the way of a save.
 *
 * There are two halves. The script warns beforehand, exactly as the block editor does. The other
 * half runs after the save and reports what was actually lost - a safety net for every way content
 * reaches `wp_insert_post()` without the script having been involved: a metabox plugin posting the
 * form itself, a browser with JavaScript disabled, a session that expired mid-edit. It compares
 * what the browser sent against what the database ended up with, which makes it the one check that
 * cannot be wrong about what happened.
 */
final class Module implements ModuleContract {

	/**
	 * Script handle.
	 */
	const HANDLE = 'sobol-safe-save-classic';

	/**
	 * Built script, relative to the plugin directory.
	 */
	const SCRIPT = 'build/classic/index.js';

	/**
	 * Prefix for the transient holding a report between the save and the redirect.
	 */
	const TRANSIENT = 'sobol_safe_save_loss_';

	/**
	 * Plugin instance.
	 *
	 * @var Plugin
	 */
	private $plugin;

	/**
	 * Constructor.
	 *
	 * @param Plugin $plugin Plugin instance.
	 */
	public function __construct( Plugin $plugin ) {
		$this->plugin = $plugin;
	}

	/**
	 * Module identifier.
	 */
	public function id(): string {
		return 'classic';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'save_post', array( $this, 'record_losses' ), 10, 2 );
		add_action( 'admin_notices', array( $this, 'render_notice' ) );
	}

	/**
	 * Loads the warning script on a classic editing screen.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public function enqueue( $hook_suffix ): void {
		if ( ! in_array( (string) $hook_suffix, array( 'post.php', 'post-new.php' ), true ) ) {
			return;
		}

		$screen = get_current_screen();

		// The block editor has its own, better-informed script; loading both would mean two
		// warnings about the same thing.
		if ( ! $screen || $screen->is_block_editor() ) {
			return;
		}

		if ( ! Analyzer::applies() || ! Settings::checks( (string) $screen->post_type ) ) {
			return;
		}

		$assets = $this->assets();

		if ( ! $assets->exists( self::SCRIPT ) ) {
			return;
		}

		$meta = $assets->meta( 'classic/index' );

		wp_enqueue_script(
			self::HANDLE,
			$assets->url( self::SCRIPT ),
			$meta['dependencies'],
			$meta['version'],
			true
		);

		wp_set_script_translations( self::HANDLE, 'sobol-safe-save', SOBOL_SAFE_SAVE_DIR . 'languages' );

		wp_add_inline_script(
			self::HANDLE,
			'window.sobolSafeSave = window.sobolSafeSave || {}; window.sobolSafeSave.classic = '
				. wp_json_encode(
					array(
						'debounceMs' => Settings::debounce_ms(),
						'postId'     => (int) get_the_ID(),
						'postType'   => (string) $screen->post_type,
					)
				) . ';',
			'before'
		);
	}

	/**
	 * Records what a save actually cost, for the notice after the redirect.
	 *
	 * @param int     $post_id Saved post.
	 * @param WP_Post $post    Saved post object.
	 */
	public function record_losses( $post_id, $post ): void {
		if ( ! $post instanceof WP_Post || wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- core has already verified the nonce and accepted this submission by the time save_post fires; nothing here acts on the request, it only measures what has already happened.
		if ( ! isset( $_POST['content'] ) ) {
			// Not a classic editor submission. The block editor saves over REST, where the
			// warning has already been shown before anything was sent.
			return;
		}

		if ( ! Analyzer::applies() || ! Settings::checks( (string) $post->post_type ) ) {
			return;
		}

		/*
		 * Deliberately unsanitized. The whole question being asked is "what did WordPress change
		 * about what this person submitted", and sanitizing it here would answer a different one.
		 * The value is analysed, compared and thrown away; it is never stored and never echoed.
		 */
		// phpcs:disable WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized, WordPress.Security.ValidatedSanitizedInput.MissingUnslash
		$fields = array( 'post_content' => (string) wp_unslash( $_POST['content'] ) );

		if ( Settings::get( 'check_title', true ) && isset( $_POST['post_title'] ) ) {
			$fields['post_title'] = (string) wp_unslash( $_POST['post_title'] );
		}

		if ( Settings::get( 'check_excerpt', true ) && isset( $_POST['excerpt'] ) ) {
			$fields['post_excerpt'] = (string) wp_unslash( $_POST['excerpt'] );
		}
		// phpcs:enable

		$analyzer = new Analyzer();

		$report = $analyzer->analyze(
			$fields,
			$analyzer->fragments_from_content( $fields['post_content'] ),
			array(
				'surface'   => 'classic',
				'post_id'   => (int) $post_id,
				'post_type' => (string) $post->post_type,
			)
		);

		$key = $this->transient_key( (int) $post_id );

		if ( ! $report->changed() ) {
			delete_transient( $key );

			return;
		}

		// Long enough to survive the redirect, short enough that a stale one never surprises
		// somebody who comes back to the post an hour later.
		set_transient( $key, $report->to_array(), 5 * MINUTE_IN_SECONDS );
	}

	/**
	 * Shows what the last save cost, once, on the screen the author lands on.
	 */
	public function render_notice(): void {
		$screen = get_current_screen();

		if ( ! $screen || 'post' !== $screen->base ) {
			return;
		}

		$post_id = (int) get_the_ID();

		if ( ! $post_id ) {
			return;
		}

		$key    = $this->transient_key( $post_id );
		$report = get_transient( $key );

		if ( ! is_array( $report ) ) {
			return;
		}

		// Shown once. Leaving it would nag on every visit to a post the author has already been
		// told about and cannot now undo.
		delete_transient( $key );

		$this->print_notice( $report );
	}

	/**
	 * Prints the notice for a stored report.
	 *
	 * @param array<string, mixed> $report Report as produced by Report::to_array().
	 */
	private function print_notice( array $report ): void {
		$explainer = new Explainer();
		$lines     = array();

		foreach ( (array) ( $report['blocks'] ?? array() ) as $block ) {
			foreach ( (array) ( $block['changes'] ?? array() ) as $change ) {
				$lines[] = sprintf(
					/* translators: 1: block name, 2: what changed. */
					__( '%1$s: %2$s', 'sobol-safe-save' ),
					$explainer->block_label( (string) ( $block['label'] ?? '' ) ),
					$explainer->change( (array) $change )
				);
			}
		}

		foreach ( (array) ( $report['fields'] ?? array() ) as $field => $finding ) {
			// Content is already covered, block by block, whenever a block could be held
			// responsible for it. Repeating it here would list the same loss twice.
			if ( 'post_content' === $field && ! empty( $report['blocks'] ) ) {
				continue;
			}

			foreach ( (array) ( $finding['changes'] ?? array() ) as $change ) {
				$lines[] = sprintf(
					/* translators: 1: post field name, 2: what changed. */
					__( '%1$s: %2$s', 'sobol-safe-save' ),
					$explainer->field_label( (string) $field ),
					$explainer->change( (array) $change )
				);
			}
		}

		if ( ! $lines ) {
			return;
		}

		printf(
			'<div class="notice notice-warning"><p><strong>%s</strong></p><ul style="list-style:disc;margin-left:2em">',
			esc_html__( 'Sobol Safe Save: this save changed your content.', 'sobol-safe-save' )
		);

		foreach ( $lines as $line ) {
			printf( '<li>%s</li>', esc_html( $line ) );
		}

		printf(
			'</ul><p>%s</p></div>',
			esc_html__(
				'WordPress removes anything your role is not allowed to publish. Ask an administrator if you need it kept.',
				'sobol-safe-save'
			)
		);
	}

	/**
	 * Transient key for one author's last save of one post.
	 *
	 * Keyed by user as well as post, so that two people editing the same post are never shown each
	 * other's losses.
	 *
	 * @param int $post_id Post identifier.
	 */
	private function transient_key( int $post_id ): string {
		return self::TRANSIENT . get_current_user_id() . '_' . $post_id;
	}

	/**
	 * Asset helper from the container.
	 */
	private function assets(): Assets {
		$assets = $this->plugin->container()->get( 'assets' );

		return $assets instanceof Assets ? $assets : new Assets();
	}
}
