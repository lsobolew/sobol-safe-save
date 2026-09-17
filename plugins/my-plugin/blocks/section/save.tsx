import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

interface SectionSaveProps {
	attributes: { tone: string };
}

export default function save( { attributes }: SectionSaveProps ) {
	const blockProps = useBlockProps.save( { className: `is-tone-${ attributes.tone }` } );
	const innerBlocksProps = useInnerBlocksProps.save( blockProps );

	return <div { ...innerBlocksProps } />;
}
