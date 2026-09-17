/**
 * The "Item list" block.
 *
 * The block is dynamic: `save` returns null and PHP renders the markup. That way changing the
 * output never invalidates content already stored in posts (no "block validation error").
 */
import { registerBlockType } from '@wordpress/blocks';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, RangeControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import ServerSideRender from '@wordpress/server-side-render';

import metadata from './block.json';
import './style.scss';
import './editor.scss';

registerBlockType( metadata.name, {
	edit( { attributes, setAttributes } ) {
		const blockProps = useBlockProps();

		return (
			<div { ...blockProps }>
				<InspectorControls>
					<PanelBody title={ __( 'List settings', 'my-plugin' ) }>
						<RangeControl
							label={ __( 'Number of items', 'my-plugin' ) }
							value={ attributes.limit }
							onChange={ ( limit ) => setAttributes( { limit } ) }
							min={ 1 }
							max={ 20 }
						/>
					</PanelBody>
				</InspectorControls>

				<ServerSideRender block={ metadata.name } attributes={ attributes } />
			</div>
		);
	},

	save() {
		return null;
	},
} );
