import { parseArgs } from '../lib/args.mjs';
import { resolveMatrix, selectTargets, themesForTarget } from '../lib/matrix.mjs';
import { assertDocker, compose, syncCompose, wpCliCapture } from '../lib/docker.mjs';
import { ensureUp } from '../lib/runner.mjs';
import { log, c, UserError } from '../lib/log.mjs';
import { listFlag } from '../lib/args.mjs';

/** Currently active theme on a target. */
async function activeTheme( target ) {
	const { code, stdout } = await wpCliCapture( target, [
		'theme',
		'list',
		'--status=active',
		'--field=name',
	] );

	return code === 0 ? stdout.trim() : '';
}

async function list( matrix, targets ) {
	log.blank();
	log.info( c.bold( 'Themes' ) );
	log.blank();

	for ( const theme of matrix.themes.available ) {
		const sweeps = matrix.themes.sweep.themes.includes( theme.slug );

		log.info(
			`  ${ theme.alias.padEnd( 6 ) } ${ theme.slug.padEnd( 20 ) } ` +
				`${ c.dim( theme.type.padEnd( 8 ) ) } ${ c.dim( theme.source ) }` +
				( sweeps ? ` ${ c.cyan( 'in sweep' ) }` : '' )
		);
	}

	log.blank();
	log.info( c.bold( 'Active right now' ) );
	log.blank();

	for ( const target of targets ) {
		const active = await activeTheme( target );
		const planned = themesForTarget( matrix, target.id )
			.map( ( t ) => t?.alias )
			.filter( Boolean )
			.join( ', ' );

		log.info(
			`  ${ target.id.padEnd( 9 ) } ${ ( active || '-' ).padEnd( 20 ) } ${ c.dim(
				`tests here run on: ${ planned || 'n/a' }`
			) }`
		);
	}

	log.blank();

	return 0;
}

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv );
	const [ action, value ] = positional;

	await assertDocker();

	const matrix = await resolveMatrix();
	syncCompose( matrix );

	const targets = selectTargets( matrix, listFlag( flags.targets ) );

	if ( ! action || action === 'list' ) return list( matrix, targets );

	if ( action !== 'use' && action !== 'install' ) {
		throw new UserError( `Unknown action "${ action }". Available: list, use, install.` );
	}

	if ( action === 'use' && ! value ) {
		throw new UserError( 'Name a theme, e.g. ./bin/wpx theme use twentytwentyone' );
	}

	await ensureUp( matrix, targets, { onLog: ( t ) => process.stdout.write( t ) } );

	for ( const target of targets ) {
		if ( action === 'install' ) {
			for ( const theme of matrix.themes.available.filter( ( t ) => t.source === 'wporg' ) ) {
				await compose( [
					'exec',
					'-T',
					target.service,
					'wp',
					'--allow-root',
					'theme',
					'install',
					theme.slug,
				] );
			}

			log.ok( `${ target.id }: themes installed` );
			continue;
		}

		const [ theme ] = themesForTarget( matrix, target.id, [ value ] );
		const { code } = await compose( [
			'exec',
			'-T',
			target.service,
			'wp',
			'--allow-root',
			'theme',
			'activate',
			theme.slug,
		] );

		if ( code === 0 ) {
			log.ok( `${ target.id }: ${ theme.slug } (${ theme.type })` );
		} else {
			log.fail( `${ target.id }: could not activate ${ theme.slug }` );
		}
	}

	return 0;
}
