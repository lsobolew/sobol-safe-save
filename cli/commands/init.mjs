import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from '../lib/args.mjs';
import { paths, readJson, writeJson } from '../lib/paths.mjs';
import { starter, resetConfigCache } from '../lib/config.mjs';
import { log, c, UserError } from '../lib/log.mjs';

/** Directories that are never rewritten: generated, vendored or not ours. */
const SKIP_DIRS = new Set( [
	'node_modules',
	'vendor',
	'build',
	'.git',
	'.wplab',
	'dist',
	'playwright-report',
	'skills',
] );

const TEXT_EXTENSIONS = new Set( [
	'.php',
	'.js',
	'.mjs',
	'.ts',
	'.tsx',
	'.jsx',
	'.json',
	'.txt',
	'.md',
	'.scss',
	'.css',
	'.yml',
	'.yaml',
	'.xml',
	'.dist',
	'.neon',
	'.sh',
	'.html',
] );

const slugToNamespace = ( slug ) =>
	slug
		.split( /[-_]/ )
		.filter( Boolean )
		.map( ( part ) => part.charAt( 0 ).toUpperCase() + part.slice( 1 ) )
		.join( '' );

/** A title as a UI label is usually written: "Image Icons" -> "Image icons". */
const sentence = ( title ) =>
	title
		.split( ' ' )
		.map( ( word, index ) => ( index ? word.toLowerCase() : word ) )
		.join( ' ' );

/** The slug as JavaScript would write it: image-icons -> imageIcons. */
const camel = ( slug ) => {
	const pascal = slugToNamespace( slug );

	return pascal.charAt( 0 ).toLowerCase() + pascal.slice( 1 );
};

const slugToTitle = ( slug ) =>
	slug
		.split( /[-_]/ )
		.filter( Boolean )
		.map( ( part ) => part.charAt( 0 ).toUpperCase() + part.slice( 1 ) )
		.join( ' ' );

/**
 * Words that describe what a plugin does rather than whose it is. A slug built only from these
 * says nothing another plugin could not say, and WordPress.org pends submissions over exactly
 * that - "Image Icons" was pended as "a generic descriptive name [that] does not begin with a
 * distinctive brand or identifier".
 *
 * The list is a heuristic and deliberately short: it is here to prompt a decision, not to be an
 * authority on English. Missing a word costs nothing, because the reviewer is the real check.
 */
const GENERIC_WORDS = new Set( [
	'accordion', 'admin', 'advanced', 'ajax', 'api', 'audio', 'auto', 'backup', 'better', 'block',
	'blocks', 'button', 'buttons', 'cache', 'card', 'cards', 'carousel', 'cart', 'chart', 'charts',
	'checkout', 'color', 'colors', 'colour', 'colours', 'comment', 'comments', 'contact', 'content',
	'custom', 'dashboard', 'easy', 'editor', 'email', 'export', 'extra', 'fast', 'field', 'fields',
	'filter', 'font', 'fonts', 'form', 'forms', 'gallery', 'grid', 'helper', 'icon', 'icons',
	'image', 'images', 'import', 'light', 'lite', 'link', 'links', 'list', 'login', 'mail',
	'manager', 'media', 'menu', 'menus', 'meta', 'modal', 'modern', 'page', 'pages', 'popup',
	'post', 'posts', 'price', 'pricing', 'product', 'products', 'quick', 'redirect', 'rest',
	'search', 'security', 'seo', 'share', 'shop', 'simple', 'sitemap', 'slider', 'smart', 'social',
	'sort', 'store', 'style', 'styles', 'super', 'tab', 'table', 'tables', 'tabs', 'tags', 'theme',
	'tools', 'toolkit', 'ultimate', 'user', 'users', 'video', 'widget', 'widgets',
] );

