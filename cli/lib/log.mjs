const useColor = process.stdout.isTTY && ! process.env.NO_COLOR;
const wrap = ( code ) => ( s ) =>
	useColor ? `\x1b[${ code }m${ s }\x1b[0m` : String( s );

export const c = {
	dim: wrap( '2' ),
	bold: wrap( '1' ),
	red: wrap( '31' ),
	green: wrap( '32' ),
	yellow: wrap( '33' ),
	blue: wrap( '34' ),
	magenta: wrap( '35' ),
	cyan: wrap( '36' ),
};

export const log = {
	info: ( ...a ) => console.log( ...a ),
	step: ( msg ) => console.log( `${ c.cyan( '>' ) } ${ msg }` ),
	ok: ( msg ) => console.log( `${ c.green( 'OK' ) } ${ msg }` ),
	warn: ( msg ) => console.log( `${ c.yellow( '!' ) } ${ msg }` ),
	fail: ( msg ) => console.log( `${ c.red( 'x' ) } ${ msg }` ),
	dim: ( msg ) => console.log( c.dim( msg ) ),
	blank: () => console.log( '' ),
};

/** An error with a human-readable message - the CLI prints no stack trace for these. */
export class UserError extends Error {}
