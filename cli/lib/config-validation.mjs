import { UserError } from './log.mjs';

/** Validate the JSON Schema keywords used by our bundled configuration schemas. */
export function validateSchema( value, schema, location = 'configuration' ) {
	const fail = ( message ) => { throw new UserError( `${ location }: ${ message }` ); };
	const kind = Array.isArray( value ) ? 'array' : value === null ? 'null' : typeof value;
	if ( schema.type && ( schema.type === 'integer' ? ! Number.isInteger( value ) : kind !== schema.type ) ) fail( `expected ${ schema.type }` );
	if ( schema.enum && ! schema.enum.includes( value ) ) fail( `expected one of ${ schema.enum.join( ', ' ) }` );
	if ( schema.pattern && ! new RegExp( schema.pattern ).test( value ) ) fail( `must match ${ schema.pattern }` );
	if ( schema.minimum !== undefined && value < schema.minimum ) fail( `minimum is ${ schema.minimum }` );
	if ( schema.maximum !== undefined && value > schema.maximum ) fail( `maximum is ${ schema.maximum }` );
	if ( kind === 'array' ) {
		if ( value.length < ( schema.minItems || 0 ) ) fail( 'must not be empty' );
		if ( schema.uniqueItems && new Set( value.map( ( item ) => JSON.stringify( item ) ) ).size !== value.length ) fail( 'duplicate entries' );
		if ( schema.items ) value.forEach( ( item, index ) => validateSchema( item, schema.items, `${ location }[${ index }]` ) );
	}
	if ( kind === 'object' ) {
		for ( const key of schema.required || [] ) if ( ! Object.hasOwn( value, key ) ) fail( `missing ${ key }` );
		for ( const [ key, item ] of Object.entries( value ) ) {
			if ( key.startsWith( '//' ) ) continue;
			const rule = schema.properties?.[ key ] ?? schema.additionalProperties;
			if ( rule === false ) fail( `unknown field ${ key }` );
			if ( rule && typeof rule === 'object' ) validateSchema( item, rule, `${ location }.${ key }` );
		}
	}
}

export function validateCompatibility( starter, matrix ) {
	const fail = ( message ) => { throw new UserError( `wp-matrix.json: ${ message }` ); };
	const ids = new Set();
	const ports = new Set();
	for ( const target of matrix.targets ) {
		if ( ids.has( target.id ) ) fail( `duplicate target ${ target.id }` );
		ids.add( target.id );
		if ( ports.has( target.port ) ) fail( `duplicate port ${ target.port }` );
		ports.add( target.port );
	}
	for ( const port of Object.values( { dashboard: 7777, mailpitUi: 8025, database: 13306, ...matrix.ports } ) ) {
		if ( ports.has( port ) ) fail( `duplicate port ${ port }` );
		ports.add( port );
	}
	const minimum = matrix.targets.find( ( target ) => target.id === 'min' );
	if ( minimum && minimum.wp !== starter.requiresWp ) fail( `min.wp must match starter.requiresWp (${ starter.requiresWp })` );
	if ( minimum && minimum.php !== starter.requiresPhp ) fail( `min.php must match starter.requiresPhp (${ starter.requiresPhp })` );
	for ( const edition of matrix.editions || [] ) {
		if ( ! starter.editions[ edition ]?.enabled ) fail( `edition ${ edition } is not enabled in starter.json` );
	}
	const themes = matrix.themes;
	if ( themes ) {
		const names = new Set( themes.available.map( ( theme ) => theme.slug ) );
		if ( names.size !== themes.available.length ) fail( 'duplicate theme slug' );
		for ( const slug of [ themes.default, ...( themes.sweep?.themes || [] ) ] ) {
			if ( ! names.has( slug ) ) fail( `unknown theme ${ slug }` );
		}
		for ( const id of themes.sweep?.targets || [] ) if ( ! ids.has( id ) ) fail( `unknown sweep target ${ id }` );
		const defaultTheme = themes.available.find( ( theme ) => theme.slug === themes.default );
		if ( minimum && defaultTheme?.requiresWp && compareVersions( minimum.wp, defaultTheme.requiresWp ) < 0 ) {
			fail( `default theme ${ defaultTheme.slug } requires WordPress ${ defaultTheme.requiresWp }, above min.wp` );
		}
	}
}

function compareVersions( left, right ) {
	const a = left.split( '.' ).map( Number );
	const b = right.split( '.' ).map( Number );
	for ( let i = 0; i < Math.max( a.length, b.length ); i++ ) {
		const difference = ( a[ i ] || 0 ) - ( b[ i ] || 0 );
		if ( difference ) return difference;
	}
	return 0;
}
