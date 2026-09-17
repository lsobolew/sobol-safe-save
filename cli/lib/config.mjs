import fs from 'node:fs';
import { paths, readJson } from './paths.mjs';
import { UserError } from './log.mjs';

let starterCache = null;
let matrixCache = null;

export function starter() {
	if ( starterCache ) return starterCache;
	if ( ! fs.existsSync( paths.starter ) ) {
		throw new UserError( 'starter.json is missing from the repository root.' );
	}
	starterCache = readJson( paths.starter );
	return starterCache;
}

export function matrixConfig() {
	if ( matrixCache ) return matrixCache;
	if ( ! fs.existsSync( paths.matrix ) ) {
		throw new UserError( 'wp-matrix.json is missing from the repository root.' );
	}
	matrixCache = readJson( paths.matrix );
	if ( ! Array.isArray( matrixCache.targets ) || ! matrixCache.targets.length ) {
		throw new UserError( 'wp-matrix.json does not define any target.' );
	}
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
