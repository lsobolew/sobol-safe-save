import { useBlockProps, useInnerBlocksProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import type { ToneOption } from '../shared/types';

interface SectionAttributes {
	tone: string;
}

interface SectionEditProps {
	attributes: SectionAttributes;
	setAttributes: ( next: Partial< SectionAttributes > ) => void;
}

/** What editors may drop inside, and what the section starts out with. */
const ALLOWED_BLOCKS = [ 'core/heading', 'core/paragraph', 'core/image', 'my-plugin/callout' ];

const TEMPLATE: Array< [ string, Record< string, unknown > ] > = [
	[ 'core/heading', { level: 3, placeholder: __( 'Section title', 'my-plugin' ) } ],
	[ 'core/paragraph', { placeholder: __( 'Section content…', 'my-plugin' ) } ],
];

const TONE_OPTIONS: ToneOption[] = [
	{ label: __( 'Plain', 'my-plugin' ), value: 'plain' },
	{ label: __( 'Muted', 'my-plugin' ), value: 'muted' },
];

export default function Edit( { attributes, setAttributes }: SectionEditProps ) {
	const blockProps = useBlockProps( { className: `is-tone-${ attributes.tone }` } );

	// useInnerBlocksProps merges the wrapper props with the inner block list, so the section is a
	// single element rather than a wrapper around another wrapper.
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: ALLOWED_BLOCKS,
		template: TEMPLATE,
	} );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Section settings', 'my-plugin' ) }>
					<SelectControl
						label={ __( 'Tone', 'my-plugin' ) }
						value={ attributes.tone }
						options={ TONE_OPTIONS }
						onChange={ ( tone: string ) => setAttributes( { tone } ) }
					/>
				</PanelBody>
			</InspectorControls>

			<div { ...innerBlocksProps } />
		</>
	);
}
