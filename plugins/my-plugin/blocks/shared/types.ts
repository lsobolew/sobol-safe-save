/** A SelectControl option. Declared explicitly so the control's value stays a plain string
 * instead of being narrowed to the literals in one particular options array. */
export interface ToneOption {
	label: string;
	value: string;
}
