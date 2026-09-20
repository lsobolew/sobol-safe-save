import fs from 'node:fs';
import path from 'node:path';
import { paths, ensureDir } from './paths.mjs';
import { matrixConfig } from './config.mjs';
import { log, UserError } from './log.mjs';

const API = 'https://api.wordpress.org/core/version-check/1.7/';
const CACHE_FILE = () => path.join( paths.cache, 'wp-versions.json' );
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * WordPress branches (X.Y) in descending order, e.g. ['7.1','7.0','6.9',...].
 * Source: api.wordpress.org, cached for 24h. Offline falls back to a stale cache with a warning.
 */
export async function wpBranches( { refresh = false } = {} ) {
	ensureDir( paths.cache );
	const file = CACHE_FILE();

	if ( ! refresh && fs.existsSync( file ) ) {
		const cached = JSON.parse( fs.readFileSync( file, 'utf8' ) );
		if ( Date.now() - cached.fetchedAt < MAX_AGE_MS ) return cached.branches;
	}

	try {
		const res = await fetch( API, { signal: AbortSignal.timeout( 10000 ) } );
		if ( ! res.ok ) throw new Error( `HTTP ${ res.status }` );
		const data = await res.json();
		const branches = [
			...new Set(
				( data.offers || [] )
					.map( ( o ) => String( o.current || '' ) )
					.filter( Boolean )
					.map( ( v ) => v.split( '.' ).slice( 0, 2 ).join( '.' ) )
			),
		].sort( compareBranchesDesc );
		if ( ! branches.length ) throw new Error( 'empty offers list' );
		fs.writeFileSync(
			file,
			JSON.stringify( { fetchedAt: Date.now(), branches }, null, '\t' )
		);
		return branches;
	} catch ( err ) {
		if ( fs.existsSync( file ) ) {
			const cached = JSON.parse( fs.readFileSync( file, 'utf8' ) );
			log.warn(
				`Could not reach api.wordpress.org (${ err.message }); using the cache from ${ new Date(
					cached.fetchedAt
				).toLocaleString() }.`
			);
			return cached.branches;
		}
		throw new UserError(
			`Cannot determine the WordPress versions (${ err.message }) and there is no cache. ` +
				'Put explicit version numbers in wp-matrix.json instead of latest/latest-N.'
		);
	}
}

function compareBranchesDesc( a, b ) {
	const [ am, an ] = a.split( '.' ).map( Number );
	const [ bm, bn ] = b.split( '.' ).map( Number );
	return bm - am || bn - an;
}

/** 'latest' | 'latest-2' | 'nightly' | '6.8' -> a concrete `wp core download --version` value. */
export async function resolveWpVersion( spec, branches ) {
	const value = String( spec ).trim();
	if ( value === 'nightly' || value === 'trunk' ) return 'nightly';
	const m = /^latest(?:-(\d+))?$/.exec( value );
	if ( ! m ) return value;
	const offset = m[ 1 ] ? Number( m[ 1 ] ) : 0;
	const list = branches || ( await wpBranches() );
	if ( offset >= list.length ) {
		throw new UserError(
			`"${ value }" points past the known WordPress versions (${ list.length } branches available).`
		);
	}
	return list[ offset ];
}

/** The fully resolved target matrix. */
export async function resolveMatrix() {
	const cfg = matrixConfig();
	const branches = await needsBranches( cfg ) ? await wpBranches() : null;
	const seenIds = new Set();
	const seenPorts = new Set();

	const targets = [];
	for ( const raw of cfg.targets ) {
		if ( ! raw.id ) throw new UserError( 'A target in wp-matrix.json has no "id".' );
		if ( seenIds.has( raw.id ) ) {
			throw new UserError( `Duplicate target id "${ raw.id }" in wp-matrix.json.` );
		}
		if ( seenPorts.has( raw.port ) ) {
			throw new UserError( `Duplicate port ${ raw.port } in wp-matrix.json.` );
		}
		seenIds.add( raw.id );
		seenPorts.add( raw.port );

		const wpVersion = await resolveWpVersion( raw.wp, branches );
		targets.push( {
			id: raw.id,
			wpSpec: raw.wp,
			wpVersion,
			php: String( raw.php ),
			port: Number( raw.port ),
			multisite: Boolean( raw.multisite ),
			locale: raw.locale || cfg.defaults?.locale || 'en_US',
			service: `wp-${ raw.id }`,
			dbName: `wp_${ raw.id.replace( /[^a-z0-9]/gi, '_' ) }`,
			testDbName: `wptest_${ raw.id.replace( /[^a-z0-9]/gi, '_' ) }`,
			url: `http://localhost:${ raw.port }`,
		} );
	}

	return {
		targets,
		editions: cfg.editions?.length ? cfg.editions : [ 'free' ],
		defaults: cfg.defaults || {},
		ports: cfg.ports || {},
		themes: resolveThemes( cfg ),
	};
}

