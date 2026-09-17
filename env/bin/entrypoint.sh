#!/usr/bin/env bash
# Prepares a WordPress instance for one matrix target, then hands control over to Apache.
set -euo pipefail

WPLAB_ID="${WPLAB_ID:-default}"
WP_VERSION="${WP_VERSION:-latest}"
WP_LOCALE="${WP_LOCALE:-en_US}"
WP_MULTISITE="${WP_MULTISITE:-0}"
WP_SITE_URL="${WP_SITE_URL:-http://localhost}"
WP_DB_HOST="${WP_DB_HOST:-db}"
WP_DB_USER="${WP_DB_USER:-root}"
WP_DB_PASSWORD="${WP_DB_PASSWORD:-wordpress}"
WP_DB_NAME="${WP_DB_NAME:-wordpress}"
WP_TEST_DB_NAME="${WP_TEST_DB_NAME:-wordpress_test}"
WP_ADMIN_USER="${WP_ADMIN_USER:-admin}"
WP_ADMIN_PASSWORD="${WP_ADMIN_PASSWORD:-password}"
WP_ADMIN_EMAIL="${WP_ADMIN_EMAIL:-admin@example.test}"
WPLAB_PLUGINS="${WPLAB_PLUGINS:-}"
WPLAB_DEV_PLUGINS="${WPLAB_DEV_PLUGINS:-query-monitor wp-crontrol}"
WPLAB_THEMES="${WPLAB_THEMES:-}"
WPLAB_DEFAULT_THEME="${WPLAB_DEFAULT_THEME:-}"

READY_FLAG=/var/www/html/.wplab-ready
CORE_MARKER=/var/www/html/.wplab-core-version
WP="wp --allow-root --path=/var/www/html"

say() { printf '\033[36m[wplab:%s]\033[0m %s\n' "${WPLAB_ID}" "$*"; }
warn() { printf '\033[33m[wplab:%s]\033[0m %s\n' "${WPLAB_ID}" "$*"; }

rm -f "${READY_FLAG}"
mkdir -p /wplab/logs /wplab/results /wplab/cache
chmod -R 777 /wplab 2>/dev/null || true

# --- 1. database -----------------------------------------------------------
say "waiting for database ${WP_DB_HOST}"
for i in $(seq 1 60); do
	if mysqladmin ping -h"${WP_DB_HOST}" -u"${WP_DB_USER}" -p"${WP_DB_PASSWORD}" --silent 2>/dev/null; then
		break
	fi
	[ "$i" = 60 ] && { warn "the database did not answer within 60s"; exit 1; }
	sleep 1
done

