import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { packageScript } from '../../cli/commands/build.mjs';
import { installTargets } from '../../cli/commands/skills.mjs';
import { pluginCheckPassed } from '../../cli/lib/plugin-check.mjs';
import { createJobQueue } from '../../dashboard/job-queue.mjs';
import { createTestPlan } from '../../cli/lib/test-plan.mjs';
import { selectTargets } from '../../cli/lib/matrix.mjs';
import { validateSchema, validateCompatibility } from '../../cli/lib/config-validation.mjs';
import { adaptSkillText, validateSkillResources, resolveSkillDependencies } from '../../cli/lib/skill-paths.mjs';

const read = ( file ) => JSON.parse( fs.readFileSync( new URL( '../../' + file, import.meta.url ) ) );
// Tooling tests travel with upgrade: never depend on the receiving plugin's identity or editions.
const starter = {
	name: 'Fixture', slug: 'fixture', namespace: 'Fixture', constantPrefix: 'FIXTURE',
	hookPrefix: 'fixture', textDomain: 'fixture', requiresWp: '6.6', requiresPhp: '7.4',
	editions: { free: { dir: 'fixture', enabled: true }, pro: { dir: 'fixture-pro', enabled: true } },
};
const raw = {
	targets: [ { id: 'latest', wp: 'latest', php: '8.4', port: 8091 }, { id: 'min', wp: '6.6', php: '7.4', port: 8094 } ],
	editions: [ 'free', 'pro' ], ports: { dashboard: 7777 },
	themes: {
		default: 'twentytwentyfour',
		sweep: { targets: [ 'latest' ], themes: [ 'twentytwentyfive', 'twentytwentyfour', 'twentytwentyone' ] },
		available: [ { slug: 'twentytwentyfive', requiresWp: '6.7' }, { slug: 'twentytwentyfour', requiresWp: '6.4' }, { slug: 'twentytwentyone', requiresWp: '5.6' } ],
	},
};
const matrix = { ...raw, targets: raw.targets.map( ( target ) => ( { ...target, wpVersion: target.wp === 'latest' ? '7.0' : target.wp } ) ) };

test( 'packaging stops before zip when Composer fails', () => {
	// Stub every external operation: exercise the actual generated shell without touching PHP or Docker.
	const prelude = `
rm() { :; }; mkdir() { :; }; rsync() { :; }; cp() { :; };
composer() { return 42; }; zip() { echo unexpected-zip; };
cd() { :; }; wp() { :; }; find() { :; };
[() { if test "$1" = -f; then return 0; else return 1; fi; };
`;
	const result = spawnSync( 'bash', [ '-c', prelude + packageScript( 'my-plugin', '0.1.0' ) ], { encoding: 'utf8' } );
	assert.equal( result.status, 42, result.stderr );
	assert.ok( ! result.stdout.includes( 'unexpected-zip' ) );
} );

test( 'Plugin Check distinguishes valid reports from failures and malformed output', () => {
	assert.equal( pluginCheckPassed( { code: 0, stdout: '[]' } ), true );
	assert.equal( pluginCheckPassed( { code: 0, stdout: 'Success: Checks complete. No errors found.\n' } ), true );
	assert.equal( pluginCheckPassed( { code: 1, stdout: 'Success: Checks complete. No errors found.' } ), false );
	assert.equal( pluginCheckPassed( { code: 0, stdout: '[{"type":"WARNING"}]' } ), true );
	for ( const stdout of [ '', 'Success!', '{}', '[{}]', '[{"type":"ERROR"}]', 'Warning: boot failed\n[]' ] ) {
		assert.equal( pluginCheckPassed( { code: 0, stdout } ), false, stdout );
	}
	assert.equal( pluginCheckPassed( { code: 1, stdout: '[]' } ), false );
} );

test( 'a rejected queue job does not prevent subsequent work', async () => {
	const enqueue = createJobQueue();
	const calls = [];
	const first = enqueue( async () => { calls.push( 1 ); throw new Error( 'state refresh failed' ); } );
	const second = enqueue( async () => { calls.push( 2 ); return 42; } );
	await assert.rejects( first, /state refresh/ );
	assert.equal( await second, 42 );
	assert.deepEqual( calls, [ 1, 2 ] );
} );

