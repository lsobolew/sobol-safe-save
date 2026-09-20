import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, listFlag } from '../lib/args.mjs';
import { paths, ensureDir } from '../lib/paths.mjs';
import { starter } from '../lib/config.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { assertDocker, compose, syncCompose } from '../lib/docker.mjs';
import { ensureUp } from '../lib/runner.mjs';
import { run } from '../lib/proc.mjs';
import { log, c, UserError } from '../lib/log.mjs';

/** Reads the Version header of a plugin file. */
function pluginVersion( dir ) {
	const file = path.join( paths.plugins, dir, `${ dir }.php` );

	if ( ! fs.existsSync( file ) ) {
		throw new UserError( `Plugin file not found: ${ file }` );
	}

	const header = fs.readFileSync( file, 'utf8' ).slice( 0, 4096 );
	const match = header.match( /^\s*\*\s*Version:\s*(.+)$/m );

	if ( ! match ) {
		throw new UserError( `No "Version:" header in ${ file }` );
	}

	return match[ 1 ].trim();
}

/** Builds the editor assets on the host (Node is here, PHP is not). */
async function buildAssets( dir ) {
	const pkgFile = path.join( paths.plugins, dir, 'package.json' );

	if ( ! fs.existsSync( pkgFile ) ) return true;

	const pkg = JSON.parse( fs.readFileSync( pkgFile, 'utf8' ) );

	if ( ! pkg.scripts?.build ) return true;

	const cwd = path.join( paths.plugins, dir );

	if ( ! fs.existsSync( path.join( cwd, 'node_modules' ) ) ) {
		log.step( `${ dir }: npm install` );
		const install = await run( 'npm', [ 'install', '--no-audit', '--no-fund' ], { cwd } );
		if ( install.code !== 0 ) return false;
	}

	log.step( `${ dir }: npm run build` );
	const { code } = await run( 'npm', [ 'run', 'build' ], { cwd } );

	return code === 0;
}

/**
 * Assembles the distributable inside a container: only there is PHP available, and only there can
 * `composer install --no-dev` produce the exact autoloader that ships to users.
 */
async function packagePlugin( target, dir, version, onLog ) {
	const { code } = await compose(
		[ 'exec', '-T', target.service, 'bash', '-lc', packageScript( dir, version ) ],
		{ onData: onLog }
	);
	return code === 0;
}

export function packageScript( dir, version ) {
	const stage = `/wplab/build/${ dir }`;
	const source = `/var/www/html/wp-content/plugins/${ dir }`;

	const script = [
		`set -e`,
		`rm -rf ${ stage } && mkdir -p ${ stage }`,
		// .distignore is the single source of truth for what never ships.
		`rsync -a --delete --exclude-from=${ source }/.distignore --exclude='.git' ${ source }/ ${ stage }/`,
		`if [ -f ${ stage }/composer.json ] || [ -f ${ source }/composer.json ]; then ` +
			`cp ${ source }/composer.json ${ stage }/composer.json 2>/dev/null || true; ` +
			`[ -f ${ source }/composer.lock ] && cp ${ source }/composer.lock ${ stage }/ || true; ` +
			`composer install --working-dir=${ stage } --no-dev --optimize-autoloader --no-interaction --quiet || exit $?; ` +
			`rm -f ${ stage }/composer.json ${ stage }/composer.lock; fi`,
		// A plugin whose only Composer requirement is PHP itself has no third-party code to ship,
		// and its own autoloader already covers its classes. Shipping vendor/ anyway leaves a
		// directory with nothing but Composer's autoloader in it - which WordPress.org flags,
		// because a vendor/ directory without a composer.json looks like a packaging mistake.
		// What counts is whether any third-party package was installed, and that is what the
		// count below asks. An earlier version also required vendor/bin to be absent, which is
		// not a proxy for anything: `composer install` creates that directory whether or not it
		// put anything in it, so on a machine where it did - a CI runner, as it turned out - the
		// whole step was skipped and the empty vendor/ shipped anyway. Found in a published zip,
		// not in a test, which is why the packaging tests now assert on the contents.
		`if [ -d ${ stage }/vendor ]; then ` +
			`REAL_DEPS="$(find ${ stage }/vendor -maxdepth 1 -mindepth 1 -type d ` +
			`! -name composer ! -name bin | wc -l)"; ` +
			`[ "$REAL_DEPS" = "0" ] && rm -rf ${ stage }/vendor || true; fi`,
		// Regenerate the translation template from the staged copy - which is the plugin exactly
		// as users receive it, minified JavaScript and all. Generating it from the sources would
		// list strings from files that do not ship and spell their locations wrongly; generating
		// it by hand means it silently describes an older release, which is worse than having
		// none at all because nobody can tell by looking.
		`if [ -d ${ stage }/languages ]; then ` +
			`wp --allow-root i18n make-pot ${ stage } ${ stage }/languages/${ dir }.pot ` +
			`--slug=${ dir } --exclude=blocks,scripts,tests,node_modules,vendor --quiet 2>/dev/null || ` +
			`echo "note: could not regenerate ${ dir }.pot"; fi`,
		`rm -rf /wplab/build/${ dir }-${ version }.zip`,
		`cd /wplab/build && zip -rq ${ dir }-${ version }.zip ${ dir } -x '*.DS_Store'`,
		`echo "packaged ${ dir }-${ version }.zip"`,
	].join( ' && ' );

	return script;
}

