import { parseArgs, listFlag } from '../lib/args.mjs';
import { resolveMatrix, selectTargets } from '../lib/matrix.mjs';
import { assertDocker, syncCompose } from '../lib/docker.mjs';
import { runSuite, resolveEditions, printSummary } from '../lib/runner.mjs';
import { createTestPlan, normalizeSuites } from '../lib/test-plan.mjs';
import { runE2e } from '../lib/e2e.mjs';
import { log } from '../lib/log.mjs';

export async function run( argv ) {
	const { positional, flags } = parseArgs( argv, { booleans: [ 'coverage', 'headed', 'bail', 'no-sweep' ] } );
	const matrix = await resolveMatrix();
	const requested = positional.length ? positional : listFlag( flags.suite );
	const suites = normalizeSuites( requested.length ? requested : undefined );
	const targets = selectTargets( matrix, listFlag( flags.targets ) );
	const editions = resolveEditions( flags.edition );
	const plan = createTestPlan( { matrix, targets, editions, suites,
		themes: listFlag( flags.themes || flags.theme ), noSweep: flags[ 'no-sweep' ] } );
	if ( suites.some( ( suite ) => suite !== 'types' ) ) {
		await assertDocker();
		syncCompose( matrix );
	}
	log.step( 'Suites: ' + suites.join( ', ' ) + ' | targets: ' + targets.map( ( t ) => t.id ).join( ', ' ) );
	const rows = [];
	for ( const entry of plan ) {
		const options = { ...entry, matrix, filter: flags.filter, coverage: flags.coverage,
			headed: flags.headed, onLog: ( text ) => process.stdout.write( text ) };
		const result = await ( entry.suite === 'e2e' ? runE2e( options ) : runSuite( options ) );
		rows.push( { label: [ entry.target.id, entry.pkg?.key ?? entry.edition, entry.theme?.alias, entry.suite ]
			.filter( Boolean ).join( '-' ), ...result } );
		if ( ! result.ok && flags.bail ) break;
	}
	return printSummary( rows );
}