test( 'CLI and dashboard plan static suites once per package, e2e per edition and theme', () => {
	const packages = [ { key: 'free', dir: 'fixture' }, { key: 'proaddon', dir: 'fixture-pro' } ];
	const options = { matrix, targets: selectTargets( matrix, [ 'latest' ] ), editions: [ 'free', 'pro' ], packages };
	for ( const suite of [ 'types', 'plugin-check', 'unit' ] ) {
		const plan = createTestPlan( { ...options, suites: [ suite ] } );
		assert.equal( plan.length, 2 );
		assert.ok( plan.every( ( entry ) => entry.edition === null ) );
	}
	assert.equal( createTestPlan( { ...options, suites: [ 'e2e' ] } ).length, 6 );
	assert.equal( createTestPlan( { ...options, suites: [ 'e2e' ], noSweep: true } ).length, 2 );
	assert.equal( createTestPlan( { ...options, suites: [ 'types' ], editions: [ 'free' ] } ).length, 1 );
	assert.equal( createTestPlan( { ...options, suites: [ 'types' ], editions: [ 'free' ], packages: packages.slice( 0, 1 ) } )[ 0 ].pkg.dir, 'fixture' );
	assert.deepEqual( createTestPlan( { ...options, suites: [ 'integration' ] } ).map( ( entry ) => [ entry.edition, entry.pkg.key ] ),
		[ [ 'free', 'free' ], [ 'pro', 'pro' ], [ 'pro', 'proaddon' ] ] );
	assert.throws( () => createTestPlan( { ...options, suites: [ 'typo' ] } ), /Unknown/ );
	assert.throws( () => selectTargets( matrix, [ 'typo' ] ), /Unknown target/ );
} );

test( 'schemas and cross-file validation reject dangerous or inconsistent configuration', () => {
	validateSchema( starter, read( 'docs/starter.schema.json' ) );
	validateSchema( raw, read( 'docs/matrix.schema.json' ) );
	validateCompatibility( starter, raw );
	const badDir = structuredClone( starter );
	badDir.editions.free.dir = '../outside';
	assert.throws( () => validateSchema( badDir, read( 'docs/starter.schema.json' ) ), /must match/ );
	for ( const mutate of [
		( m ) => { m.ports.dashboard = m.targets[ 0 ].port; },
		( m ) => { m.targets[ 1 ].id = m.targets[ 0 ].id; },
		( m ) => { m.targets.find( ( target ) => target.id === 'min' ).wp = '6.8'; },
		( m ) => { m.themes.sweep.targets = [ 'missing' ]; },
		( m ) => { m.themes.default = 'twentytwentyfive'; },
	] ) {
		const invalid = structuredClone( raw ); mutate( invalid );
		assert.throws( () => validateCompatibility( starter, invalid ) );
	}
} );

test( 'CI tooling and type checks do not depend on product-owned npm scripts or a starter slug', () => {
	const workflow = fs.readFileSync( new URL( '../../.github/workflows/ci.yml', import.meta.url ), 'utf8' );
	assert.ok( workflow.includes( 'node --test cli/tests/*.test.mjs' ) );
	assert.ok( workflow.includes( './bin/wpx test types --targets=${{ matrix.id }} --edition=both' ) );
	assert.ok( ! workflow.includes( 'plugins/my-plugin' ) );
	assert.ok( ! workflow.includes( 'npm run test:cli' ) );
} );

test( 'installed skill resource paths are adapted idempotently and missing resources fail', () => {
	const source = '`node skills/wp-project-triage/scripts/detect_wp_project.mjs`';
	const adapted = adaptSkillText( source );
	assert.equal( adapted, '`node .agents/skills/wp-project-triage/scripts/detect_wp_project.mjs`' );
	assert.equal( adaptSkillText( adapted ), adapted );
	const root = fs.mkdtempSync( path.join( os.tmpdir(), 'wplab-skill-test-' ) );
	try {
		fs.writeFileSync( path.join( root, 'SKILL.md' ), adapted );
		assert.throws( () => validateSkillResources( root, root ), /missing resource/ );
		const resource = path.join( root, '.agents/skills/wp-project-triage/scripts' );
		fs.mkdirSync( resource, { recursive: true } );
		fs.writeFileSync( path.join( resource, 'detect_wp_project.mjs' ), '' );
		validateSkillResources( root, root );
	} finally { fs.rmSync( root, { recursive: true, force: true } ); }
} );