/**
 * Theme configuration, normalized.
 *
 * A missing themes block is not an error: a plugin that is not about blocks has no reason to care
 * which theme is active, and everything downstream falls back to a single implicit theme.
 */
function resolveThemes( cfg ) {
	const raw = cfg.themes || {};
	const available = ( raw.available || [] ).map( ( theme ) => ( {
		slug: theme.slug,
		alias: theme.alias || theme.slug,
		source: theme.source || 'wporg',
		type: theme.type || 'block',
		path: theme.path || `themes/${ theme.slug }`,
		// Default themes only exist from the release they shipped with: Twenty Twenty-Five cannot
		// be installed on WordPress 6.6, and asking for it there fails the whole run.
		requiresWp: theme.requiresWp || '',
	} ) );

	const fallback = raw.default || available[ 0 ]?.slug || '';

	return {
		default: fallback,
		available,
		sweep: {
			targets: raw.sweep?.targets || [],
			themes: raw.sweep?.themes || [],
		},
	};
}

/**
 * Themes a given target is tested on.
 *
 * Only the targets named in `sweep` run the whole set; the rest stay on the default. Every extra
 * theme is another full end-to-end run, so widening this is a deliberate decision, not a default.
 *
 * @param {object} matrix   Resolved matrix.
 * @param {string} targetId Target id.
 * @param {string[]} [override] Explicit theme slugs or aliases from the command line.
 */
export function themesForTarget( matrix, targetId, override ) {
	const { themes } = matrix;

	if ( ! themes.available.length ) return [ null ];

	const bySlug = ( value ) =>
		themes.available.find( ( t ) => t.slug === value || t.alias === value );

	if ( override?.length ) {
		return override.map( ( value ) => {
			const found = bySlug( value );

			if ( ! found ) {
				throw new UserError(
					`Unknown theme "${ value }". Available: ${ themes.available
						.map( ( t ) => `${ t.slug } (${ t.alias })` )
						.join( ', ' ) }`
				);
			}
			if ( ! themeRunsOn( found, matrix.targets.find( ( target ) => target.id === targetId ) ) ) {
				throw new UserError( `Theme ${ found.slug } requires WordPress ${ found.requiresWp } and cannot run on ${ targetId }.` );
			}

			return found;
		} );
	}

	const inSweep = themes.sweep.targets.includes( targetId );
	const slugs = inSweep && themes.sweep.themes.length
		? themes.sweep.themes
		: [ themes.default ];

	const target = matrix.targets.find( ( t ) => t.id === targetId );
	const usable = slugs
		.map( ( slug ) => bySlug( slug ) )
		.filter( Boolean )
		.filter( ( theme ) => themeRunsOn( theme, target ) );

	// Nothing installable here: run on whatever the site already uses rather than failing. The
	// result carries no theme name, because no particular theme was asserted.
	return usable.length ? usable : [ null ];
}

/** Whether a theme can be installed on a given target. */
function themeRunsOn( theme, target ) {
	if ( ! theme.requiresWp || ! target ) return true;

	// nightly and the newest release are always ahead of any published requirement.
	if ( ! /^\d/.test( target.wpVersion ) ) return true;

	return version_compare_ge( target.wpVersion, theme.requiresWp );
}

/** `a >= b` for WordPress-style two- or three-part versions. */
function version_compare_ge( a, b ) {
	const parse = ( value ) => String( value ).split( '.' ).map( Number );
	const left = parse( a );
	const right = parse( b );

	for ( let i = 0; i < Math.max( left.length, right.length ); i++ ) {
		const x = left[ i ] || 0;
		const y = right[ i ] || 0;

		if ( x !== y ) return x > y;
	}

	return true;
}

async function needsBranches( cfg ) {
	return cfg.targets.some( ( t ) => /^latest(-\d+)?$/.test( String( t.wp ) ) );
}

/** Selects targets by id; an empty list means all of them. */
export function selectTargets( matrix, ids ) {
	if ( ! ids || ! ids.length ) return matrix.targets;
	const out = [];
	for ( const id of ids ) {
		const found = matrix.targets.find( ( t ) => t.id === id );
		if ( ! found ) {
			throw new UserError(
				`Unknown target "${ id }". Available: ${ matrix.targets
					.map( ( t ) => t.id )
					.join( ', ' ) }`
			);
		}
		out.push( found );
	}
	return out;
}
