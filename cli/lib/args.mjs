/**
 * Minimal parser: --flag, --key=value, --key value, -k and positional arguments.
 * Everything after "--" goes into `rest` (passed through to wp-cli, for example).
 */
export function parseArgs( argv, { booleans = [] } = {} ) {
	const positional = [];
	const flags = {};
	let rest = null;

	for ( let i = 0; i < argv.length; i++ ) {
		const arg = argv[ i ];

		if ( arg === '--' ) {
			rest = argv.slice( i + 1 );
			break;
		}

		if ( arg.startsWith( '--' ) ) {
			const body = arg.slice( 2 );
			const eq = body.indexOf( '=' );
			if ( eq !== -1 ) {
				flags[ body.slice( 0, eq ) ] = body.slice( eq + 1 );
				continue;
			}
			if ( booleans.includes( body ) || ! argv[ i + 1 ] || argv[ i + 1 ].startsWith( '-' ) ) {
				flags[ body ] = true;
				continue;
			}
			flags[ body ] = argv[ ++i ];
			continue;
		}

		if ( arg.startsWith( '-' ) && arg.length > 1 ) {
			for ( const ch of arg.slice( 1 ) ) flags[ ch ] = true;
			continue;
		}

		positional.push( arg );
	}

	return { positional, flags, rest };
}

/** Turns "--targets=a,b" into a list. */
export function listFlag( value ) {
	if ( ! value || value === true ) return [];
	return String( value )
		.split( ',' )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
}
