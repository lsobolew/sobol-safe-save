/** Opt-in Docker/browser integration test. Creates and removes only its own temporary projects. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../..' );
const temp = fs.mkdtempSync( path.join( os.tmpdir(), 'wplab-playground-smoke-' ) );
const projects = [];
const put = ( root, name, text ) => {
	const file = path.join( root, name );
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, text );
};
const execute = ( root, args, expected = 0 ) => {
	const result = spawnSync( process.execPath, [ path.join( root, 'bin/wpx' ), 'playground', ...args ], { cwd: root, encoding: 'utf8', timeout: 360000 } );
	assert.equal( result.status, expected, `${ args.join( ' ' ) }\n${ result.stdout }\n${ result.stderr }` );
	return result.stdout.trim();
};
const wp = ( root, ...args ) => execute( root, [ 'wp', '--', ...args ] );
const state = ( root ) => JSON.parse( fs.readFileSync( path.join( root, '.wplab/playground/state.json' ) ) );
const create = ( name, multisite ) => {
	const root = path.join( temp, name );
	fs.mkdirSync( root );
	projects.push( root );
	for ( const dir of [ 'cli', 'bin', 'env', 'docs' ] ) fs.cpSync( path.join( source, dir ), path.join( root, dir ), { recursive: true, filter: ( file ) => ! file.endsWith( 'docker-compose.gen.yml' ) && ! file.endsWith( 'docker-compose.override.yml' ) } );
	const starter = { name: 'Playground fixture', slug: 'playground-fixture', namespace: 'PlaygroundFixture', constantPrefix: 'PLAYGROUND_FIXTURE', hookPrefix: 'playground_fixture', textDomain: 'playground-fixture', requiresWp: '6.6', requiresPhp: '7.4',
		editions: { free: { dir: 'playground-fixture', enabled: true }, pro: { dir: 'playground-fixture-pro', enabled: true } },
		playground: { multisite, ...( multisite ? { wp: '6.6', php: '7.4' } : {} ) } };
	put( root, 'starter.json', JSON.stringify( starter ) );
	put( root, 'wp-matrix.json', JSON.stringify( { targets: [ { id: 'latest', wp: 'latest', php: '8.4', port: 19001 }, { id: 'min', wp: '6.6', php: '7.4', port: 19002 } ] } ) );
	for ( const slug of [ 'playground-fixture', 'playground-fixture-pro' ] ) {
		put( root, `plugins/${ slug }/${ slug }.php`, `<?php\n/**\n * Plugin Name: ${ slug }\n * Version: 0.1.0\n */\n` );
		put( root, `plugins/${ slug }/.distignore`, '.distignore\n' );
	}
	return root;
};

try {
	const single = create( 'single', false );
	console.log( 'Smoke: first boot, latest stable, Free + Pro' );
	execute( single, [ 'up' ] );
	wp( single, 'plugin', 'is-active', 'playground-fixture-pro' );
	wp( single, 'plugin', 'is-active', 'user-switching' );
	assert.equal( wp( single, 'core', 'version' ), state( single ).wpVersion );
	assert.equal( JSON.parse( wp( single, 'user', 'list', '--format=json' ) ).length, 6 );
	const counts = wp( single, 'post', 'list', '--post_type=any', '--post_status=any', '--format=count' );
	wp( single, 'user', 'update', 'author', '--display_name=Preserved Author', '--user_pass=custom-password' );
	wp( single, 'option', 'update', 'playground_manual', 'preserved' );
	console.log( 'Smoke: repeated build, idempotent seeding and edition changes' );
	execute( single, [ 'up', '--edition=free' ] );
	assert.equal( wp( single, 'post', 'list', '--post_type=any', '--post_status=any', '--format=count' ), counts );
	assert.equal( wp( single, 'user', 'get', 'author', '--field=display_name' ), 'Preserved Author' );
	assert.equal( wp( single, 'option', 'get', 'playground_manual' ), 'preserved' );
	assert.match( wp( single, 'eval', 'echo wp_check_password("custom-password", get_user_by("login", "author")->user_pass) ? "preserved" : "lost";' ), /preserved/ );
	assert.equal( wp( single, 'plugin', 'get', 'playground-fixture-pro', '--field=status' ), 'inactive' );
	execute( single, [ 'install', path.join( single, 'dist/playground-fixture-pro-0.1.0.zip' ) ] );
	execute( single, [ 'install', 'classic-editor' ] );
	wp( single, 'plugin', 'is-active', 'classic-editor' );
	console.log( 'Smoke: database snapshots, confirmation and restore' );
	execute( single, [ 'snapshot', 'before' ] );
	wp( single, 'option', 'update', 'playground_manual', 'changed' );
	execute( single, [ 'restore', 'before' ], 1 );
	assert.equal( wp( single, 'option', 'get', 'playground_manual' ), 'changed' );
	execute( single, [ 'restore', 'before', '--yes' ] );
	assert.equal( wp( single, 'option', 'get', 'playground_manual' ), 'preserved' );
	execute( single, [ 'reset' ], 1 );
	console.log( 'Smoke: Mailpit and browser user switching' );
	wp( single, 'eval', 'if (!wp_mail("reader@example.test", "Playground smoke", "Hello")) { WP_CLI::error("Mail failed"); }' );
	const mail = await fetch( `http://localhost:${ state( single ).ports.mailpit }/api/v1/messages` ).then( ( r ) => r.json() );
	assert.ok( mail.messages.some( ( m ) => m.Subject === 'Playground smoke' ) );
	const { chromium } = await import( 'playwright' );
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto( `${ state( single ).url }/wp-login.php` );
		await page.locator( '#user_login' ).fill( 'admin' );
		await page.locator( '#user_pass' ).fill( 'password' );
		await Promise.all( [ page.waitForURL( '**/wp-admin/**' ), page.locator( '#wp-submit' ).click() ] );
		await page.goto( `${ state( single ).url }/wp-admin/media-new.php?browser-uploader` );
		await page.locator( '#async-upload' ).setInputFiles( { name: 'playground-smoke.png', mimeType: 'image/png', buffer: Buffer.from( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64' ) } );
		await Promise.all( [ page.waitForURL( '**/upload.php**' ), page.locator( '#html-upload' ).click() ] );
		assert.equal( wp( single, 'post', 'list', '--post_type=attachment', '--name=playground-smoke', '--format=count' ), '1' );
		await page.goto( `${ state( single ).url }/wp-admin/users.php` );
		const authorId = wp( single, 'user', 'get', 'author', '--field=ID' );
		await page.locator( `#user-${ authorId }` ).hover();
		await page.locator( `#user-${ authorId }` ).getByRole( 'link', { name: /^Switch to /i } ).click();
		await page.waitForLoadState( 'domcontentloaded' );
		assert.match( await page.locator( 'body' ).innerText(), /Preserved Author/ );
		assert.match( await page.locator( 'body' ).innerText(), /Switch\s+back/i );
	} finally { await browser.close(); }
	const multi = create( 'multi', true );
	console.log( 'Smoke: second isolated playground, WP 6.6/PHP 7.4 multisite' );
	execute( multi, [ 'up' ] );
	assert.notEqual( state( single ).project, state( multi ).project );
	assert.equal( new Set( [ ...Object.values( state( single ).ports ), ...Object.values( state( multi ).ports ) ] ).size, 6 );
	assert.equal( wp( multi, 'eval', 'echo is_multisite() && is_super_admin(get_user_by("login", "admin")->ID) && !is_super_admin(get_user_by("login", "admin2")->ID) ? "correct" : "wrong";' ), 'correct' );
	assert.equal( wp( multi, 'plugin', 'get', 'user-switching', '--field=status' ), 'active-network' );
	console.log( 'Smoke: reset one sandbox without affecting the other' );
	execute( multi, [ 'reset', '--yes' ] );
	assert.equal( wp( single, 'option', 'get', 'playground_manual' ), 'preserved' );
	execute( single, [ 'down' ] );
	execute( single, [ 'up' ] );
	assert.equal( wp( single, 'option', 'get', 'playground_manual' ), 'preserved' );
	console.log( 'Playground integration smoke: PASS' );
} finally {
	for ( const root of projects ) {
		const file = path.join( root, '.wplab/playground/compose.json' );
		if ( fs.existsSync( file ) ) {
			const result = spawnSync( 'docker', [ 'compose', '-f', file, 'down', '--volumes' ], { encoding: 'utf8' } );
			if ( result.status !== 0 ) console.error( `Cleanup failed for ${ root }: ${ result.stderr }` );
		}
	}
	console.log( `Diagnostic files retained at ${ temp }; temporary sandbox volumes removed.` );
}
