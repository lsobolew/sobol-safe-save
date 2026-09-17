import { useBlockProps, RichText, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import type { ToneOption } from '../shared/types';

import type { CalloutEditProps } from './types';

const TONE_OPTIONS: ToneOption[] = [
	{ label: __( 'Information', 'my-plugin' ), value: 'info' },
	{ label: __( 'Warning', 'my-plugin' ), value: 'warning' },
];

export default function Edit( { attributes, setAttributes }: CalloutEditProps ) {
	const { message, tone } = attributes;
	const blockProps = useBlockProps( { className: `is-tone-${ tone }` } );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Callout settings', 'my-plugin' ) }>
					<SelectControl
						label={ __( 'Tone', 'my-plugin' ) }
						value={ tone }
						options={ TONE_OPTIONS }
						onChange={ ( next: string ) => setAttributes( { tone: next } ) }
					/>
				</PanelBody>
			</InspectorControls>

			<div { ...blockProps }>
				<RichText
					tagName="p"
					value={ message }
					onChange={ ( next: string ) => setAttributes( { message: next } ) }
					placeholder={ __( 'Write your callout here…', 'my-plugin' ) }
				/>
			</div>
		</>
	);
}
