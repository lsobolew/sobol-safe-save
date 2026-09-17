import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname( fileURLToPath( import.meta.url ) );

/** Repository root (two levels up from cli/lib). */
export const ROOT = path.resolve( here, '..', '..' );

export const paths = {
	root: ROOT,
	starter: path.join( ROOT, 'starter.json' ),
	matrix: path.join( ROOT, 'wp-matrix.json' ),
	env: path.join( ROOT, 'env' ),
	compose: path.join( ROOT, 'env', 'docker-compose.gen.yml' ),
	composeOverride: path.join( ROOT, 'env', 'docker-compose.override.yml' ),
	plugins: path.join( ROOT, 'plugins' ),
	templates: path.join( ROOT, 'templates' ),
	dashboard: path.join( ROOT, 'dashboard' ),
	work: path.join( ROOT, '.wplab' ),
	cache: path.join( ROOT, '.wplab', 'cache' ),
	results: path.join( ROOT, '.wplab', 'results' ),
	logs: path.join( ROOT, '.wplab', 'logs' ),
};

export function ensureDir( dir ) {
	fs.mkdirSync( dir, { recursive: true } );
	return dir;
}

export function readJson( file ) {
	return JSON.parse( fs.readFileSync( file, 'utf8' ) );
}

export function writeJson( file, data ) {
	fs.writeFileSync( file, JSON.stringify( data, null, '\t' ) + '\n' );
}
