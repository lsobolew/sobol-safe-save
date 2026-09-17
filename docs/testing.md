# Testing

```bash
./bin/wpx test                                    # unit + integration + e2e, everywhere
./bin/wpx test unit --targets=latest              # one suite, one version
./bin/wpx test integration --edition=pro          # with the paid add-on active
./bin/wpx test all --targets=latest               # plus linters and Plugin Check
```

Every run writes a JUnit XML file to `.wplab/results/<target>-<edition>-<suite>.xml`, which is what
the dashboard reads and what CI uploads as an artifact.

## The suites

| Suite | Where it runs | What it proves |
|---|---|---|
| `unit` | Container, no database | Pure logic. WordPress functions are stubbed by Brain Monkey, so the suite finishes in well under a second. |
| `integration` | Container, real database | Behaviour against an actual WordPress: post types, meta, REST, options, capabilities. Uses the WordPress core test suite (`WP_UnitTestCase`). |
| `e2e` | Host Node, real browser | The product as a user meets it: admin screens, blocks in the real editor, front-end rendering. Runs once per theme in the sweep. Playwright plus `@wordpress/e2e-test-utils-playwright`. |
| `types` | Host Node | `tsc --noEmit`. Vite only transpiles, so nothing would check the block types without this step. |
| `lint` | Container | PHPCS with WordPress Coding Standards and PHPCompatibility, pinned to the versions in the plugin header. |
| `analyse` | Container | PHPStan level 6 with WordPress stubs. |
| `plugin-check` | Container | The official Plugin Check plugin - the same tool the WordPress.org review team runs. |

## Capabilities are worth testing too

`KsesCompatibilityTest` covers what happens when a user without `unfiltered_html` saves a post -
authors and contributors on a single site, and everyone but the super admin on multisite. It is a
cheap integration test and it catches a class of bug that is invisible while you develop as an
administrator. See [blocks](blocks.md) for what survives and what does not.

## Themes are a test dimension too

For end-to-end runs the theme is part of the combination, because a block meets a very different
environment under a block theme than under a classic one. Result names carry the theme alias
(`latest-free-tt1-e2e`), and `docs/themes.md` explains the configuration.

## Editions are a test dimension

With a paid add-on present, `--edition` decides which plugins are active before the suite runs:

- `--edition=free` activates only the free plugin
- `--edition=pro` activates both
- `--edition=both` (the default) runs each in turn

In the `pro` edition the *free* suite runs again with the add-on active. That is deliberate: it is
how you find out that the add-on broke something in the plugin everybody else is running.

Result names carry the package, so a failure points at the right code:

- `latest-free-integration` - the free plugin, on its own
- `latest-pro-integration` - the free plugin, with the add-on active
- `latest-proaddon-integration` - the add-on's own tests

## Writing tests

**Unit** (`plugins/<slug>/tests/Unit/`): stub what you need with `Brain\Monkey\Functions\when()`.
The bootstrap defines `ABSPATH`, the plugin constants and the WordPress time constants - the last
ones matter because PHP evaluates class constant expressions when the class loads, before any mock
could intervene.

**Integration** (`plugins/<slug>/tests/Integration/`): standard `WP_UnitTestCase` with factories.
One trap worth knowing: the core test suite calls `unregister_all_meta_keys()` before every single
test, so meta registered on `init` is gone by the time your test body runs. Re-register it in
`set_up()` - `ContentTypeTest` shows the pattern.

**E2E** (`tests/e2e/free/` and `tests/e2e/pro/`): specs live at the repository root rather than in
the plugin directory, for two reasons. They exercise a whole running site rather than a package,
and `@wordpress/scripts` installs a second copy of Playwright inside the plugin's `node_modules`
which the two instances cannot reconcile.

## In CI

GitHub Actions runs two lanes, because the full matrix is roughly four times the cost of the one
configuration that catches almost everything.

| Lane | When | What runs |
|---|---|---|
| Quick | Every push and pull request | Linters, PHPStan, Plugin Check, the packaged zip, and unit + integration + e2e on the newest WordPress, default theme only |
| Full | Monday mornings, `workflow_dispatch`, or a pull request labelled `ci:full` | The same, but every target in `wp-matrix.json` and every theme in the sweep |

The quick lane is `./bin/wpx matrix --json --targets=latest` for the job list and `--no-sweep` for
the end-to-end step, which pins every target to the default theme. Both flags work locally too:

```bash
./bin/wpx test e2e --targets=latest --no-sweep   # one theme instead of the sweep
```

Label a pull request `ci:full` when it touches the things the matrix exists for - rewrite rules,
the block editor, REST, multisite, or anything version-dependent in PHP. That is the same rule as
the local one in `CLAUDE.md`, moved to where it costs money.

Widen the quick lane by editing `QUICK_TARGETS` in `.github/workflows/ci.yml`; the ids come from
`wp-matrix.json`, so `latest,min` is a one-line change if a project wants the oldest supported
WordPress on every pull request.

Every job carries a `timeout-minutes`. A hung container left to the six-hour default costs more
billed minutes than a month of ordinary runs, and a hang is never a slow run worth waiting for.

## Debugging

```bash
./bin/wpx logs latest                 # container output
tail -f .wplab/logs/wp-latest.log     # WP_DEBUG_LOG
./bin/wpx wp latest -- eval '...'     # poke at a live site
```

PHP errors go to the log, never to the HTTP response. That is not only tidiness: a single warning
printed from `wp-config.php` starts the response before the headers, which stops WordPress from
sending the `Link` header that points at the REST API - and e2e tooling uses that header to find
the API at all.

For step debugging, set `XDEBUG_MODE=debug` and restart the target; Xdebug is already installed in
every image and configured to reach the host on port 9003.