/**
 * Smoke-tests a built zip on a running site.
 *
 * It deliberately does NOT use `wp plugin install`: the plugin directory is a bind mount from the
 * host, and WordPress deletes the old directory before unpacking - which would wipe your working
 * copy on disk. Instead the package is unpacked into a throwaway directory that is not mounted,
 * activated there, and removed afterwards.
 */
async function verifyPackage( target, dir, version, onLog ) {
	const slug = `wplab-verify-${ dir }`;
	const zip = `/wplab/build/${ dir }-${ version }.zip`;
	const dest = `/var/www/html/wp-content/plugins/${ slug }`;

	const script = [
		`set -e`,
		`wp --allow-root plugin deactivate ${ dir } >/dev/null 2>&1 || true`,
		`rm -rf /tmp/${ slug } ${ dest }`,
		`mkdir -p /tmp/${ slug }`,
		`unzip -q ${ zip } -d /tmp/${ slug }`,
		// What is in the package, not only whether it runs. A zip can activate perfectly well and
		// still carry things that should never have been in it - a vendor/ holding nothing but
		// Composer's own autoloader, which WordPress.org reads as a packaging mistake because
		// there is no composer.json beside it, or the files a Mac leaves in a directory. Both
		// have shipped from here before, and neither shows up in a test that only asks whether
		// the plugin starts.
		`if [ -d /tmp/${ slug }/${ dir }/vendor ]; then ` +
			`DEPS="$(find /tmp/${ slug }/${ dir }/vendor -maxdepth 1 -mindepth 1 -type d ` +
			`! -name composer ! -name bin | wc -l)"; ` +
			`if [ "$DEPS" = "0" ]; then ` +
			`echo "the package ships a vendor/ with no dependencies in it" >&2; exit 1; fi; fi`,
		`if find /tmp/${ slug }/${ dir } -name '.DS_Store' -o -name '._*' | grep -q .; then ` +
			`echo "the package ships macOS metadata files" >&2; exit 1; fi`,
		`mv /tmp/${ slug }/${ dir } ${ dest }`,
		`find ${ dest } -name '*.php' -print0 | xargs -0 -n1 php -l > /dev/null`,
		`wp --allow-root plugin activate ${ slug }`,
		`wp --allow-root plugin deactivate ${ slug } >/dev/null`,
		`rm -rf ${ dest } /tmp/${ slug }`,
		`wp --allow-root plugin activate ${ dir } >/dev/null 2>&1 || true`,
		`echo "package verified: activates cleanly on WP $(wp --allow-root core version)"`,
	].join( ' && ' );

	const { code } = await compose(
		[ 'exec', '-T', target.service, 'bash', '-lc', script ],
		{ onData: onLog }
	);

	return code === 0;
}

