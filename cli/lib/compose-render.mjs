import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths.mjs';
import { pluginDirs, starter } from './config.mjs';

/**
 * Docker Compose project name, derived from the plugin slug.
 *
 * Two repositories built from this starter would otherwise share one project, one set of
 * containers and one set of volumes - so working on a second plugin would quietly tear down the
 * first one's environment.
 */
export function projectName() {
	const slug = ( starter().slug || 'plugin' ).replace( /[^a-z0-9-]/gi, '-' ).toLowerCase();

	return `wplab-${ slug }`;
}
export const DB_ROOT_PASSWORD = 'wordpress';
export const ADMIN_USER = 'admin';
export const ADMIN_PASSWORD = 'password';
export const ADMIN_EMAIL = 'admin@example.test';

const q = ( v ) => JSON.stringify( String( v ) );

/**
 * Renders the complete compose file from the resolved matrix.
 * Everything lives in a single "wplab" project: one shared database, one Mailpit and one WordPress
 * service per target, each behind its own profile so you can start just the versions you need.
 */
export function renderCompose( matrix ) {
	const plugins = pluginDirs();

	// Only mount themes that actually exist on disk: a configured-but-missing directory would make
	// Docker create an empty one and WordPress would list a broken theme.
	const localThemes = ( matrix.themes?.available || [] ).filter(
		( theme ) =>
			theme.source === 'local' && fs.existsSync( path.join( paths.root, theme.path ) )
	);

	const mailpitUi = matrix.ports?.mailpitUi || 8025;
	const dbImage = matrix.defaults?.db || 'mariadb:11';

	const lines = [];
	lines.push( '# GENERATED FILE - do not edit by hand.' );
	lines.push( '# Source: wp-matrix.json + starter.json; regenerate with ./bin/wpx compose' );
	lines.push( `name: ${ projectName() }` );
	lines.push( '' );
	lines.push( 'services:' );

	// --- database shared by every target (one schema per target) ---
	lines.push( '  db:' );
	lines.push( `    image: ${ dbImage }` );
	lines.push( '    command:' );
	lines.push( '      - --max_allowed_packet=64M' );
	lines.push( '      - --sql-mode=NO_ENGINE_SUBSTITUTION' );
	lines.push( '    environment:' );
	lines.push( `      MARIADB_ROOT_PASSWORD: ${ q( DB_ROOT_PASSWORD ) }` );
	lines.push( '      MARIADB_ROOT_HOST: "%"' );
	lines.push( '    ports:' );
	// Exposed so a database client on the host can reach it; configurable because two projects
	// built from this starter would otherwise fight over the same host port.
	lines.push( `      - "${ matrix.ports?.database || 13306 }:3306"` );
	lines.push( '    volumes:' );
	lines.push( '      - db-data:/var/lib/mysql' );
	lines.push( '    healthcheck:' );
	lines.push(
		'      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]'
	);
	lines.push( '      interval: 5s' );
	lines.push( '      timeout: 5s' );
	lines.push( '      retries: 30' );
	lines.push( '      start_period: 30s' );
	lines.push( '' );

	// --- catches the mail sent by every instance ---
	lines.push( '  mailpit:' );
	lines.push( '    image: axllent/mailpit:latest' );
	lines.push( '    ports:' );
	lines.push( `      - "${ mailpitUi }:8025"` );
	lines.push( '    environment:' );
	lines.push( '      MP_MAX_MESSAGES: "500"' );
	lines.push( '      MP_SMTP_AUTH_ACCEPT_ANY: "1"' );
	lines.push( '      MP_SMTP_AUTH_ALLOW_INSECURE: "1"' );
	lines.push( '' );

	for ( const t of matrix.targets ) {
		lines.push( `  ${ t.service }:` );
		lines.push( '    build:' );
		lines.push( '      context: .' );
		lines.push( '      dockerfile: Dockerfile' );
		lines.push( '      args:' );
		lines.push( `        PHP_VERSION: ${ q( t.php ) }` );
		lines.push( `    image: wplab/wp:php${ t.php }` );
		lines.push( `    profiles: [${ q( t.id ) }, "all"]` );
		lines.push( '    depends_on:' );
		lines.push( '      db:' );
		lines.push( '        condition: service_healthy' );
		lines.push( '    ports:' );
		lines.push( `      - "${ t.port }:80"` );
		lines.push( '    environment:' );
		lines.push( `      WPLAB_ID: ${ q( t.id ) }` );
		lines.push( `      WP_VERSION: ${ q( t.wpVersion ) }` );
		lines.push( `      WP_LOCALE: ${ q( t.locale ) }` );
		lines.push( `      WP_MULTISITE: ${ q( t.multisite ? '1' : '0' ) }` );
		lines.push( `      WP_SITE_URL: ${ q( t.url ) }` );
		lines.push( '      WP_DB_HOST: "db"' );
		lines.push( '      WP_DB_USER: "root"' );
		lines.push( `      WP_DB_PASSWORD: ${ q( DB_ROOT_PASSWORD ) }` );
		lines.push( `      WP_DB_NAME: ${ q( t.dbName ) }` );
		lines.push( `      WP_TEST_DB_NAME: ${ q( t.testDbName ) }` );
		lines.push( `      WP_ADMIN_USER: ${ q( ADMIN_USER ) }` );
		lines.push( `      WP_ADMIN_PASSWORD: ${ q( ADMIN_PASSWORD ) }` );
		lines.push( `      WP_ADMIN_EMAIL: ${ q( ADMIN_EMAIL ) }` );
		lines.push(
			`      WPLAB_PLUGINS: ${ q( plugins.map( ( p ) => p.dir ).join( ' ' ) ) }`
		);
		lines.push(
			`      WPLAB_FREE_PLUGINS: ${ q(
				plugins
					.filter( ( p ) => p.edition === 'free' )
					.map( ( p ) => p.dir )
					.join( ' ' )
			) }`
		);
		// Themes pulled from WordPress.org are installed by the entrypoint; local ones are
		// mounted below, the same way plugins are.
		lines.push(
			`      WPLAB_THEMES: ${ q(
				( matrix.themes?.available || [] )
					.filter( ( theme ) => theme.source === 'wporg' )
					.map( ( theme ) => theme.slug )
					.join( ' ' )
			) }`
		);
		lines.push( `      WPLAB_DEFAULT_THEME: ${ q( matrix.themes?.default || '' ) }` );
		lines.push(
			'      XDEBUG_MODE: "${XDEBUG_MODE:-' + ( matrix.defaults?.xdebug || 'off' ) + '}"'
		);
		lines.push( '      PHP_IDE_CONFIG: "serverName=wplab"' );
		lines.push( '    volumes:' );
		lines.push( `      - core-${ t.id }:/var/www/html` );
		lines.push( '      - ../.wplab:/wplab' );
		// The environment scripts are mounted rather than only baked into the image, so a fix in
		// the entrypoint takes effect on a plain restart instead of rebuilding every PHP image.
		lines.push( '      - ./bin:/usr/local/wplab:ro' );
		lines.push( '      - ./conf/php.ini:/usr/local/etc/php/conf.d/zz-wplab.ini:ro' );
		lines.push( '      - ./conf/xdebug.ini:/usr/local/etc/php/conf.d/zzz-xdebug.ini:ro' );
		for ( const p of plugins ) {
			lines.push(
				`      - ../plugins/${ p.dir }:/var/www/html/wp-content/plugins/${ p.dir }`
			);
		}

		for ( const theme of localThemes ) {
			lines.push(
				`      - ../${ theme.path }:/var/www/html/wp-content/themes/${ theme.slug }`
			);
		}
		lines.push( '    healthcheck:' );
		lines.push( '      test: ["CMD", "test", "-f", "/var/www/html/.wplab-ready"]' );
		lines.push( '      interval: 5s' );
		lines.push( '      timeout: 3s' );
		lines.push( '      retries: 120' );
		lines.push( '      start_period: 10s' );
		lines.push( '    extra_hosts:' );
		lines.push( '      - "host.docker.internal:host-gateway"' );
		lines.push( '' );
	}

	lines.push( 'volumes:' );
	lines.push( '  db-data:' );
	for ( const t of matrix.targets ) {
		lines.push( `  core-${ t.id }:` );
	}
	lines.push( '' );

	return lines.join( '\n' );
}

export function writeCompose( matrix ) {
	const yaml = renderCompose( matrix );
	fs.mkdirSync( path.dirname( paths.compose ), { recursive: true } );
	fs.writeFileSync( paths.compose, yaml );
	return paths.compose;
}