function validate( answers ) {
	if ( ! /^[a-z][a-z0-9-]*$/.test( answers.slug ) ) {
		throw new UserError(
			`"${ answers.slug }" is not a valid plugin slug (lowercase letters, digits and dashes).`
		);
	}

	if ( answers.slug.endsWith( '-pro' ) ) {
		throw new UserError(
			'The slug must not end with "-pro" - that suffix is reserved for the paid edition.'
		);
	}

	// WordPress.org rejects these outright, and finding out at submission time is a bad surprise.
	for ( const term of [ 'wordpress', 'plugin' ] ) {
		if ( answers.slug.includes( term ) ) {
			log.warn(
				`The slug contains "${ term }", which WordPress.org does not allow in plugin ` +
					'names or slugs. Fine for a private plugin; rename before submitting one.'
			);
		}
	}

	// A slug made only of descriptive words is the single most common reason a first submission
	// comes back pended, and the slug is permanent once a plugin is approved - the display name
	// can be changed afterwards, the permalink never can. So this is worth catching on the day the
	// plugin is created, not on the day it is submitted.
	const words = answers.slug.split( '-' ).filter( Boolean );

	if ( words.every( ( word ) => GENERIC_WORDS.has( word ) ) ) {
		log.warn(
			`Every word in "${ answers.slug }" describes what the plugin does and none of them ` +
				'says whose it is. WordPress.org pends submissions over that, and the slug cannot ' +
				'be changed after approval.'
		);
		log.dim(
			`   Put a distinctive identifier first: <yours>-${ answers.slug }. A brand, a coined ` +
				'word or your own handle all work; another generic word ("advanced", "easy") ' +
				'does not.'
		);
	}

	if ( ! /^[A-Za-z][A-Za-z0-9]*\\[A-Za-z][A-Za-z0-9]*$/.test( answers.namespace ) ) {
		throw new UserError(
			`"${ answers.namespace }" should look like Vendor\\PluginName.`
		);
	}
}

/**
 * Every rename in one ordered list. Order matters: the "-pro" variants have to run before the
 * base ones, otherwise "my-plugin-pro" would first become "<slug>-pro" and then be rewritten again.
 */
function replacements( from, to ) {
	const pairs = [
		[ `${ from.namespace.replace( /\\/g, '\\\\' ) }Pro`, `${ to.namespace.replace( /\\/g, '\\\\' ) }Pro` ],
		[ `${ from.namespace }Pro`, `${ to.namespace }Pro` ],
		[ from.namespace.replace( /\\/g, '\\\\' ), to.namespace.replace( /\\/g, '\\\\' ) ],
		[ from.namespace, to.namespace ],

		[ `${ from.constantPrefix }_PRO`, `${ to.constantPrefix }_PRO` ],
		[ from.constantPrefix, to.constantPrefix ],

		[ `${ from.slug }-pro`, `${ to.slug }-pro` ],
		[ from.slug, to.slug ],

		[ `${ from.optionPrefix }_pro`, `${ to.optionPrefix }_pro` ],
		[ from.optionPrefix, to.optionPrefix ],

		[ from.hookPrefix, to.hookPrefix ],

		// lowerCamelCase, which is what JavaScript names the plugin in: block attributes saved
		// into post content (maskedIconSize), globals, prop names. Nothing else on this list
		// matches it - the slug is kebab, the namespace is PascalCase, the constant prefix is
		// upper - so without this entry a rename leaves the old name in every saved post, and a
		// plugin called Image Icons goes on writing maskedIconUrl forever.
		[ `${ camel( from.slug ) }Pro`, `${ camel( to.slug ) }Pro` ],
		[ camel( from.slug ), camel( to.slug ) ],

		[ `${ from.title } Pro`, `${ to.title } Pro` ],
		[ from.title, to.title ],

		// The same title in sentence case, which is how a UI label is usually written: a toolbar
		// button reads "Masked icon", not "Masked Icon", and the entry above does not match it.
		// Missing this leaves the old name in the one place users actually read it.
		[ sentence( from.title ), sentence( to.title ) ],
	];

	return pairs
		.filter( ( [ a, b ] ) => a && a !== b )
		.map( ( [ a, b ] ) => [ new RegExp( a.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ), 'g' ), b ] );
}

function walk( dir, files = [] ) {
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		if ( entry.name.startsWith( '.' ) && entry.name !== '.distignore' ) continue;
		if ( SKIP_DIRS.has( entry.name ) ) continue;

		const full = path.join( dir, entry.name );

		if ( entry.isDirectory() ) {
			walk( full, files );
		} else if ( TEXT_EXTENSIONS.has( path.extname( entry.name ) ) || entry.name === '.distignore' ) {
			files.push( full );
		}
	}

	return files;
}

