<?php
/**
 * Tiny service container.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

namespace MyVendor\MyPlugin\Core;

use RuntimeException;

defined( 'ABSPATH' ) || exit;

/**
 * Lazy container: factories run on first access, the result is then shared.
 */
final class Container {

	/**
	 * Service factories.
	 *
	 * @var array<string, callable>
	 */
	private $factories = array();

	/**
	 * Built instances.
	 *
	 * @var array<string, mixed>
	 */
	private $instances = array();

	/**
	 * Registers a service factory.
	 *
	 * @param string   $id      Service identifier.
	 * @param callable $factory Factory receiving the container.
	 */
	public function set( string $id, callable $factory ): void {
		$this->factories[ $id ] = $factory;
		unset( $this->instances[ $id ] );
	}

	/**
	 * Whether a service is registered.
	 *
	 * @param string $id Service identifier.
	 */
	public function has( string $id ): bool {
		return isset( $this->factories[ $id ] ) || array_key_exists( $id, $this->instances );
	}

	/**
	 * Returns a service, building it on first use.
	 *
	 * @param string $id Service identifier.
	 *
	 * @return mixed
	 * @throws RuntimeException When the service is not registered.
	 */
	public function get( string $id ) {
		if ( array_key_exists( $id, $this->instances ) ) {
			return $this->instances[ $id ];
		}

		if ( ! isset( $this->factories[ $id ] ) ) {
			throw new RuntimeException(
				esc_html( sprintf( 'Service "%s" is not registered.', $id ) )
			);
		}

		$this->instances[ $id ] = ( $this->factories[ $id ] )( $this );

		return $this->instances[ $id ];
	}
}