mysql -h"${WP_DB_HOST}" -u"${WP_DB_USER}" -p"${WP_DB_PASSWORD}" -e \
	"CREATE DATABASE IF NOT EXISTS \`${WP_DB_NAME}\` DEFAULT CHARACTER SET utf8mb4;
	 CREATE DATABASE IF NOT EXISTS \`${WP_TEST_DB_NAME}\` DEFAULT CHARACTER SET utf8mb4;"

# --- 2. WordPress core -----------------------------------------------------
CURRENT_CORE="$(cat "${CORE_MARKER}" 2>/dev/null || echo none)"
if [ "${CURRENT_CORE}" != "${WP_VERSION}" ] || [ ! -f /var/www/html/wp-includes/version.php ]; then
	say "downloading WordPress ${WP_VERSION} (was: ${CURRENT_CORE})"
	${WP} core download --version="${WP_VERSION}" --locale="${WP_LOCALE}" --force
	echo "${WP_VERSION}" > "${CORE_MARKER}"
	CORE_CHANGED=1
else
	CORE_CHANGED=0
fi
mkdir -p /var/www/html/wp-content/plugins /var/www/html/wp-content/themes /var/www/html/wp-content/uploads

# --- 3. wp-config.php ------------------------------------------------------
if [ ! -f /var/www/html/wp-config.php ]; then
	say "writing wp-config.php"
	EXTRA_PHP=$(cat <<PHP
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', '/wplab/logs/wp-${WPLAB_ID}.log' );
define( 'WP_DEBUG_DISPLAY', false );
define( 'SCRIPT_DEBUG', true );
define( 'WP_ENVIRONMENT_TYPE', 'local' );
define( 'FS_METHOD', 'direct' );
define( 'AUTOMATIC_UPDATER_DISABLED', true );
define( 'WP_AUTO_UPDATE_CORE', false );
define( 'DISALLOW_FILE_MODS', false );
define( 'WPLAB_ID', '${WPLAB_ID}' );
// WP_ALLOW_MULTISITE and the other network constants are written by wp core multisite-install
// itself. Defining them here means a constant-redefinition warning on every single request.
// (No backticks in this heredoc: it is unquoted, so they would run as command substitution.)
PHP
)
	${WP} config create \
		--dbname="${WP_DB_NAME}" \
		--dbuser="${WP_DB_USER}" \
		--dbpass="${WP_DB_PASSWORD}" \
		--dbhost="${WP_DB_HOST}" \
		--locale="${WP_LOCALE}" \
		--skip-check \
		--extra-php <<< "${EXTRA_PHP}"
fi

# --- 4. installation -------------------------------------------------------
if ! ${WP} core is-installed --skip-plugins --skip-themes 2>/dev/null; then
	if [ "${WP_MULTISITE}" = "1" ]; then
		say "installing multisite (subdirectory)"
		${WP} core multisite-install \
			--url="${WP_SITE_URL}" \
			--title="WP Lab ${WPLAB_ID}" \
			--admin_user="${WP_ADMIN_USER}" \
			--admin_password="${WP_ADMIN_PASSWORD}" \
			--admin_email="${WP_ADMIN_EMAIL}" \
			--skip-email \
			--skip-plugins --skip-themes
	else
		say "installing WordPress"
		${WP} core install \
			--url="${WP_SITE_URL}" \
			--title="WP Lab ${WPLAB_ID}" \
			--admin_user="${WP_ADMIN_USER}" \
			--admin_password="${WP_ADMIN_PASSWORD}" \
			--admin_email="${WP_ADMIN_EMAIL}" \
			--skip-email \
			--skip-plugins --skip-themes
	fi
	${WP} rewrite structure '/%postname%/' --skip-plugins --skip-themes || true
fi

# WP-CLI does not write .htaccess because outside an HTTP request it cannot detect mod_rewrite.
# Without that file every pretty permalink (custom post type archives included) returns 404.
if [ ! -f /var/www/html/.htaccess ]; then
	say "writing .htaccess"
	if [ "${WP_MULTISITE}" = "1" ]; then
		cat > /var/www/html/.htaccess <<'HTACCESS'
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteRule ^([_0-9a-zA-Z-]+/)?wp-admin$ $1wp-admin/ [R=301,L]
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^([_0-9a-zA-Z-]+/)?(wp-(content|admin|includes).*) $2 [L]
RewriteRule ^([_0-9a-zA-Z-]+/)?(.*\.php)$ $2 [L]
RewriteRule . index.php [L]
</IfModule>
# END WordPress
HTACCESS
	else
		cat > /var/www/html/.htaccess <<'HTACCESS'
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
HTACCESS
	fi
	chown www-data:www-data /var/www/html/.htaccess
fi

if [ "${CORE_CHANGED}" = "1" ]; then
	${WP} core update-db --skip-plugins --skip-themes || true
	[ "${WP_MULTISITE}" = "1" ] && ${WP} core update-db --network --skip-plugins --skip-themes || true
fi

${WP} option update siteurl "${WP_SITE_URL}" --skip-plugins --skip-themes >/dev/null 2>&1 || true
${WP} option update home "${WP_SITE_URL}" --skip-plugins --skip-themes >/dev/null 2>&1 || true

# --- 5. plugin dependencies (vendor/) --------------------------------------
# The plugin directories are shared between containers, so composer runs behind a lock.
for plugin in ${WPLAB_PLUGINS}; do
	dir="/var/www/html/wp-content/plugins/${plugin}"
	[ -f "${dir}/composer.json" ] || continue
	[ -f "${dir}/vendor/autoload.php" ] && continue
	say "composer install: ${plugin}"
	flock "/wplab/cache/composer-${plugin}.lock" \
		composer install --working-dir="${dir}" --no-interaction --no-progress --ansi \
		|| warn "composer install for ${plugin} failed - the plugin may not start"
done

# --- 6. themes -------------------------------------------------------------
# A block behaves differently under a block theme than under a classic one, so the versions the
# tests sweep have to be present. Installing is idempotent and skipped when already there.
for theme in ${WPLAB_THEMES}; do
	if ! ${WP} theme is-installed "${theme}" --skip-plugins --skip-themes 2>/dev/null; then
		${WP} theme install "${theme}" --skip-plugins --skip-themes >/dev/null 2>&1 \
			|| warn "could not download theme ${theme} (no network?)"
	fi
done

if [ -n "${WPLAB_DEFAULT_THEME}" ]; then
	if ${WP} theme is-installed "${WPLAB_DEFAULT_THEME}" --skip-plugins --skip-themes 2>/dev/null; then
		CURRENT_THEME="$(${WP} theme list --status=active --field=name --skip-plugins --skip-themes 2>/dev/null || echo '')"

		# Only force the default on a fresh site: switching it on every restart would undo a theme
		# picked by hand with `wpx theme use`.
		if [ -z "${CURRENT_THEME}" ] || [ "${CORE_CHANGED}" = "1" ]; then
			${WP} theme activate "${WPLAB_DEFAULT_THEME}" --skip-plugins --skip-themes >/dev/null 2>&1 \
				|| warn "could not activate ${WPLAB_DEFAULT_THEME}"
		fi
	fi
fi

# --- 7. plugins ------------------------------------------------------------
NETWORK_FLAG=""
[ "${WP_MULTISITE}" = "1" ] && NETWORK_FLAG="--network"

for plugin in ${WPLAB_DEV_PLUGINS}; do
	if ! ${WP} plugin is-installed "${plugin}" --skip-plugins --skip-themes 2>/dev/null; then
		${WP} plugin install "${plugin}" --skip-plugins --skip-themes >/dev/null 2>&1 \
			|| warn "could not download ${plugin} (no network?)"
	fi
	${WP} plugin activate "${plugin}" ${NETWORK_FLAG} --skip-plugins --skip-themes >/dev/null 2>&1 || true
done

for plugin in ${WPLAB_PLUGINS}; do
	if [ -d "/var/www/html/wp-content/plugins/${plugin}" ]; then
		${WP} plugin activate "${plugin}" ${NETWORK_FLAG} >/dev/null 2>&1 \
			|| warn "could not activate ${plugin}"
	fi
done

chown -R www-data:www-data /var/www/html/wp-content/uploads 2>/dev/null || true

say "ready: ${WP_SITE_URL}  (WP $(${WP} core version --skip-plugins --skip-themes 2>/dev/null || echo '?'), PHP $(php -r 'echo PHP_VERSION;'))"
touch "${READY_FLAG}"

exec "$@"
