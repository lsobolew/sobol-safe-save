/**
 * Which parts of the repository belong to the lab, and which belong to you.
 *
 * `wpx upgrade` replaces everything on this list from the starter repository, so a path may only
 * appear here when it is genuinely generic - the moment something needs a per-plugin value, it
 * belongs on the other side of the line.
 */

/** Paths the lab owns and keeps up to date. */
export const LAB_PATHS = [
	'bin',
	'cli',
	'env',
	'dashboard',
	'.githooks',
	'docs',
	'.github/workflows/ci.yml',
	'.github/workflows/release.yml',
	'.github/workflows/update-skills.yml',
];

/**
 * Files inside a lab path that are still yours.
 *
 * The rendered compose file is regenerated from wp-matrix.json on every command, and the override
 * file exists precisely so you can bend the environment without forking it.
 */
export const LAB_EXCLUDES = [
	'env/docker-compose.gen.yml',
	'env/docker-compose.override.yml',
];

/**
 * Paths deliberately left out, documented here so the reasoning survives.
 *
 * plugins/, themes/, tests/   your product and your tests
 * starter.json, wp-matrix.json  your configuration
 * .github/dependabot.yml        carries the plugin directory, rewritten by `wpx init`
 * .github/workflows/deploy-wporg.yml  carries the plugin slug, rewritten by `wpx init`
 * CLAUDE.md, README.md          yours to adapt once the starter becomes your plugin
 */
export const NOT_LAB_PATHS = [
	'plugins',
	'themes',
	'tests',
	'starter.json',
	'wp-matrix.json',
	'.github/dependabot.yml',
	'.github/workflows/deploy-wporg.yml',
	'CLAUDE.md',
	'README.md',
];
