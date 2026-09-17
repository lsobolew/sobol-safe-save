import { registerBlockType } from '@wordpress/blocks';

import type { ComponentType } from 'react';

/**
 * Registers a block from its block.json metadata.
 *
 * This wrapper exists for one reason. The available type definitions for @wordpress/blocks
 * (DefinitelyTyped) still describe the pre-5.8 API, where every block passed its title, category
 * and attributes to registerBlockType() in JavaScript. Since block.json became the source of
 * truth, the call sites pass only the name plus the edit/save pair - which those types reject.
 *
 * Rather than scattering casts across every block, the mismatch is confined here, behind a
 * signature that describes what the blocks actually do. Everything on the other side of this
 * function stays strictly typed.
 *
 * When the WordPress packages start shipping their own types, delete this file and call
 * registerBlockType() directly.
 */

export interface BlockRegistration {
	/** The editor component. */
	edit: ComponentType< never > | ComponentType< any >; // eslint-disable-line @typescript-eslint/no-explicit-any
	/** Markup written to the post, or null for a block rendered by PHP. */
	save: ComponentType< any > | ( () => null ); // eslint-disable-line @typescript-eslint/no-explicit-any
	/** Earlier shapes of the block, newest first. */
	deprecated?: unknown[];
	/** Block variations, examples and the rest of the optional settings. */
	[ key: string ]: unknown;
}

export function registerBlock( name: string, settings: BlockRegistration ): void {
	( registerBlockType as unknown as ( n: string, s: BlockRegistration ) => void )(
		name,
		settings
	);
}
