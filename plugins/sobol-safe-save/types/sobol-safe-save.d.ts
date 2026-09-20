/**
 * Values the plugin's PHP prints before its scripts run, and the classic editor's TinyMCE.
 *
 * Declared in one place because both entry points see the same `window`: two `declare global`
 * blocks for the same property, one per script, is a type error rather than a merge.
 *
 * Note the `export {}` at the bottom, which makes this file a module - and therefore makes every
 * name in it local unless it sits inside `declare global`. That is why the TinyMCE interface is
 * declared in there too rather than beside it.
 */
declare global {
	/** A TinyMCE instance, narrowed to what the classic editor script uses. */
	interface SobolSafeSaveTinyMceEditor {
		id: string;
		getContent: () => string;
		isHidden?: () => boolean;
		on: ( events: string, handler: () => void ) => void;
	}

	interface Window {
		sobolSafeSave?: {
			/** Printed by Modules\Editor\Module for the block editor. */
			settings?: { debounceMs?: number };
			/** Printed by Modules\Classic\Module for the classic editor. */
			classic?: { debounceMs?: number; postId?: number; postType?: string };
		};

		tinymce?: {
			get: ( id: string ) => SobolSafeSaveTinyMceEditor | null;
			on?: ( event: string, handler: ( e: { editor: SobolSafeSaveTinyMceEditor } ) => void ) => void;
		};
	}
}

export {};
