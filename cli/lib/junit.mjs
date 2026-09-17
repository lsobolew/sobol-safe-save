import fs from 'node:fs';
import path from 'node:path';
import { paths, ensureDir } from './paths.mjs';

/** Result file name for a given combination. */
export function resultFile( { target, edition, suite } ) {
	const parts = [ target, edition, suite ].filter( Boolean );
	return path.join( paths.results, `${ parts.join( '-' ) }.xml` );
}

/**
 * Pulls the summary out of a JUnit XML without an XML parser - we only care about the attributes
 * of the outermost <testsuites>/<testsuite> tag, and those always sit on a single line.
 */
export function readSummary( file ) {
	if ( ! fs.existsSync( file ) ) return null;

	const xml = fs.readFileSync( file, 'utf8' );

	// PHPUnit writes an empty <testsuites> and puts the counters on the first <testsuite>.
	// Playwright does the opposite. Take the first tag that actually carries a tests attribute.
	const match = xml.match( /<testsuites?\b[^>]*\btests="[^"]*"[^>]*>/ );
	if ( ! match ) return null;

	const attr = ( name ) => {
		const found = match[ 0 ].match( new RegExp( `${ name }="([^"]*)"` ) );
		return found ? found[ 1 ] : '0';
	};

	const tests = Number( attr( 'tests' ) );
	const failures = Number( attr( 'failures' ) );
	const errors = Number( attr( 'errors' ) );
	const skipped = Number( attr( 'skipped' ) );

	return {
		tests,
		failures,
		errors,
		skipped,
		time: Number( attr( 'time' ) ),
		passed: failures === 0 && errors === 0,
		updatedAt: fs.statSync( file ).mtimeMs,
	};
}

/** Every available result, keyed by file name. */
export function allSummaries() {
	ensureDir( paths.results );

	const out = {};
	for ( const name of fs.readdirSync( paths.results ) ) {
		if ( ! name.endsWith( '.xml' ) ) continue;
		const summary = readSummary( path.join( paths.results, name ) );
		if ( summary ) out[ name.replace( /\.xml$/, '' ) ] = summary;
	}
	return out;
}

/** Records the result of a suite that produces no JUnit XML of its own (the linters). */
export function writeSyntheticResult( { target, edition, suite, passed, output } ) {
	ensureDir( paths.results );
	const file = resultFile( { target, edition, suite } );
	const name = [ suite, target, edition ].filter( Boolean ).join( '.' );
	const failureNode = passed
		? ''
		: `<testcase name="${ name }"><failure type="error">${ escapeXml(
				output.slice( -4000 )
		  ) }</failure></testcase>`;
	const okNode = passed ? `<testcase name="${ name }"/>` : '';

	fs.writeFileSync(
		file,
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
			`<testsuites tests="1" failures="${ passed ? 0 : 1 }" errors="0" skipped="0" time="0">` +
			`<testsuite name="${ name }" tests="1" failures="${ passed ? 0 : 1 }" errors="0" skipped="0" time="0">` +
			okNode +
			failureNode +
			`</testsuite></testsuites>\n`
	);
	return file;
}

function escapeXml( value ) {
	return String( value )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}
