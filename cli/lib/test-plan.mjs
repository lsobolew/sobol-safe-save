import { SUITES, allPackages, packagesForEdition } from './runner.mjs';
import { themesForTarget } from './matrix.mjs';
import { UserError } from './log.mjs';

export function normalizeSuites( requested = [ 'unit', 'integration', 'e2e' ] ) {
	const suites = [ ...new Set( requested.flatMap( ( name ) => name === 'all' ? SUITES : [ name ] ) ) ];
	if ( ! suites.length || suites.some( ( name ) => ! SUITES.includes( name ) ) ) {
		throw new UserError( `Unknown or empty suite selection. Available: ${ SUITES.join( ', ' ) }` );
	}
	return suites;
}

/** Both CLI and dashboard execute this same ordered plan. */
export function createTestPlan( { matrix, targets, editions, suites, themes = [], noSweep = false, packages = allPackages() } ) {
	if ( ! editions.length ) throw new UserError( 'No edition selected.' );
	return normalizeSuites( suites ).flatMap( ( suite ) => {
		const editionless = [ 'unit', 'types', 'lint', 'analyse', 'plugin-check' ].includes( suite );
		const combos = editionless
			? packages.filter( ( pkg ) => pkg.key === 'free' || editions.includes( 'pro' ) )
				.map( ( pkg ) => ( { edition: null, pkg } ) )
			: editions.flatMap( ( edition ) => suite === 'e2e'
				? [ { edition, pkg: null } ]
				: packagesForEdition( edition, packages ).map( ( pkg ) => ( { edition, pkg } ) ) );
		return targets.flatMap( ( target ) => combos.flatMap( ( combo ) => {
			const selectedThemes = suite === 'e2e'
				? themesForTarget( matrix, target.id, themes.length ? themes : noSweep ? [ matrix.themes.default ] : [] )
				: [ null ];
			return selectedThemes.map( ( theme ) => ( { suite, target, ...combo, theme } ) );
		} ) );
	} );
}