test( 'skill synchronization preserves local work and only removes previously managed skills', () => {
	const root = fs.mkdtempSync( path.join( os.tmpdir(), 'wplab-sync-test-' ) );
	const put = ( relative, text ) => {
		const file = path.join( root, relative );
		fs.mkdirSync( path.dirname( file ), { recursive: true } );
		fs.writeFileSync( file, text );
	};
	try {
		for ( const target of [ '.agents', '.claude' ] ) {
			put( `${ target }/skills/obsolete/SKILL.md`, 'previously managed' );
			put( `${ target }/skills/custom/SKILL.md`, 'user work' );
		}
		put( '.agents/skills/wp-plugin-lab/SKILL.md', 'local rules' );
		for ( const [ target, directory ] of [ [ 'codex', '.codex' ], [ 'claude', '.claude' ] ] ) {
			put( `checkout/dist/${ target }/${ directory }/skills/example/SKILL.md`, 'node skills/example/scripts/check.mjs' );
			put( `checkout/dist/${ target }/${ directory }/skills/example/scripts/check.mjs`, 'export default 1;' );
		}
		const install = ( dryRun ) => installTargets( path.join( root, 'checkout' ), [ 'codex', 'claude' ],
			[ 'example' ], { skills: [ 'obsolete' ] }, dryRun, root );
		install( true );
		assert.ok( fs.existsSync( path.join( root, '.agents/skills/obsolete/SKILL.md' ) ) );
		assert.ok( ! fs.existsSync( path.join( root, '.agents/skills/example' ) ) );
		install( false );
		for ( const target of [ '.agents', '.claude' ] ) {
			assert.equal( fs.readFileSync( path.join( root, `${ target }/skills/wp-plugin-lab/SKILL.md` ), 'utf8' ), 'local rules' );
			assert.equal( fs.readFileSync( path.join( root, `${ target }/skills/custom/SKILL.md` ), 'utf8' ), 'user work' );
			assert.ok( ! fs.existsSync( path.join( root, `${ target }/skills/obsolete` ) ) );
			validateSkillResources( path.join( root, `${ target }/skills` ), root );
		}
	} finally { fs.rmSync( root, { recursive: true, force: true } ); }
} );

test( 'older skill selections include transitive resource dependencies without changing the selection', () => {
	const root = fs.mkdtempSync( path.join( os.tmpdir(), 'wplab-dependencies-test-' ) );
	const put = ( name, text ) => {
		const dir = path.join( root, 'skills', name );
		fs.mkdirSync( dir, { recursive: true } );
		fs.writeFileSync( path.join( dir, 'SKILL.md' ), text );
	};
	try {
		put( 'wordpress-router', 'node skills/wp-project-triage/scripts/detect_wp_project.mjs' );
		put( 'wp-project-triage', 'See .agents/skills/helper/references/guide.md' );
		put( 'helper', 'See skills/wordpress-router/references/router.md' );
		const selected = [ 'wordpress-router' ];
		assert.deepEqual( resolveSkillDependencies( root, selected ), [ 'wordpress-router', 'wp-project-triage', 'helper' ] );
		assert.deepEqual( selected, [ 'wordpress-router' ] );
		assert.deepEqual( resolveSkillDependencies( root, [ ...selected, ...selected ] ), [ 'wordpress-router', 'wp-project-triage', 'helper' ] );
		put( 'helper', 'See skills/missing/scripts/check.mjs' );
		assert.throws( () => resolveSkillDependencies( root, selected ), /Missing skill dependency: missing/ );
		assert.throws( () => resolveSkillDependencies( root, [ '../outside' ] ), /Invalid skill name/ );
	} finally { fs.rmSync( root, { recursive: true, force: true } ); }
} );
