# The version matrix

`wp-matrix.json` is the single place that decides which WordPress versions you support. Everything
downstream follows it: the containers, the test runs, the dashboard cards and the CI job list.

```jsonc
{
  "targets": [
    { "id": "latest",  "wp": "latest",   "php": "8.4", "port": 8091 },
    { "id": "prev",    "wp": "latest-1", "php": "8.3", "port": 8092 },
    { "id": "lts",     "wp": "6.9",      "php": "8.2", "port": 8093 },
    { "id": "min",     "wp": "6.8",      "php": "7.4", "port": 8094 },
    { "id": "nightly", "wp": "nightly",  "php": "8.4", "port": 8095, "multisite": true }
  ],
  "editions": [ "free", "pro" ],
  "defaults": { "db": "mariadb:11", "xdebug": "off", "locale": "en_US" }
}
```

## Version specifiers

| Value | Meaning |
|---|---|
| `latest` | The newest release, resolved live from `api.wordpress.org` |
| `latest-1`, `latest-2` | One or two branches behind the newest |
| `6.8` | That exact branch |
| `nightly` | The current development build |

The `latest*` forms are resolved at runtime and cached for 24 hours, so the matrix never goes stale
just because a release happened. Run `./bin/wpx matrix` to see what the specifiers currently mean.

Offline, the cache is used with a warning. If there is no cache and no network, pin explicit
numbers instead.

## Picking versions

A useful default is four entries: the newest release, the one before it, your declared minimum
(`Requires at least` in the plugin header), and `nightly` as an early warning for the next release.
The PHP column is where you decide what to prove: pairing your oldest WordPress with your oldest
PHP is what catches syntax and API problems that never show up on a modern stack.

`./bin/wpx version --sync-headers` writes the lowest and highest numeric versions from the matrix
into `Requires at least` and `Tested up to`, so the plugin headers cannot drift away from what is
actually tested.

## What each target gets

- Its own WordPress core in a named volume, and its own databases (`wp_<id>`, `wptest_<id>`)
- Its own port on localhost
- A shared MariaDB and a shared Mailpit - one database server for the whole matrix is much lighter
  on a laptop than one per version
- Query Monitor and WP Crontrol preinstalled
- Your plugins bind-mounted, so an edit on the host is live everywhere at once

Add `"multisite": true` to install a subdirectory network instead of a single site. It is worth
having at least one, because multisite breaks assumptions that single-site testing never touches.

## Costs

Each running version is an Apache container plus a WordPress core on disk. Use profiles to start
only what you need:

```bash
./bin/wpx up latest min     # two versions
./bin/wpx down lts nightly  # stop the rest
./bin/wpx down              # everything, including the database
```
