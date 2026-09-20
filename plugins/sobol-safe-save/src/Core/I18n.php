<?php
/**
 * Translation loading.
 *
 * @package Sobolewski\SobolSafeSave
 */

declare( strict_types=1 );

namespace Sobolewski\SobolSafeSave\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Deliberately does nothing.
 *
 * Since WordPress 4.6 a plugin hosted on WordPress.org gets its translations loaded automatically,
 * and calling load_plugin_textdomain() yourself is reported by Plugin Check. The class stays so the
 * boot sequence has a place to hook into, and so a plugin distributed outside the directory - where
 * the call is still needed - has an obvious home for it:
 *
 *     load_plugin_textdomain( 'sobol-safe-save', false, dirname( SOBOL_SAFE_SAVE_BASENAME ) . '/languages' );
 */
final class I18n {

	/**
	 * Nothing to do: WordPress.org ships the translations.
	 */
	public function load(): void {
	}
}
