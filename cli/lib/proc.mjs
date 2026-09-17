import { spawn } from 'node:child_process';

/**
 * Runs a process. onData receives stdout/stderr chunks (the dashboard streams them);
 * without it the output goes straight to the terminal.
 */
export function run( cmd, args, { cwd, env, onData, stdio } = {} ) {
	return new Promise( ( resolve, reject ) => {
		const child = spawn( cmd, args, {
			cwd,
			env: { ...process.env, ...env },
			stdio: stdio || ( onData ? [ 'ignore', 'pipe', 'pipe' ] : 'inherit' ),
		} );

		if ( onData ) {
			child.stdout?.on( 'data', ( d ) => onData( d.toString(), 'stdout' ) );
			child.stderr?.on( 'data', ( d ) => onData( d.toString(), 'stderr' ) );
		}

		child.on( 'error', reject );
		child.on( 'close', ( code, signal ) =>
			resolve( { code: code === null ? 1 : code, signal } )
		);
	} );
}

/** Like run(), but collects stdout; never throws on a non-zero exit code. */
export function capture( cmd, args, { cwd, env } = {} ) {
	return new Promise( ( resolve, reject ) => {
		const child = spawn( cmd, args, {
			cwd,
			env: { ...process.env, ...env },
			stdio: [ 'ignore', 'pipe', 'pipe' ],
		} );
		let stdout = '';
		let stderr = '';
		child.stdout.on( 'data', ( d ) => ( stdout += d.toString() ) );
		child.stderr.on( 'data', ( d ) => ( stderr += d.toString() ) );
		child.on( 'error', reject );
		child.on( 'close', ( code ) =>
			resolve( { code: code === null ? 1 : code, stdout, stderr } )
		);
	} );
}