/**
 * Compiles the block assets for every enabled edition, without packaging anything.
 *
 * @param {Record<string, unknown>} flags Parsed flags.
 */
async function buildAssetsOnly( flags ) {
	const s = starter();
	const editions = listFlag( flags.edition ).length
		? listFlag( flags.edition )
		: [ 'free', 'pro' ];

	const wanted = ( editions.includes( 'both' ) ? [ 'free', 'pro' ] : editions ).filter(
		( edition ) => s.editions?.[ edition ]?.enabled && s.editions[ edition ].dir
	);

	for ( const edition of wanted ) {
		const dir = s.editions[ edition ].dir;

		if ( ! ( await buildAssets( dir ) ) ) {
			log.fail( `${ dir }: asset build failed` );

			return 1;
		}
	}

	log.blank();
	log.ok( `Built the block assets for: ${ wanted.join( ', ' ) }` );
	log.blank();

	return 0;
}

export async function run_build( argv ) {
	const { flags } = parseArgs( argv, {
		booleans: [ 'skip-assets', 'skip-package', 'verify' ],
	} );

	// --skip-package compiles the blocks and stops there. It needs no container, which is the
	// point: CI has to build the blocks before the end-to-end tests can see them, and starting a
	// WordPress only to throw away the zip it produces would be a minute per matrix job.
	if ( flags[ 'skip-package' ] ) {
		return buildAssetsOnly( flags );
	}

	await assertDocker();

	const s = starter();
	const matrix = await resolveMatrix();
	syncCompose( matrix );

	const editions = listFlag( flags.edition ).length
		? listFlag( flags.edition )
		: [ 'free', 'pro' ];

	const wanted = ( editions.includes( 'both' ) ? [ 'free', 'pro' ] : editions ).filter(
		( edition ) => s.editions?.[ edition ]?.enabled && s.editions[ edition ].dir
	);

	if ( ! wanted.length ) {
		throw new UserError( 'No edition to build - check starter.json -> editions.' );
	}

	// Packaging happens in the newest target so the shipped autoloader matches modern PHP.
	const [ target ] = selectTargets( matrix, [ flags.target || matrix.targets[ 0 ].id ] );
	const ready = await ensureUp( matrix, [ target ], { onLog: ( t ) => process.stdout.write( t ) } );

	if ( ! ready ) return 1;

	ensureDir( path.join( paths.root, 'dist' ) );
	const built = [];

	for ( const edition of wanted ) {
		const dir = s.editions[ edition ].dir;
		const version = pluginVersion( dir );

		if ( ! flags[ 'skip-assets' ] && ! ( await buildAssets( dir ) ) ) {
			log.fail( `${ dir }: asset build failed` );
			return 1;
		}

		log.step( `${ dir }: packaging ${ version }` );

		if ( ! ( await packagePlugin( target, dir, version, ( t ) => process.stdout.write( t ) ) ) ) {
			log.fail( `${ dir }: packaging failed` );
			return 1;
		}

		if ( flags.verify && ! ( await verifyPackage( target, dir, version, ( t ) => process.stdout.write( t ) ) ) ) {
			log.fail( `${ dir }: the built package failed verification` );
			return 1;
		}

		const zipName = `${ dir }-${ version }.zip`;
		const from = path.join( paths.work, 'build', zipName );
		const to = path.join( paths.root, 'dist', zipName );

		fs.copyFileSync( from, to );
		built.push( { zipName, to, size: fs.statSync( to ).size } );
	}

	log.blank();

	for ( const item of built ) {
		log.ok(
			`${ path.relative( paths.root, item.to ) }  ${ c.dim(
				`${ Math.round( item.size / 1024 ) } KB`
			) }`
		);
	}

	log.blank();

	return 0;
}

export { run_build as run };
