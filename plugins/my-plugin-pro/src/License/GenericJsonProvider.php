<?php
/**
 * Default licence provider: a custom JSON endpoint.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\License;

defined( 'ABSPATH' ) || exit;

/**
 * Talks to any backend that accepts a POST and answers with JSON:
 *
 *   POST {endpoint}  { action, license_key, site_url, product, version }
 *   200 { "status": "valid|invalid|expired", "expires": "2027-01-01", "message": "...",
 *         "version": "1.2.0", "package": "https://.../my-plugin-pro-1.2.0.zip",
 *         "changelog": "...", "requires": "6.6", "tested": "7.1" }
 *
 * The endpoint is swappable through the `myplugin_pro_license_endpoint` filter and the whole
 * provider through `myplugin_pro_license_provider`, so wiring up EDD or Lemon Squeezy is one class.
 */
final class GenericJsonProvider implements Provider {

	/**
	 * Default licence backend URL.
	 */
	const DEFAULT_ENDPOINT = 'https://example.com/wp-json/licenses/v1/';

	/**
	 * Product identifier on the store side.
	 */
	const PRODUCT = 'my-plugin-pro';

	/**
	 * {@inheritDoc}
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 */
	public function activate( string $key, string $site_url ): array {
		return $this->request( 'activate', $key, $site_url );
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 */
	public function deactivate( string $key, string $site_url ): array {
		return $this->request( 'deactivate', $key, $site_url );
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 */
	public function check( string $key, string $site_url ): array {
		return $this->request( 'check', $key, $site_url );
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 */
	public function latest_release( string $key, string $site_url ): array {
		return $this->request( 'release', $key, $site_url );
	}

	/**
	 * Performs the request and normalizes the response.
	 *
	 * @param string $action   Action name.
	 * @param string $key      Licence key.
	 * @param string $site_url Site URL.
	 *
	 * @return array<string, mixed>
	 */
	private function request( string $action, string $key, string $site_url ): array {
		/**
		 * Filters the licence backend URL.
		 *
		 * @param string $endpoint Endpoint URL.
		 */
		$endpoint = (string) apply_filters(
			'myplugin_pro_license_endpoint',
			self::DEFAULT_ENDPOINT
		);

		$response = wp_remote_post(
			$endpoint,
			array(
				'timeout' => 15,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'action'      => $action,
						'license_key' => $key,
						'site_url'    => $site_url,
						'product'     => self::PRODUCT,
						'version'     => MY_PLUGIN_PRO_VERSION,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return array(
				'status'  => 'unknown',
				'message' => $response->get_error_message(),
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( (string) wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $code || ! is_array( $body ) ) {
			return array(
				'status'  => 'unknown',
				'message' => sprintf(
					/* translators: %d: HTTP status code */
					__( 'The licence server answered with status %d.', 'my-plugin-pro' ),
					$code
				),
			);
		}

		return $body;
	}
}
