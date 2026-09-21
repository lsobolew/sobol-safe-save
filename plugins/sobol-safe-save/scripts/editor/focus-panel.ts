/**
 * Draws the user's attention to the document panel after the warning's Details action opens it.
 */

const PANEL_SELECTOR = '.sobol-safe-save-panel';
const PANEL_TOGGLE_SELECTOR = 'button[aria-expanded]';
const ATTENTION_CLASS = 'sobol-safe-save-panel--attention';
const MAX_ATTEMPTS = 12;

function focusPanelWhenReady( attempt = 0 ): void {
	const panel = document.querySelector<HTMLElement>( PANEL_SELECTOR );
	const toggle = panel?.querySelector<HTMLButtonElement>( PANEL_TOGGLE_SELECTOR );

	if ( panel && toggle ) {
		panel.classList.remove( ATTENTION_CLASS );
		// Restart the animation when Details is clicked more than once.
		void panel.offsetWidth;
		panel.classList.add( ATTENTION_CLASS );
		toggle.focus();

		window.setTimeout( () => panel.classList.remove( ATTENTION_CLASS ), 1600 );
		return;
	}

	if ( attempt < MAX_ATTEMPTS ) {
		window.requestAnimationFrame( () => focusPanelWhenReady( attempt + 1 ) );
	}
}

/** Focuses and briefly highlights the panel after the sidebar has rendered it. */
export function focusSobolSafeSavePanel(): void {
	window.requestAnimationFrame( () => focusPanelWhenReady() );
}
