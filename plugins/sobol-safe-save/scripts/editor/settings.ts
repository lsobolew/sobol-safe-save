/**
 * Values the server passes to this script.
 *
 * Printed as `window.sobolSafeSave.settings` by Modules\Editor\Module before the script runs.
 */

/** Used when the inline script is missing, which is what happens in a unit test or a stale cache. */
const DEFAULT_DEBOUNCE_MS = 800;

/** How long typing has to stop before the content is checked. */
export function debounceMs(): number {
	const value = window.sobolSafeSave?.settings?.debounceMs;

	return typeof value === 'number' && value > 0 ? value : DEFAULT_DEBOUNCE_MS;
}
