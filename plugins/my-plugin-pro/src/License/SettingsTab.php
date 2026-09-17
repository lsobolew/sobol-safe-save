<?php
/**
 * Licence section on the free plugin settings screen.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\License;

use MyVendor\MyPlugin\Core\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * The add-on does not add its own menu entry - it appends a section to the free plugin screen.
 *
 * The licence field is part of the SAME Settings API form as the rest of the settings. A separate
 * <form> here would be nested inside the options.php form; browsers split such markup apart, which
 * breaks saving the licence and saving every other setting alike.
 */
final class SettingsTab {

	/**
	 * Slug of the free plugin settings page.
	 */
	const PAGE_SLUG = 'my-plugin';

	/**
	 * Licence manager.
	 *
	 * @var LicenseManager
	 */
	private $license;

	/**
	 * Constructor.
	 *
	 * @param LicenseManager $license Licence manager.
	 */
	public function __construct( LicenseManager $license ) {
		$this->license = $license;
	}

	/**
	 * Section hooks.
	 */
	public function register(): void {
		add_action( 'admin_init', array( $this, 'register_section' ) );
	}

	/**
	 * Registers the licence option inside the free plugin settings group.
	 */
	public function register_section(): void {
		register_setting(
			Settings::GROUP,
			LicenseManager::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize' ),
				'show_in_rest'      => false,
			)
		);

		add_settings_section(
			'my_plugin_pro_license',
			__( 'Pro licence', 'my-plugin-pro' ),
			array( $this, 'render_status' ),
			self::PAGE_SLUG
		);

		add_settings_field(
			'license_key',
			__( 'Licence key', 'my-plugin-pro' ),
			array( $this, 'render_field' ),
			self::PAGE_SLUG,
			'my_plugin_pro_license'
		);
	}

	/**
	 * Section description showing the licence status.
	 */
	public function render_status(): void {
		$data   = $this->license->data();
		$labels = array(
			'valid'    => __( 'active', 'my-plugin-pro' ),
			'expired'  => __( 'expired', 'my-plugin-pro' ),
			'invalid'  => __( 'invalid', 'my-plugin-pro' ),
			'inactive' => __( 'no key', 'my-plugin-pro' ),
			'unknown'  => __( 'unknown (licence server unreachable)', 'my-plugin-pro' ),
		);

		printf(
			'<p id="my-plugin-pro-license-status">%s</p>',
			sprintf(
				/* translators: %s: licence status */
				esc_html__( 'Licence status: %s', 'my-plugin-pro' ),
				'<strong>' . esc_html( $labels[ $data['status'] ] ?? $data['status'] ) . '</strong>'
			)
		);

		if ( '' !== $data['message'] ) {
			printf( '<p class="description">%s</p>', esc_html( $data['message'] ) );
		}
	}

	/**
	 * Renders the licence key field.
	 */
	public function render_field(): void {
		printf(
			'<input type="text" class="regular-text" id="my-plugin-pro-license-key" name="%1$s[key]" value="%2$s" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" />',
			esc_attr( LicenseManager::OPTION ),
			esc_attr( $this->license->key() )
		);

		printf(
			'<p class="description">%s</p>',
			esc_html__(
				'Save the key to activate the licence. Clearing the field releases the licence from this site.',
				'my-plugin-pro'
			)
		);
	}

	/**
	 * Sanitizes the licence field and activates or releases the key along the way.
	 *
	 * @param mixed $input Form data.
	 *
	 * @return array<string, mixed>
	 */
	public function sanitize( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$key   = isset( $input['key'] ) ? (string) $input['key'] : '';

		// An unchanged key never touches the licence server - saving settings must not cost an
		// HTTP round trip on every click of "Save changes".
		if ( trim( $key ) === $this->license->key() ) {
			return $this->license->data();
		}

		return $this->license->resolve( $key );
	}
}
