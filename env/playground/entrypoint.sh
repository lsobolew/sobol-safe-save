#!/usr/bin/env bash
set -euo pipefail
cd /var/www/html
rm -f .playground-ready
if [ ! -f wp-settings.php ]; then
	wp --allow-root core download --version="$PG_WP_VERSION" --locale=en_US
fi
if [ ! -f wp-config.php ]; then
	wp --allow-root config create --dbname=wordpress --dbuser=root --dbpass=wordpress --dbhost=db --skip-check
	wp --allow-root config set WP_ENVIRONMENT_TYPE local
	wp --allow-root config set WP_DEBUG true --raw
	wp --allow-root config set WP_DEBUG_LOG true --raw
	wp --allow-root config set WP_DEBUG_DISPLAY false --raw
	wp --allow-root config set AUTOMATIC_UPDATER_DISABLED true --raw
	wp --allow-root config set FS_METHOD direct
fi
if ! wp --allow-root core is-installed >/dev/null 2>&1; then
	if [ "$PG_MULTISITE" = 1 ]; then
		wp --allow-root core multisite-install --url="$PG_URL" --title='Plugin Lab Playground' --admin_user=admin --admin_password=password --admin_email=admin@playground.test --skip-email
	else
		wp --allow-root core install --url="$PG_URL" --title='Plugin Lab Playground' --admin_user=admin --admin_password=password --admin_email=admin@playground.test --skip-email
	fi
	wp --allow-root --url="$PG_URL" rewrite structure '/%postname%/'
fi
if [ ! -f .htaccess ]; then
	if [ "$PG_MULTISITE" = 1 ]; then
		cp /playground/multisite.htaccess .htaccess
	else
		cp /playground/single.htaccess .htaccess
	fi
fi
mkdir -p wp-content/mu-plugins wp-content/uploads
cp /playground/mail.php wp-content/mu-plugins/wplab-playground-mail.php
chown -R www-data:www-data wp-content .htaccess
touch .playground-ready
exec "$@"
