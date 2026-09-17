#!/usr/bin/env bash
# Installs the WordPress core test package (tests/phpunit) matching the core in this container.
# The source is a wordpress-develop tarball - unlike svn it needs no extra tooling. Tags there
# always have three parts (6.8 -> 6.8.0), hence the normalization below.
set -euo pipefail

WP_VERSION="${WP_VERSION:-latest}"
TESTS_DIR="${WP_TESTS_DIR:-/tmp/wordpress-tests-lib}"
WP_DB_HOST="${WP_DB_HOST:-db}"
WP_DB_USER="${WP_DB_USER:-root}"
WP_DB_PASSWORD="${WP_DB_PASSWORD:-wordpress}"
WP_TEST_DB_NAME="${WP_TEST_DB_NAME:-wordpress_test}"
FORCE="${1:-}"

say() { printf '\033[36m[tests]\033[0m %s\n' "$*"; }

if [ -n "${FORCE}" ] && [ "${FORCE}" = "--force" ]; then
	rm -rf "${TESTS_DIR}"
fi

INSTALLED_MARKER="${TESTS_DIR}/.wplab-version"
if [ -f "${INSTALLED_MARKER}" ] && [ "$(cat "${INSTALLED_MARKER}")" = "${WP_VERSION}" ]; then
	say "test package for ${WP_VERSION} already installed"
else
	if [ "${WP_VERSION}" = "nightly" ] || [ "${WP_VERSION}" = "trunk" ]; then
		REF="heads/trunk"
	else
		# 6.8 -> 6.8.0; 6.8.1 is left alone.
		TAG="${WP_VERSION}"
		if [ "$(echo "${TAG}" | tr -cd '.' | wc -c)" -lt 2 ]; then
			TAG="${TAG}.0"
		fi
		REF="tags/${TAG}"
	fi

	URL="https://github.com/WordPress/wordpress-develop/archive/refs/${REF}.tar.gz"
	say "downloading test package: ${REF}"

	TMP="$(mktemp -d)"
	trap 'rm -rf "${TMP}"' EXIT

	if ! curl -fsSL "${URL}" -o "${TMP}/develop.tar.gz"; then
		echo "Could not download ${URL}" >&2
		exit 1
	fi

	tar -xzf "${TMP}/develop.tar.gz" -C "${TMP}"
	SRC="$(find "${TMP}" -maxdepth 1 -type d -name 'wordpress-develop-*' | head -1)"

	rm -rf "${TESTS_DIR}"
	mkdir -p "${TESTS_DIR}"
	cp -r "${SRC}/tests/phpunit/includes" "${TESTS_DIR}/includes"
	cp -r "${SRC}/tests/phpunit/data" "${TESTS_DIR}/data"
	cp "${SRC}/wp-tests-config-sample.php" "${TESTS_DIR}/wp-tests-config-sample.php"
	echo "${WP_VERSION}" > "${INSTALLED_MARKER}"
fi

# The config points at the core installed in this container, so the core version and the test
# package version match by construction.
CONFIG="${TESTS_DIR}/wp-tests-config.php"
say "writing wp-tests-config.php (database ${WP_TEST_DB_NAME})"
sed \
	-e "s|dirname( __FILE__ ) . '/src/'|'/var/www/html/'|" \
	-e "s|youremptytestdbnamehere|${WP_TEST_DB_NAME}|" \
	-e "s|yourusernamehere|${WP_DB_USER}|" \
	-e "s|yourpasswordhere|${WP_DB_PASSWORD}|" \
	-e "s|localhost|${WP_DB_HOST}|" \
	"${TESTS_DIR}/wp-tests-config-sample.php" > "${CONFIG}"

mysql -h"${WP_DB_HOST}" -u"${WP_DB_USER}" -p"${WP_DB_PASSWORD}" -e \
	"CREATE DATABASE IF NOT EXISTS \`${WP_TEST_DB_NAME}\` DEFAULT CHARACTER SET utf8mb4;"

say "done: ${TESTS_DIR}"
