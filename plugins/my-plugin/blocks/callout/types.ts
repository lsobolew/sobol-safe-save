export interface CalloutAttributes {
	message: string;
	tone: string;
}

export interface CalloutEditProps {
	attributes: CalloutAttributes;
	setAttributes: ( next: Partial< CalloutAttributes > ) => void;
}

export interface CalloutSaveProps {
	attributes: CalloutAttributes;
}
