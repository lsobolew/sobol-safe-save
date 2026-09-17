import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../lib/args.mjs';
import { paths, readJson, writeJson } from '../lib/paths.mjs';
import { starter } from '../lib/config.mjs';
import { log, c, UserError } from '../lib/log.mjs';

const FEATURES_DIR = () => path.join( paths.templates, 'features' );

function manifests() {
	const dir = FEATURES_DIR();

	if ( ! fs.existsSync( dir ) ) return [];

	return fs
		.readdirSync( dir, { withFileTypes: true } )
		.filter( ( entry ) => entry.isDirectory() )
		.map( ( entry ) => path.join( dir, entry.name, 'feature.json' ) )
		.filter( ( file ) => fs.existsSync( file ) )
		.map( ( file ) => readJson( file ) )
		.sort( ( a, b ) => a.name.localeCompare( b.name ) );
}

function manifest( name ) {
	const found = manifests().find( ( m ) => m.name === name );

	if ( ! found ) {
		throw new UserError(
			`Unknown feature "${ name }". Available: ${ manifests()
				.map( ( m ) => m.name )
				.join( ', ' ) }`
		);
	}

	return found;
}

/** Plugin directory a feature belongs to, taken from its edition. */
function pluginDir( feature ) {
	const s = starter();
	const dir = s.editions?.[ feature.edition ]?.dir;

	if ( ! dir ) {
		throw new UserError(
			`Edition "${ feature.edition }" is not configured in starter.json.`
		);
	}

	return path.join( paths.plugins, dir );
}

function modulesFile( feature ) {
	return path.join( pluginDir( feature ), 'config', 'modules.php' );
}

function isEnabled( feature ) {
	const file = modulesFile( feature );

	if ( ! fs.existsSync( file ) ) return false;

	return fs.readFileSync( file, 'utf8' ).includes( feature.moduleClass.replace( /\\\\/g, '\\' ) );
}

/** Adds or removes the module class entry in config/modules.php. */
function setModuleEntry( feature, enabled ) {
	const file = modulesFile( feature );
	const source = fs.readFileSync( file, 'utf8' );
	const className = feature.moduleClass.replace( /\\\\/g, '\\' );
	const line = `\t${ className }::class,\n`;

	if ( enabled ) {
		if ( source.includes( className ) ) return false;

		const updated = source.replace( /(return array\(\n)/, `$1${ line }` );
		fs.writeFileSync( file, updated );

		return true;
	}

	const pattern = new RegExp(
		`^\\t${ className.replace( /\\/g, '\\\\' ) }::class,\\r?\\n`,
		'm'
	);

	if ( ! pattern.test( source ) ) return false;

	fs.writeFileSync( file, source.replace( pattern, '' ) );

	return true;
}

function updateStarter( feature, enabled ) {
	const file = paths.starter;
	const data = readJson( file );

	data.features = data.features || {};
	data.features[ feature.name ] = { enabled, edition: feature.edition };

	writeJson( file, data );
}

function copyTree( from, to ) {
	fs.mkdirSync( path.dirname( to ), { recursive: true } );
	fs.cpSync( from, to, { recursive: true } );
}

function list() {
	log.blank();
	log.info( c.bold( 'Plugin features' ) );
	log.blank();

	for ( const feature of manifests() ) {
		const on = isEnabled( feature );
		const state = on ? c.green( 'enabled ' ) : c.dim( 'removed ' );

		log.info( `  ${ state } ${ feature.name.padEnd( 14 ) } ${ c.dim( feature.title ) }` );
	}

	log.blank();
	log.dim( '   ./bin/wpx feature remove <name>   drops the code, its tests and the registry entry' );
	log.dim( '   ./bin/wpx feature add <name>      restores it from templates/features/' );
	log.blank();

	return 0;
}

function remove( name, flags ) {
	const feature = manifest( name );
	const base = pluginDir( feature );
	const archive = path.join( FEATURES_DIR(), feature.name, 'files' );
	const dryRun = Boolean( flags[ 'dry-run' ] );
	const targets = [ ...feature.paths, ...( feature.tests || [] ) ];
	const removed = [];

	for ( const relative of targets ) {
		const source = path.join( base, relative );

		if ( ! fs.existsSync( source ) ) continue;

		// Archive before deleting, so `feature add` restores exactly what was there - including
		// any local changes made since the feature was scaffolded.
		if ( ! dryRun ) {
			const dest = path.join( archive, relative );
			fs.rmSync( dest, { recursive: true, force: true } );
			copyTree( source, dest );
			fs.rmSync( source, { recursive: true, force: true } );
		}

		removed.push( path.relative( paths.root, source ) );
	}

	if ( ! dryRun ) {
		setModuleEntry( feature, false );
		updateStarter( feature, false );
	}

	log.blank();
	log.step( `${ dryRun ? 'Would remove' : 'Removed' } feature "${ feature.name }"` );

	for ( const item of removed ) {
		log.info( `  ${ c.red( '-' ) } ${ item }` );
	}

	log.info( `  ${ c.red( '-' ) } registry entry in ${ path.relative( paths.root, modulesFile( feature ) ) }` );

	if ( feature.npmDependencies?.length ) {
		log.blank();
		log.warn(
			`These npm packages are now unused: ${ feature.npmDependencies.join( ', ' ) }`
		);
		log.dim(
			`   Drop them with: npm --prefix ${ path.relative( paths.root, base ) } uninstall ${ feature.npmDependencies.join(
				' '
			) }`
		);
	}

	if ( feature.notes ) {
		log.blank();
		log.dim( `   Note: ${ feature.notes }` );
	}

	log.blank();

	return 0;
}

function add( name, flags ) {
	const feature = manifest( name );
	const base = pluginDir( feature );
	const archive = path.join( FEATURES_DIR(), feature.name, 'files' );
	const dryRun = Boolean( flags[ 'dry-run' ] );

	if ( ! fs.existsSync( archive ) ) {
		throw new UserError(
			`No archived files for "${ feature.name }" in ${ path.relative( paths.root, archive ) }.\n` +
				'A feature can only be restored after it has been removed by this command.'
		);
	}

	const restored = [];

	for ( const relative of [ ...feature.paths, ...( feature.tests || [] ) ] ) {
		const source = path.join( archive, relative );

		if ( ! fs.existsSync( source ) ) continue;

		if ( ! dryRun ) copyTree( source, path.join( base, relative ) );

		restored.push( path.relative( paths.root, path.join( base, relative ) ) );
	}

	if ( ! dryRun ) {
		setModuleEntry( feature, true );
		updateStarter( feature, true );
	}

	log.blank();
	log.step( `${ dryRun ? 'Would restore' : 'Restored' } feature "${ feature.name }"` );

	for ( const item of restored ) {
		log.info( `  ${ c.green( '+' ) } ${ item }` );
	}

	if ( feature.npmDependencies?.length ) {
		log.blank();
		log.dim(
			`   Reinstall the front-end dependencies: npm --prefix ${ path.relative(
				paths.root,
				base
			) } install`
		);
	}

	log.blank();

	return 0;
}

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, { booleans: [ 'dry-run' ] } );
	const [ action, name ] = positional;

	if ( ! action || action === 'list' ) return list();

	if ( ! name ) {
		throw new UserError( `Name a feature, e.g. ./bin/wpx feature ${ action } blocks` );
	}

	if ( action === 'remove' ) return remove( name, flags );
	if ( action === 'add' ) return add( name, flags );

	throw new UserError( `Unknown action "${ action }". Available: list, add, remove.` );
}
