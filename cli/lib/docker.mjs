import fs from 'node:fs';
import { paths } from './paths.mjs';
import { writeCompose, projectName, ADMIN_USER, ADMIN_PASSWORD } from './compose-render.mjs';
import { run, capture } from './proc.mjs';
import { UserError } from './log.mjs';

export { projectName, ADMIN_USER, ADMIN_PASSWORD };

function baseArgs() {
	const args = [ 'compose', '-f', paths.compose ];
	if ( fs.existsSync( paths.composeOverride ) ) {
		args.push( '-f', paths.composeOverride );
	}
	return args;
}

/** Regenerates the compose file - cheap enough to do before every Docker operation. */
export function syncCompose( matrix ) {
	return writeCompose( matrix );
}

export function compose( args, opts = {} ) {
	return run( 'docker', [ ...baseArgs(), ...args ], { cwd: paths.env, ...opts } );
}

export function composeCapture( args, opts = {} ) {
	return capture( 'docker', [ ...baseArgs(), ...args ], { cwd: paths.env, ...opts } );
}

export function withProfiles( targets, args ) {
	const profiles = targets.flatMap( ( t ) => [ '--profile', t.id ] );
	return [ ...profiles, ...args ];
}

/** Container state as reported by Docker, keyed by service name. */
export async function serviceStatus() {
	const { code, stdout } = await composeCapture( [
		'--profile',
		'all',
		'ps',
		'--format',
		'json',
		'--all',
	] );
	if ( code !== 0 ) return {};
	const map = {};
	for ( const line of stdout.split( '\n' ) ) {
		const trimmed = line.trim();
		if ( ! trimmed ) continue;
		let row;
		try {
			row = JSON.parse( trimmed );
		} catch {
			continue;
		}
		const rows = Array.isArray( row ) ? row : [ row ];
		for ( const r of rows ) {
			if ( r.Service ) map[ r.Service ] = r;
		}
	}
	return map;
}

export async function assertDocker() {
	const { code } = await capture( 'docker', [ 'info', '--format', '{{.ServerVersion}}' ] );
	if ( code !== 0 ) {
		throw new UserError(
			'Docker is not responding. Start Docker Desktop and try again.'
		);
	}
}

/** WP-CLI inside a target container. */
export function wpCli( target, args, opts = {} ) {
	return compose(
		[ 'exec', '-T', target.service, 'wp', '--allow-root', ...args ],
		opts
	);
}

export function wpCliCapture( target, args, opts = {} ) {
	return composeCapture(
		[ 'exec', '-T', target.service, 'wp', '--allow-root', ...args ],
		opts
	);
}

/** An arbitrary shell command inside a target container. */
export function shell( target, script, opts = {} ) {
	return compose( [ 'exec', '-T', target.service, 'bash', '-lc', script ], opts );
}

export function shellCapture( target, script, opts = {} ) {
	return composeCapture( [ 'exec', '-T', target.service, 'bash', '-lc', script ], opts );
}
