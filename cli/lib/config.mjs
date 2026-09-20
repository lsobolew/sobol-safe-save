import fs from 'node:fs';
import { paths, readJson } from './paths.mjs';
import { UserError } from './log.mjs';
import path from 'node:path';
import { validateSchema, validateCompatibility } from './config-validation.mjs';

let starterCache = null;
let matrixCache = null;

export function starter() {
	if ( starterCache ) return starterCache;
	if ( ! fs.existsSync( paths.starter ) ) {
		throw new UserError( 'starter.json is missing from the repository root.' );
	}
	const value = readJson( paths.starter );
	validateSchema( value, readJson( path.join( paths.root, 'docs/starter.schema.json' ) ), 'starter.json' );
	const directories = Object.values( value.editions ).filter( ( edition ) => edition?.dir ).map( ( edition ) => edition.dir );
	if ( new Set( directories ).size !== directories.length ) throw new UserError( 'starter.json: edition directories must be distinct.' );
	for ( const [ name, edition ] of Object.entries( value.editions ) ) {
		if ( edition?.enabled && ! fs.existsSync( path.join( paths.plugins, edition.dir, `${ edition.dir }.php` ) ) ) {
			throw new UserError( `starter.json: enabled edition ${ name } has no plugin entrypoint in plugins/${ edition.dir }.` );
		}
	}
	for ( const [ name, feature ] of Object.entries( value.features || {} ) ) {
		if ( feature?.enabled && ! value.editions[ feature.edition ]?.enabled ) {
			throw new UserError( `starter.json: feature ${ name } uses a disabled edition ${ feature.edition }.` );
		}
	}
	starterCache = value;
	return starterCache;
}

export function matrixConfig() {
	if ( matrixCache ) return matrixCache;
	if ( ! fs.existsSync( paths.matrix ) ) {
		throw new UserError( 'wp-matrix.json is missing from the repository root.' );
	}
	const value = readJson( paths.matrix );
	validateSchema( value, readJson( path.join( paths.root, 'docs/matrix.schema.json' ) ), 'wp-matrix.json' );
	validateCompatibility( starter(), value );
	matrixCache = value;
	return matrixCache;
}

export function resetConfigCache() {
	starterCache = null;
	matrixCache = null;
}

/** Plugin directories to mount into the containers, per starter.json and what exists on disk. */
export function pluginDirs() {
	const s = starter();
	const out = [];
	for ( const [ edition, def ] of Object.entries( s.editions || {} ) ) {
		if ( ! def?.enabled || ! def?.dir ) continue;
		const abs = `${ paths.plugins }/${ def.dir }`;
		if ( ! fs.existsSync( abs ) ) continue;
		out.push( { edition, dir: def.dir, abs } );
	}
	return out;
}

/** Plugin slugs activated for an edition: 'free' -> [free], 'pro' -> [free, pro]. */
export function pluginsForEdition( edition ) {
	const dirs = pluginDirs();
	if ( edition === 'pro' ) return dirs.map( ( p ) => p.dir );
	return dirs.filter( ( p ) => p.edition === 'free' ).map( ( p ) => p.dir );
}