export async function run( argv ) {
	const { flags } = parseArgs( argv, { booleans: [ 'dry-run', 'yes', 'no-pro' ] } );
	const current = starter();

	const from = {
		slug: current.slug,
		namespace: current.namespace,
		constantPrefix: current.constantPrefix,
		hookPrefix: current.hookPrefix,
		optionPrefix: current.constantPrefix.toLowerCase(),
		title: current.name,
	};

	let answers = {
		slug: flags.slug,
		name: flags.name,
		namespace: flags.namespace,
		author: flags.author,
	};

	if ( ! flags.yes && ( ! answers.slug || ! answers.namespace ) ) {
		const rl = readline.createInterface( { input: process.stdin, output: process.stdout } );

		log.blank();
		log.info( c.bold( 'Turning the starter into your plugin' ) );
		log.dim( '   Press Enter to keep the value in brackets.' );
		log.blank();

		answers.slug =
			answers.slug || ( await rl.question( `  Plugin slug [${ from.slug }]: ` ) ) || from.slug;

		const suggestedName = slugToTitle( answers.slug );
		answers.name =
			answers.name || ( await rl.question( `  Plugin name [${ suggestedName }]: ` ) ) || suggestedName;

		const vendor = from.namespace.split( '\\' )[ 0 ];
		const suggestedNs = `${ vendor }\\${ slugToNamespace( answers.slug ) }`;
		answers.namespace =
			answers.namespace ||
			( await rl.question( `  PHP namespace [${ suggestedNs }]: ` ) ) ||
			suggestedNs;

		answers.author =
			answers.author ||
			( await rl.question( `  Author [${ current.author }]: ` ) ) ||
			current.author;

		rl.close();
	}

	answers.slug = answers.slug || from.slug;
	answers.name = answers.name || slugToTitle( answers.slug );
	answers.namespace =
		answers.namespace || `${ from.namespace.split( '\\' )[ 0 ] }\\${ slugToNamespace( answers.slug ) }`;
	answers.author = answers.author || current.author;

	validate( answers );

	const to = {
		slug: answers.slug,
		namespace: answers.namespace,
		constantPrefix: answers.slug.replace( /-/g, '_' ).toUpperCase(),
		hookPrefix: answers.slug.replace( /-/g, '' ),
		optionPrefix: answers.slug.replace( /-/g, '_' ),
		title: answers.name,
	};

	if ( from.slug === to.slug && from.namespace === to.namespace ) {
		log.warn( 'Nothing to rename - the slug and namespace already match.' );
		return 0;
	}

	const rules = replacements( from, to );
	const dryRun = Boolean( flags[ 'dry-run' ] );

	// Content first, paths second: renaming directories mid-walk would invalidate the file list.
	const roots = [ paths.plugins, path.join( paths.root, 'tests' ), paths.templates ];
	const files = roots.filter( fs.existsSync ).flatMap( ( dir ) => walk( dir ) );

	// starter.json carries the old slug in free-text fields too (plugin URI, description), so it
	// goes through the same rewrite before the structured fields are set below.
	files.push( paths.starter );

	// Two CI files name the plugin directly and cannot read starter.json: Dependabot has no
	// variables, and the WordPress.org deploy needs a literal slug. Left alone they would keep
	// pointing at the starter's plugin after a rename.
	for ( const relative of [
		'.github/dependabot.yml',
		'.github/workflows/deploy-wporg.yml',
	] ) {
		const file = path.join( paths.root, relative );

		if ( fs.existsSync( file ) ) files.push( file );
	}
	let changed = 0;

	for ( const file of files ) {
		const before = fs.readFileSync( file, 'utf8' );
		let after = before;

		for ( const [ pattern, value ] of rules ) {
			after = after.replace( pattern, value );
		}

		if ( after === before ) continue;

		if ( ! dryRun ) fs.writeFileSync( file, after );

		changed++;
	}

	const renames = [];

	for ( const [ oldDir, newDir ] of [
		[ `${ from.slug }-pro`, `${ to.slug }-pro` ],
		[ from.slug, to.slug ],
	] ) {
		const source = path.join( paths.plugins, oldDir );
		const dest = path.join( paths.plugins, newDir );

		if ( ! fs.existsSync( source ) || source === dest ) continue;

		const oldEntry = path.join( source, `${ oldDir }.php` );
		const newEntry = path.join( source, `${ newDir }.php` );

		if ( ! dryRun ) {
			if ( fs.existsSync( oldEntry ) ) fs.renameSync( oldEntry, newEntry );
			fs.renameSync( source, dest );
		}

		renames.push( `${ oldDir }/ -> ${ newDir }/` );
	}

	// Composer's generated autoloader has the old namespace baked into it, and nothing else will
	// put that right.
	//
	// vendor/ is skipped by the rewrite above, correctly - it is not ours to edit. But three of the
	// files in it are a map from namespace to directory, so after a rename they point at a
	// namespace that no longer exists and every class fails to load. Measured: `composer install`
	// does not repair them. It sees an installed vendor/, decides there is nothing to do, and
	// skips autoload generation - even when the map file has been deleted outright. So restarting
	// the containers does not fix it either, and the plugin greets you with "Class ... not found"
	// with nothing obviously wrong.
	//
	// Rewriting generated files is normally the wrong move, and it is the right one here: it works
	// with the containers down, needs no network, and the next real `composer dump-autoload`
	// overwrites these with the same content anyway.
	if ( ! dryRun ) {
		const autoloadFiles = [ 'autoload_psr4.php', 'autoload_static.php', 'autoload_classmap.php' ];

		for ( const dir of [ to.slug, `${ to.slug }-pro` ] ) {
			for ( const name of autoloadFiles ) {
				const file = path.join( paths.plugins, dir, 'vendor', 'composer', name );

				if ( ! fs.existsSync( file ) ) continue;

				// PHP source escapes the separator, so the file holds Vendor\\Plugin, not
				// Vendor\Plugin. Both spellings are replaced: the escaped one is what these files
				// actually contain, and the plain one guards against a future composer writing it
				// differently.
				const escape = ( value ) => value.split( '\\' ).join( '\\\\' );

				const before = fs.readFileSync( file, 'utf8' );
				const after = before
					.split( escape( from.namespace ) )
					.join( escape( to.namespace ) )
					.split( from.namespace )
					.join( to.namespace );

				if ( after === before ) continue;

				fs.writeFileSync( file, after );
				changed++;
			}
		}
	}

	// The plugin headers carry example.com until somebody replaces it, and Plugin Check rejects
	// that domain outright. The starter.json values are the obvious source.
	if ( ! dryRun ) {
		const starterData = readJson( paths.starter );

		for ( const [ dir, isPro ] of [
			[ to.slug, false ],
			[ `${ to.slug }-pro`, true ],
		] ) {
			const file = path.join( paths.plugins, dir, `${ dir }.php` );

			if ( ! fs.existsSync( file ) ) continue;

			let header = fs.readFileSync( file, 'utf8' );

			const pluginUri = starterData.pluginUri || '';
			const authorUri = starterData.authorUri || '';

			if ( pluginUri ) {
				header = header.replace(
					/^(\s*\*\s*Plugin URI:\s*).+$/m,
					`$1${ pluginUri }${ isPro ? '-pro' : '' }`
				);
				header = header.replace( /^(\s*\*\s*Update URI:\s*).+$/m, `$1${ pluginUri }-pro` );
			}

			if ( authorUri ) {
				header = header.replace( /^(\s*\*\s*Author URI:\s*).+$/m, `$1${ authorUri }` );
			}

			if ( answers.author ) {
				header = header.replace( /^(\s*\*\s*Author:\s*).+$/m, `$1${ answers.author }` );
			}

			fs.writeFileSync( file, header );
		}
	}

	if ( ! dryRun ) {
		const data = readJson( paths.starter );

		data.name = to.title;
		data.slug = to.slug;
		data.namespace = to.namespace;
		data.constantPrefix = to.constantPrefix;
		data.hookPrefix = to.hookPrefix;
		data.textDomain = to.slug;
		data.author = answers.author;
		data.editions.free.dir = to.slug;
		data.editions.pro.dir = `${ to.slug }-pro`;

		if ( flags[ 'no-pro' ] ) data.editions.pro.enabled = false;

		writeJson( paths.starter, data );
		resetConfigCache();
	}

	log.blank();
	log.step( `${ dryRun ? 'Would rewrite' : 'Rewrote' } ${ changed } file(s)` );

	for ( const item of renames ) {
		log.info( `  ${ c.cyan( 'renamed' ) }  ${ item }` );
	}

	log.blank();
	log.info( `  slug        ${ to.slug }` );
	log.info( `  namespace   ${ to.namespace }` );
	log.info( `  constants   ${ to.constantPrefix }_*` );
	log.info( `  hooks       ${ to.hookPrefix }_*` );
	log.info( `  text domain ${ to.slug }` );
	log.blank();

	if ( ! dryRun ) {
		log.dim( '   Next: ./bin/wpx reset --all   (rebuilds the sites with the new plugin paths)' );
		log.dim( '   Then: ./bin/wpx test          (everything should still be green)' );
		log.blank();
	}

	return 0;
}
