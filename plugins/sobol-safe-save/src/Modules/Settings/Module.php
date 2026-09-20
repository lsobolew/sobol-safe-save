<?php
/**
 * Module: settings screen in the admin.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Modules\Settings;

use Sobolewski\SobolSafeSave\Core\ActivationAware;
use Sobolewski\SobolSafeSave\Core\Module as ModuleContract;
use Sobolewski\SobolSafeSave\Core\Plugin;
use Sobolewski\SobolSafeSave\Core\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Adds a settings page built on the Settings API.
 *
 * Removing this module only takes away the UI - the values and defaults keep living in
 * Sobolewski\SobolSafeSave\Core\Settings.
 */
final class Module implements ModuleContract, ActivationAware {

	/**
	 * Seeds the defaults, so the settings screen opens on a filled-in form rather than an empty
	 * one. Only this module reads the option, so only this module creates it.
	 */
	public static function on_activate(): void {
		if ( false === get_option( Settings::OPTION, false ) ) {
			add_option( Settings::OPTION, Settings::defaults() );
		}
	}

	/**
	 * Settings are user data: deactivating is not deleting. uninstall.php removes them.
	 */
	public static function on_deactivate(): void {
	}

	/**
	 * Admin page slug.
	 */
	const PAGE_SLUG = 'sobol-safe-save';

