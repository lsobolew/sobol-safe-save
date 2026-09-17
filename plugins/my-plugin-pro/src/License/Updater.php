<?php
/**
 * Updates for an add-on distributed outside the WordPress.org directory.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\License;

defined( 'ABSPATH' ) || exit;

/**
 * Plugs the add-on into the native WordPress update mechanism.
 *
 * It uses the `update_plugins_{$hostname}` filter (WP 5.8+) instead of overwriting the whole
 * `update_plugins` transient. The filter only covers plugins whose header carries an `Update URI`
 * on our host, so there is no way to accidentally replace another plugin's update - a very real
 * risk when hand-editing that transient.
 */
final class Updater {

	/**
	 * Host used in the add-on Update URI header.
	 */
	const UPDATE_HOST = 'example.com';

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
	 * Update hooks.
	 */
	public function register(): void {
		add_filter( 'update_plugins_' . self::UPDATE_HOST, array( $this, 'check_for_update' ), 10, 3 );
		add_filter( 'plugins_api', array( $this, 'plugin_information' ), 10, 3 );
	}

	/**
	 * Tells WordPress whether a newer version of the add-on exists.
	 *
	 * @param array<string, mixed>|false $update      Update data from another filter.
	 * @param array<string, mixed>       $plugin_data Plugin headers.
	 * @param string                     $plugin_file Plugin path relative to the plugins directory.
	 *
	 * @return array<string, mixed>|false
	 */
	public function check_for_update( $update, $plugin_data, $plugin_file ) {
		if ( MY_PLUGIN_PRO_BASENAME !== $plugin_file ) {
			return $update;
		}

		if ( ! $this->license->is_valid() ) {
			return $update;
		}

		$release = $this->license->provider()->latest_release(
			$this->license->key(),
			$this->license->site_url()
		);

		$version = (string) ( $release['version'] ?? '' );
		$package = (string) ( $release['package'] ?? '' );

		if ( '' === $version || '' === $package ) {
			return $update;
		}

		if ( version_compare( $version, MY_PLUGIN_PRO_VERSION, '<=' ) ) {
			return $update;
		}

		return array(
			'slug'         => dirname( MY_PLUGIN_PRO_BASENAME ),
			'version'      => $version,
			'package'      => $package,
			'requires'     => (string) ( $release['requires'] ?? '' ),
			'requires_php' => (string) ( $release['requires_php'] ?? '' ),
			'tested'       => (string) ( $release['tested'] ?? '' ),
		);
	}

	/**
	 * Fills in the "View details" modal on the plugins screen.
	 *
	 * @param mixed  $result Current result.
	 * @param string $action API action name.
	 * @param object $args   Request arguments.
	 *
	 * @return mixed
	 */
	public function plugin_information( $result, $action, $args ) {
		if ( 'plugin_information' !== $action ) {
			return $result;
		}

		$slug = isset( $args->slug ) ? (string) $args->slug : '';

		if ( dirname( MY_PLUGIN_PRO_BASENAME ) !== $slug ) {
			return $result;
		}

		$release = $this->license->provider()->latest_release(
			$this->license->key(),
			$this->license->site_url()
		);

		if ( empty( $release['version'] ) ) {
			return $result;
		}

		return (object) array(
			'name'          => 'My Plugin Pro',
			'slug'          => $slug,
			'version'       => (string) $release['version'],
			'requires'      => (string) ( $release['requires'] ?? '' ),
			'requires_php'  => (string) ( $release['requires_php'] ?? '' ),
			'tested'        => (string) ( $release['tested'] ?? '' ),
			'download_link' => (string) ( $release['package'] ?? '' ),
			'sections'      => array(
				'description' => (string) ( $release['description'] ?? '' ),
				'changelog'   => (string) ( $release['changelog'] ?? '' ),
			),
		);
	}
}
