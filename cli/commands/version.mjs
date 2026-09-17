import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../lib/args.mjs';
import { paths } from '../lib/paths.mjs';
import { starter } from '../lib/config.mjs';
import { resolveMatrix } from '../lib/matrix.mjs';
import { log, c, UserError } from '../lib/log.mjs';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * A plugin version is written down in half a dozen places and WordPress.org rejects releases where
 * the header and the readme disagree. This command keeps every copy in sync from one input.
 */
function edits( dir, constant, version ) {
	const base = path.join( paths.plugins, dir );

	return [
		{
			file: path.join( base, `${ dir }.php` ),
			find: /^(\s*\*\s*Version:\s*).+$/m,
			replace: `$1${ version }`,
			label: 'plugin header',
		},
		{
			file: path.join( base, `${ dir }.php` ),
			find: new RegExp( `(define\\(\\s*'${ constant }',\\s*')[^']*(')` ),
			replace: `$1${ version }$2`,
			label: 'version constant',
		},
		{
			file: path.join( base, 'readme.txt' ),
			find: /^(Stable tag:\s*).+$/m,
			replace: `$1${ version }`,
			label: 'readme.txt stable tag',
			optional: true,
		},
		{
			file: path.join( base, 'package.json' ),
			find: /("version"\s*:\s*")[^"]*(")/,
			replace: `$1${ version }$2`,
			label: 'package.json',
			optional: true,
		},
		{
			file: path.join( base, 'assets', 'blocks', 'item-list', 'block.json' ),
			find: /("version"\s*:\s*")[^"]*(")/,
			replace: `$1${ version }$2`,
			label: 'block.json',
			optional: true,
		},
		{
			file: path.join( base, 'tests', 'phpstan-bootstrap.php' ),
			find: new RegExp( `(define\\(\\s*'${ constant }',\\s*')[^']*(')` ),
			replace: `$1${ version }$2`,
			label: 'phpstan bootstrap',
			optional: true,
		},
		{
			file: path.join( base, 'tests', 'bootstrap-unit.php' ),
			find: new RegExp( `(define\\(\\s*'${ constant }',\\s*')[^']*(')` ),
			replace: `$1${ version }$2`,
			label: 'unit bootstrap',
			optional: true,
		},
	];
}

function applyEdits( list, dryRun ) {
	const touched = [];

	for ( const edit of list ) {
		if ( ! fs.existsSync( edit.file ) ) {
			if ( ! edit.optional ) {
				throw new UserError( `Missing file: ${ edit.file }` );
			}
			continue;
		}

		const before = fs.readFileSync( edit.file, 'utf8' );

		if ( ! edit.find.test( before ) ) {
			if ( ! edit.optional ) {
				throw new UserError( `Could not find the ${ edit.label } in ${ edit.file }` );
			}
			continue;
		}

		const after = before.replace( edit.find, edit.replace );

		if ( after === before ) continue;

		if ( ! dryRun ) fs.writeFileSync( edit.file, after );

		touched.push( `${ path.relative( paths.root, edit.file ) } (${ edit.label })` );
	}

	return touched;
}

/** Keeps "Requires at least" / "Tested up to" aligned with the versions actually tested. */
async function syncHeaders( dirs, dryRun ) {
	const matrix = await resolveMatrix();
	const numeric = matrix.targets
		.map( ( t ) => t.wpVersion )
		.filter( ( v ) => /^\d/.test( v ) )
		.sort( ( a, b ) => {
			const [ am, an ] = a.split( '.' ).map( Number );
			const [ bm, bn ] = b.split( '.' ).map( Number );
			return am - bm || an - bn;
		} );

	if ( ! numeric.length ) return [];

	const lowest = numeric[ 0 ];
	const highest = numeric[ numeric.length - 1 ];
	const touched = [];

	for ( const dir of dirs ) {
		touched.push(
			...applyEdits(
				[
					{
						file: path.join( paths.plugins, dir, `${ dir }.php` ),
						find: /^(\s*\*\s*Requires at least:\s*).+$/m,
						replace: `$1${ lowest }`,
						label: `requires at least ${ lowest }`,
						optional: true,
					},
					{
						file: path.join( paths.plugins, dir, 'readme.txt' ),
						find: /^(Requires at least:\s*).+$/m,
						replace: `$1${ lowest }`,
						label: `readme requires at least ${ lowest }`,
						optional: true,
					},
					{
						file: path.join( paths.plugins, dir, 'readme.txt' ),
						find: /^(Tested up to:\s*).+$/m,
						replace: `$1${ highest }`,
						label: `readme tested up to ${ highest }`,
						optional: true,
					},
				],
				dryRun
			)
		);
	}

	return touched;
}

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, {
		booleans: [ 'dry-run', 'sync-headers' ],
	} );

	const s = starter();
	const dirs = Object.values( s.editions || {} )
		.filter( ( e ) => e?.enabled && e?.dir )
		.map( ( e ) => e.dir )
		.filter( ( dir ) => fs.existsSync( path.join( paths.plugins, dir ) ) );

	const dryRun = Boolean( flags[ 'dry-run' ] );
	const touched = [];

	if ( positional.length ) {
		const version = positional[ 0 ];

		if ( ! SEMVER.test( version ) ) {
			throw new UserError( `"${ version }" is not a semantic version (e.g. 1.2.0).` );
		}

		for ( const dir of dirs ) {
			const constant = `${ dir.replace( /-/g, '_' ).toUpperCase() }_VERSION`;
			touched.push( ...applyEdits( edits( dir, constant, version ), dryRun ) );
		}

		log.step( `Version ${ c.bold( version ) }` );
	}

	if ( flags[ 'sync-headers' ] || ! positional.length ) {
		touched.push( ...( await syncHeaders( dirs, dryRun ) ) );
	}

	log.blank();

	if ( ! touched.length ) {
		log.ok( 'Nothing to change - everything is already in sync.' );
	} else {
		for ( const item of touched ) {
			log.info( `  ${ dryRun ? c.yellow( 'would update' ) : c.green( 'updated' ) }  ${ item }` );
		}
	}

	log.blank();

	return 0;
}