	/**
	 * Capability required to manage the settings.
	 */
	const CAPABILITY = 'manage_options';

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
		return 'settings';
	}

	/**
	 * Module hooks.
	 */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu_page' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_filter( 'plugin_action_links_' . SOBOL_SAFE_SAVE_BASENAME, array( $this, 'add_action_link' ) );
	}

	/**
	 * Adds the entry under the Settings menu.
	 */
	public function add_menu_page(): void {
		add_options_page(
			__( 'Sobol Safe Save', 'sobol-safe-save' ),
			__( 'Sobol Safe Save', 'sobol-safe-save' ),
			self::CAPABILITY,
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Adds a "Settings" shortcut on the plugins list.
	 *
	 * @param string[] $links Existing links.
	 *
	 * @return string[]
	 */
	public function add_action_link( $links ): array {
		$links = is_array( $links ) ? $links : array();

		$settings_link = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'options-general.php?page=' . self::PAGE_SLUG ) ),
			esc_html__( 'Settings', 'sobol-safe-save' )
		);

		array_unshift( $links, $settings_link );

		return $links;
	}

	/**
	 * Registers the option, the section and the fields.
	 */
	public function register_settings(): void {
		register_setting(
			Settings::GROUP,
			Settings::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( Settings::class, 'sanitize' ),
				'default'           => Settings::defaults(),
				'show_in_rest'      => false,
			)
		);

		add_settings_section(
			'sobol_safe_save_general',
			__( 'What to check', 'sobol-safe-save' ),
			static function () {
				echo '<p>' . esc_html__(
					'Sobol Safe Save warns people before they save content that WordPress is about to change. It never blocks a save.',
					'sobol-safe-save'
				) . '</p>';
			},
			self::PAGE_SLUG
		);

		add_settings_field(
			'post_types',
			__( 'Post types', 'sobol-safe-save' ),
			array( $this, 'render_post_types' ),
			self::PAGE_SLUG,
			'sobol_safe_save_general',
			array( 'key' => 'post_types' )
		);

		add_settings_field(
			'check_title',
			__( 'Title', 'sobol-safe-save' ),
			array( $this, 'render_checkbox' ),
			self::PAGE_SLUG,
			'sobol_safe_save_general',
			array(
				'key'         => 'check_title',
				'description' => __( 'Check the post title as well.', 'sobol-safe-save' ),
			)
		);

		add_settings_field(
			'check_excerpt',
			__( 'Excerpt', 'sobol-safe-save' ),
			array( $this, 'render_checkbox' ),
			self::PAGE_SLUG,
			'sobol_safe_save_general',
			array(
				'key'         => 'check_excerpt',
				'description' => __( 'Check the excerpt as well.', 'sobol-safe-save' ),
			)
		);

		add_settings_field(
			'debounce_ms',
			__( 'Delay', 'sobol-safe-save' ),
			array( $this, 'render_debounce' ),
			self::PAGE_SLUG,
			'sobol_safe_save_general',
			array( 'key' => 'debounce_ms' )
		);
	}

	/**
	 * Renders the debounce field.
	 *
	 * @param array<string, string> $args Field arguments.
	 */
	public function render_debounce( $args ): void {
		$key = (string) ( $args['key'] ?? 'debounce_ms' );

		printf(
			'<input type="number" min="200" max="5000" step="100" class="small-text" name="%1$s[%2$s]" value="%3$s" /> %4$s<p class="description">%5$s</p>',
			esc_attr( Settings::OPTION ),
			esc_attr( $key ),
			esc_attr( (string) Settings::debounce_ms() ),
			esc_html__( 'milliseconds', 'sobol-safe-save' ),
			esc_html__( 'How long typing has to stop before the content is checked.', 'sobol-safe-save' )
		);
	}

	/**
	 * Renders a checkbox field.
	 *
	 * The hidden input before it is not decoration. A browser sends nothing at all for an unticked
	 * checkbox, so the key would be missing from the submitted array, and Settings::sanitize()
	 * reads a missing key as "keep the default" - which for a setting that defaults to on means it
	 * could be switched on but never off. The hidden field makes "off" an explicit 0.
	 *
	 * @param array<string, string> $args Field arguments.
	 */
	public function render_checkbox( $args ): void {
		$key   = (string) ( $args['key'] ?? '' );
		$value = (bool) Settings::get( $key, false );

		printf(
			'<input type="hidden" name="%1$s[%2$s]" value="0" />' .
			'<label><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s /> %4$s</label>',
			esc_attr( Settings::OPTION ),
			esc_attr( $key ),
			checked( $value, true, false ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- checked() returns a safe attribute string.
			esc_html( (string) ( $args['description'] ?? '' ) )
		);
	}

	/**
	 * Renders the post type checkboxes.
	 *
	 * Ticking nothing means every post type with an editor, including ones registered later. That
	 * is both the default and the useful answer, so it is stated on screen rather than left to be
	 * discovered.
	 *
	 * @param array<string, string> $args Field arguments.
	 */
	public function render_post_types( $args ): void {
		$key      = (string) ( $args['key'] ?? 'post_types' );
		$selected = array_map( 'strval', (array) Settings::get( $key, array() ) );

		echo '<fieldset>';

		foreach ( Settings::available_post_types() as $type ) {
			$object = get_post_type_object( $type );
			$label  = $object && isset( $object->labels->name ) ? (string) $object->labels->name : $type;

			printf(
				'<label style="display:block"><input type="checkbox" name="%1$s[%2$s][]" value="%3$s" %4$s /> %5$s</label>',
				esc_attr( Settings::OPTION ),
				esc_attr( $key ),
				esc_attr( $type ),
				checked( in_array( $type, $selected, true ), true, false ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- checked() returns a safe attribute string.
				esc_html( $label )
			);
		}

		printf(
			'<p class="description">%s</p>',
			esc_html__( 'Leave all unticked to check every post type that has an editor.', 'sobol-safe-save' )
		);

		echo '</fieldset>';
	}

	/**
	 * Renders the settings page.
	 */
	public function render_page(): void {
		// Belt and braces: WordPress checks the capability when adding the page, but the callback
		// can also be reached directly.
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'You are not allowed to access this page.', 'sobol-safe-save' ) );
		}

		?>
		<div class="wrap" id="sobol-safe-save-settings">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<form action="options.php" method="post">
				<?php
				// settings_fields() prints the nonce and the option_page field - without it the
				// save request is rejected.
				settings_fields( Settings::GROUP );
				do_settings_sections( self::PAGE_SLUG );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}
