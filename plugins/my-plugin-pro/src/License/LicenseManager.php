<?php
/**
 * Licence key handling.
 *
 * @package MyVendor\MyPluginPro
 */

declare( strict_types=1 );

namespace MyVendor\MyPluginPro\License;

defined( 'ABSPATH' ) || exit;

/**
 * Stores the key and the licence state, and talks to the provider.
 *
 * The verification result is cached in a transient - without it every admin page load would mean
 * an outbound HTTP request and a visibly slower admin.
 *
 * Deliberately not `final`: the class is injected into Updater and has to be mockable in tests.
 */
class LicenseManager {

	/**
	 * Option holding the licence data.
	 */
	const OPTION = 'my_plugin_pro_license';

	/**
	 * Transient holding the last verification result.
	 */
	const TRANSIENT = 'my_plugin_pro_license_check';

	/**
	 * How long a remembered answer is trusted.
	 */
	const CACHE_TTL = 12 * HOUR_IN_SECONDS;

	/**
	 * Licence provider.
	 *
	 * @var Provider|null
	 */
	private $provider = null;

	/**
	 * Hooks up the licence settings UI.
	 */
	public function register(): void {
		( new SettingsTab( $this ) )->register();
	}

	/**
	 * The licence provider (swappable through a filter).
	 */
	public function provider(): Provider {
		if ( null === $this->provider ) {
			/**
			 * Filters the licence provider - this is where EDD, Lemon Squeezy or a custom backend
			 * gets plugged in.
			 *
			 * @param Provider $provider Default provider.
			 */
			$provider = apply_filters( 'myplugin_pro_license_provider', new GenericJsonProvider() );

			$this->provider = $provider instanceof Provider ? $provider : new GenericJsonProvider();
		}

		return $this->provider;
	}

	/**
	 * The stored licence data.
	 *
	 * @return array{key: string, status: string, expires: string, message: string}
	 */
	public function data(): array {
		$stored = get_option( self::OPTION, array() );
		$stored = is_array( $stored ) ? $stored : array();

		return array(
			'key'     => (string) ( $stored['key'] ?? '' ),
			'status'  => (string) ( $stored['status'] ?? 'inactive' ),
			'expires' => (string) ( $stored['expires'] ?? '' ),
			'message' => (string) ( $stored['message'] ?? '' ),
		);
	}

	/**
	 * The licence key.
	 */
	public function key(): string {
		return $this->data()['key'];
	}

	/**
	 * Whether the licence is valid (cache included).
	 */
	public function is_valid(): bool {
		return 'valid' === $this->status();
	}

	/**
	 * Licence status: valid, invalid, expired, inactive or unknown.
	 */
	public function status(): string {
		$data = $this->data();

		if ( '' === $data['key'] ) {
			return 'inactive';
		}

		$cached = get_transient( self::TRANSIENT );

		if ( is_string( $cached ) && '' !== $cached ) {
			return $cached;
		}

		$result = $this->provider()->check( $data['key'], $this->site_url() );
		$status = (string) ( $result['status'] ?? 'unknown' );

		// A failed server response is never turned into "invalid licence" - a temporary store
		// outage must not cut a paying customer off from updates. It is only cached briefly.
		set_transient(
			self::TRANSIENT,
			$status,
			'unknown' === $status ? HOUR_IN_SECONDS : self::CACHE_TTL
		);
		$this->store( array_merge( $data, $result, array( 'status' => $status ) ) );

		return $status;
	}

	/**
	 * Verifies a key with the provider and returns normalized data WITHOUT storing it.
	 *
	 * Separating the lookup from the write matters because calling update_option() inside the
	 * sanitize_callback of that very option means re-entering the same write.
	 *
	 * @param string $key Licence key ('' means deactivate).
	 *
	 * @return array{key: string, status: string, expires: string, message: string}
	 */
	public function resolve( string $key ): array {
		$key = trim( sanitize_text_field( $key ) );

		if ( '' === $key ) {
			$current = $this->data();

			if ( '' !== $current['key'] ) {
				$this->provider()->deactivate( $current['key'], $this->site_url() );
			}

			delete_transient( self::TRANSIENT );

			return array(
				'key'     => '',
				'status'  => 'inactive',
				'expires' => '',
				'message' => '',
			);
		}

		$result = $this->provider()->activate( $key, $this->site_url() );
		delete_transient( self::TRANSIENT );

		return array(
			'key'     => $key,
			'status'  => (string) ( $result['status'] ?? 'unknown' ),
			'expires' => (string) ( $result['expires'] ?? '' ),
			'message' => (string) ( $result['message'] ?? '' ),
		);
	}

	/**
	 * Activates a key for this site and stores the result.
	 *
	 * @param string $key Licence key.
	 *
	 * @return array<string, mixed>
	 */
	public function activate( string $key ): array {
		$key    = trim( sanitize_text_field( $key ) );
		$result = $this->provider()->activate( $key, $this->site_url() );

		$this->store(
			array(
				'key'     => $key,
				'status'  => (string) ( $result['status'] ?? 'unknown' ),
				'expires' => (string) ( $result['expires'] ?? '' ),
				'message' => (string) ( $result['message'] ?? '' ),
			)
		);
		delete_transient( self::TRANSIENT );

		return $result;
	}

	/**
	 * Releases the key from this site.
	 *
	 * @return array<string, mixed>
	 */
	public function deactivate(): array {
		$data   = $this->data();
		$result = '' === $data['key']
			? array( 'status' => 'inactive' )
			: $this->provider()->deactivate( $data['key'], $this->site_url() );

		$this->store(
			array(
				'key'     => '',
				'status'  => 'inactive',
				'expires' => '',
				'message' => (string) ( $result['message'] ?? '' ),
			)
		);
		delete_transient( self::TRANSIENT );

		return $result;
	}

	/**
	 * Site URL sent to the provider.
	 */
	public function site_url(): string {
		return (string) ( is_multisite() ? network_site_url() : home_url() );
	}

	/**
	 * Stores the licence data.
	 *
	 * @param array<string, mixed> $data Data to store.
	 */
	private function store( array $data ): void {
		update_option(
			self::OPTION,
			array(
				'key'     => (string) ( $data['key'] ?? '' ),
				'status'  => (string) ( $data['status'] ?? 'inactive' ),
				'expires' => (string) ( $data['expires'] ?? '' ),
				'message' => (string) ( $data['message'] ?? '' ),
			),
			false
		);
	}
}
