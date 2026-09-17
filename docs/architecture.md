# Architecture

Notes on why the environment is built the way it is. Most of these decisions were forced by
something that actually broke.

## One image per PHP version, WordPress downloaded at runtime

The obvious approach - the official `wordpress:<wp>-php<php>` images - cannot express an arbitrary
pair. Those tags only exist for combinations that were current on their release day, so WordPress
6.8 with PHP 8.4 simply has no tag, and `nightly` has none at all.

Instead each image is `php:<version>-apache` with WP-CLI, and the entrypoint runs
`wp core download --version=$WP_VERSION`. Any WordPress on any PHP, nightly included.

Images for older PHP sit on end-of-life Debian releases whose `debian-security` pool has been
removed while `apt-get update` still succeeds, so the Dockerfile decides on the release codename
rather than on an error, and points EOL releases at `archive.debian.org`.

## Generated compose file

`env/docker-compose.gen.yml` is rendered from `wp-matrix.json` on every `wpx` invocation. Editing
it by hand is pointless - it gets overwritten. One compose project holds a shared MariaDB, a shared
Mailpit and one WordPress service per target, each behind its own profile so you can start a
subset.

The environment scripts and PHP configuration are bind-mounted rather than only baked into the
image, so fixing the entrypoint takes a restart instead of rebuilding every PHP image.

## Errors go to the log, never to the response

`display_errors` is off. This is not tidiness: printing a single warning from `wp-config.php`
starts the HTTP response before the headers, WordPress then cannot send the `Link` header that
advertises the REST API, and REST discovery in the e2e tooling fails with an error that points
nowhere near the actual cause. Errors land in `.wplab/logs/wp-<target>.log` and in Query Monitor.

## Rewrite rules are flushed on `wp_loaded`

Activation cannot flush rewrite rules usefully, because modules have not registered their post
types yet. The activator leaves a flag and `Upgrader::maybe_flush_rewrite()` acts on it after the
whole `init` cycle. Flushing on `init` produces rules without the custom post types, and archives
404 until someone re-saves the permalink settings by hand.

Related: post types are registered with `with_front => false`. With the default, an install whose
permalink structure carries a prefix - a multisite main site gets `/blog/` - silently moves the
archive to `/blog/items/`.

## The free plugin boots on `plugins_loaded`

Booting at file load would fire `myplugin_register_modules` before the add-on file has even been
read, so the Pro edition could never register anything. Priority 5 for the free plugin, priority 1
for the add-on's compatibility check.

## E2E specs live at the repository root

Two reasons. They exercise a whole running site rather than a package, and `@wordpress/scripts`
installs a second copy of Playwright inside the plugin's `node_modules`; a spec resolving the test
utilities from there ends up with two Playwright instances, which fails with "no tests found".

Per-target artifact directories matter too. `@wordpress/e2e-test-utils-playwright` keeps the login
state for its `requestUtils` fixture under `STORAGE_STATE_PATH`, which defaults to a single shared
`./artifacts` directory - and WordPress cookies are bound to the host, not to the port. Without
pinning that path per target, state from one WordPress version silently works on the next and REST
calls land on the wrong site.

## The dashboard is dependency-free

`dashboard/server.mjs` is plain Node: `http` plus Server-Sent Events. A tool that exists to make
the environment easy should not itself need a build step, a framework or a dependency upgrade
treadmill. It binds to `127.0.0.1` only, because it drives Docker.

Jobs are queued and run one at a time. Concurrent Docker operations on the same project race.

## Vite for the blocks, not @wordpress/scripts and not @wordpress/build

WordPress announced `@wordpress/build` (esbuild-based) in April 2026 and it will eventually become
the engine inside `@wordpress/scripts`. It is not the default here yet for the reason its own
announcement gives: a plugin registering blocks "still has gaps that require manual workarounds".
Worth revisiting once that stops being true.

Vite gives faster builds and native TypeScript, at the cost of the WordPress-specific behaviour
webpack had a plugin for. `cli/vite/wordpress-blocks.mjs` supplies exactly that behaviour, and the
important decision inside it is what it does *not* do: it never reimplements the mapping from
`@wordpress/*` imports to `wp.*` globals. It imports the official one from
`@wordpress/dependency-extraction-webpack-plugin`. That mapping carries knowledge that is easy to
get wrong - `@wordpress/icons` has no global and must be bundled, plain `react` is externalized but
has no script handle of its own - and it keeps working when WordPress changes it.

Each block is built as an IIFE, one Rollup build per block, because WordPress loads editor scripts
as classic scripts and an ES module would fail on its bare imports. Editor and front-end styles are
built separately so a front-end page never pulls in editor CSS.

Watch mode is `vite build --watch` rather than a dev server. A dev server would mean injecting
modules into wp-admin across origins and running Fast Refresh against a React that has been
externalized to a global - fragile inside the iframed block editor, and not something
`@wordpress/scripts` offers either. Watch rebuilds in a few hundred milliseconds and the artifact
on disk is always the real one.

## One vendor directory for every PHP version

`composer.json` pins `config.platform.php` to the plugin's minimum supported PHP, so the resolved
dependencies work in every container, from the oldest to the newest. PHPUnit 9.6 is a deliberate
choice for the same reason: it is the version that spans PHP 7.4 to 8.5 and that the WordPress core
test suite supports.

The paid add-on has no `vendor/` of its own and borrows the free plugin's toolchain - it cannot run
without it anyway.
