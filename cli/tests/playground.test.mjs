import test from 'node:test';
import assert from 'node:assert/strict';
import { playgroundConfig, projectId, selectedPlugins, assertCompatibleState, allocatePorts, safeSnapshotName, renderPlayground } from '../lib/playground-config.mjs';
import { validateZipEntries } from '../commands/playground.mjs';

const starter = { slug: 'sample', editions: { free: { dir: 'sample', enabled: true }, pro: { dir: 'sample-pro', enabled: true } } };
const matrix = { targets: [ { id: 'latest', php: '8.4' } ] };

test( 'old projects need no config and both editions retain dependency order', () => {
	assert.deepEqual( playgroundConfig( starter, matrix ), { wp: 'latest', php: '8.4', multisite: false, edition: 'both', plugins: [], ports: {} } );
	assert.deepEqual( selectedPlugins( starter, 'both' ), [ 'sample', 'sample-pro' ] );
	assert.deepEqual( selectedPlugins( starter, 'free' ), [ 'sample' ] );
	assert.deepEqual( selectedPlugins( starter, 'pro' ), [ 'sample', 'sample-pro' ] );
	const freeOnly = { ...starter, editions: { free: starter.editions.free } };
	assert.deepEqual( selectedPlugins( freeOnly, 'both' ), [ 'sample' ] );
	assert.throws( () => selectedPlugins( freeOnly, 'pro' ), /not enabled/ );
	assert.throws( () => selectedPlugins( starter, 'bad' ) );
} );

test( 'invalid playground config is rejected before Docker runs', () => {
	for ( const playground of [ { wp: 'nightly' }, { php: '8.4;bad' }, { multisite: 1 }, { plugins: [ 1 ] }, { ports: { wordpress: 80 } }, { ports: { wordpress: 8080, mailpit: 8080 } }, { ports: { other: 9000 } } ] ) {
		assert.throws( () => playgroundConfig( { ...starter, playground }, matrix ) );
	}
} );

test( 'port allocation reserves explicit ports and skips occupied defaults', async () => {
	const available = async ( port ) => ! [ 8080, 8081 ].includes( port );
	assert.deepEqual( await allocatePorts( {}, available ), { wordpress: 8082, mailpit: 8083, database: 13308 } );
	assert.deepEqual( await allocatePorts( { mailpit: 8082 }, available ), { mailpit: 8082, wordpress: 8083, database: 13308 } );
	await assert.rejects( allocatePorts( { wordpress: 8080 }, available ), /occupied/ );
} );

test( 'existing state pins core, mode and ports instead of silently changing a site', () => {
	const cfg = playgroundConfig( starter, matrix );
	const state = { wpSpec: 'latest', wpVersion: '7.1', php: '8.4', multisite: false, ports: { wordpress: 8080 } };
	assertCompatibleState( state, cfg );
	for ( const changed of [ { wp: '6.6' }, { php: '7.4' }, { multisite: true }, { ports: { wordpress: 8081 } } ] ) {
		assert.throws( () => assertCompatibleState( state, { ...cfg, ...changed } ), /reset/ );
	}
} );

test( 'compose isolates copies, binds only loopback, and never mounts plugin sources', () => {
	assert.notEqual( projectId( '/one', 'sample' ), projectId( '/two', 'sample' ) );
	const state = { project: projectId( '/one', 'sample' ), ports: { wordpress: 8080, mailpit: 8081, database: 13308 }, wpVersion: '7.1', php: '8.4', url: 'http://localhost:8080', multisite: false };
	const config = renderPlayground( '/one', '/one/.wplab/playground', state );
	assert.equal( config.name, state.project );
	for ( const service of Object.values( config.services ) ) for ( const port of service.ports ) assert.match( port, /^127\.0\.0\.1:/ );
	assert.ok( config.services.wordpress.volumes.includes( 'wordpress:/var/www/html' ) );
	assert.ok( ! JSON.stringify( config ).includes( '/one/plugins' ) );
	assert.equal( config.services.wordpress.volumes.find( ( v ) => v.target === '/zips' ).read_only, true );
} );

test( 'snapshot names and zip entries cannot escape their directories', () => {
	assert.equal( safeSnapshotName( 'before-upgrade_1' ), 'before-upgrade_1' );
	for ( const bad of [ '../outside', '/tmp/file', '', '-flag', 'a/b', 'a'.repeat( 81 ) ] ) assert.throws( () => safeSnapshotName( bad ) );
	assert.equal( validateZipEntries( 'sample/\nsample/sample.php\nsample/build/index.js\n' ), 'sample' );
	for ( const bad of [ '', '../file', '/sample/file', 'sample/../outside', 'C:\\file', 'one/file\ntwo/file', '-flag/file' ] ) assert.throws( () => validateZipEntries( bad ) );
} );
