<?php
/**
 * Licence provider contract.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\License;

defined( 'ABSPATH' ) || exit;

/**
 * A thin layer over a concrete store (EDD Software Licensing, Lemon Squeezy, a custom backend).
 * Swapping providers never touches the rest of the add-on - the `myplugin_pro_license_provider`
 * filter is enough.
 */
interface Provider {

	/**
	 * Activates a key for this site.
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 *
	 * @return array<string, mixed> Normalized response: status, expires, message.
	 */
	public function activate( string $key, string $site_url ): array;

	/**
	 * Releases a key from this site.
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 *
	 * @return array<string, mixed>
	 */
	public function deactivate( string $key, string $site_url ): array;

	/**
	 * Checks the current state of a key.
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 *
	 * @return array<string, mixed>
	 */
	public function check( string $key, string $site_url ): array;

	/**
	 * Information about the latest release (version, package, changelog).
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 *
	 * @return array<string, mixed>
	 */
	public function latest_release( string $key, string $site_url ): array;
}
