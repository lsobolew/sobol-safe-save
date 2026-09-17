import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, RangeControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import ServerSideRender from '@wordpress/server-side-render';

import metadata from './block.json';

interface Attributes {
	limit: number;
}

interface EditProps {
	attributes: Attributes;
	setAttributes: ( next: Partial< Attributes > ) => void;
}

export default function Edit( { attributes, setAttributes }: EditProps ) {
	const blockProps = useBlockProps();

	return (
		<div { ...blockProps }>
			<InspectorControls>
				<PanelBody title={ __( 'List settings', 'my-plugin' ) }>
					<RangeControl
						label={ __( 'Number of items', 'my-plugin' ) }
						value={ attributes.limit }
						onChange={ ( limit?: number ) => setAttributes( { limit } ) }
						min={ 1 }
						max={ 20 }
					/>
				</PanelBody>
			</InspectorControls>

			{ /* The editor shows the very markup PHP will produce, so there is no second
			     implementation of the output to keep in sync. */ }
			<ServerSideRender block={ metadata.name } attributes={ attributes } />
		</div>
	);
}
