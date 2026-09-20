# Manual playground

`wpx playground` gives each project a persistent local WordPress for trying the **packaged**
plugin as a user would. It is separate from the test matrix. It is Docker-based, not the
browser/WASM WordPress Playground, and does not use or migrate a separate `wordpress-playground` repo.

```bash
./bin/wpx playground                       # start, build ZIPs, install, seed
./bin/wpx playground up --edition=free     # deactivate the Pro add-on, retain its data
./bin/wpx playground install classic-editor
./bin/wpx playground install ./dist/other-plugin.zip
./bin/wpx playground open
./bin/wpx playground users
```

The first start resolves the latest **stable release including its patch version**, creates a
site and installs User Switching. Later starts rebuild the current plugin, install that exact ZIP
(even if its version number has not changed), and preserve the database and uploads. Enabled
Free and Pro editions are installed in dependency order by default. Disabled Pro is skipped;
explicitly requesting a disabled Pro edition is an error.

Build failures stop before plugin installation. Installation/activation errors are reported;
there is no automatic rollback or reset. Snapshot before testing a plugin's database migration.
Other plugins and WordPress core are not automatically updated on subsequent starts.

## Configuration (optional)

Old projects need no configuration or new npm scripts after `wpx upgrade`. Defaults live in the
lab. Override them in the project-owned `starter.json`:

```json
"playground": {
  "wp": "latest",
  "php": "8.4",
  "edition": "both",
  "multisite": false,
  "plugins": ["classic-editor", "./local-zips/another-plugin.zip"],
  "ports": {"wordpress": 8180, "mailpit": 8181, "database": 13318}
}
```

Omit `php` to use the matrix's `latest` target PHP (or its first target). Omit ports to select free
ones, checking both Docker's published ports and local listeners. Ports are then retained in local
state: an existing site never silently changes URL. All ports bind to **127.0.0.1**, not the LAN.
Two copies of a project use distinct Docker project names derived from slug and repository path.

`wp` accepts `latest` or a numeric version; nightly builds are intentionally excluded. Changes
to WP/PHP, multisite or configured ports require an explicit reset. A reset resolves `latest`
again. The first start requires network access for core, images and plugins. An existing site
can restart offline when its dependencies are already available; failures are not reported as
successful starts.

Configured additional plugins are installed if missing and activated on startup, not upgraded.
Remove an entry to stop managing it; this does not uninstall it. Local ZIP paths in configuration
are relative to the project; CLI paths are relative to your working directory. A nonexistent ZIP
is an error, not a WordPress.org slug. URLs are not accepted. Use `install` explicitly to replace
a plugin from a new ZIP. ZIPs must contain one top-level plugin directory.

## Users, content and mail

Initial accounts: `admin`, `admin2`, `editor`, `author`, `contributor`, `subscriber`, all with the
initial password `password`. Existing credentials and roles are never overwritten. The user list
prints live accounts but not guessed current passwords. In multisite, only `admin` is superadmin;
plugin activation targets the main site, while User Switching is network-active.

Log in as `admin`, open **Users**, and choose **Switch To**. User Switching supplies switching
and returning to the originating account. This is not an unrestricted custom impersonation API.

Seeding creates posts for several authors (contributors have pending posts), pages, terms and
comments. Markers prevent duplicates on subsequent starts or `seed`; edited, trashed or removed
fixtures are not silently recreated. Reset creates a genuinely fresh dataset.

The mail MU-plugin routes WordPress PHPMailer mail to the playground's own Mailpit; URLs are
printed by `info`. This does not intercept arbitrary HTTP email services used by third-party plugins.

## Lifecycle and troubleshooting

```bash
./bin/wpx playground info                  # addresses and initial credentials
./bin/wpx playground status                # containers and active/inactive plugins
./bin/wpx playground seed                  # add missing fixtures without overwriting edits
./bin/wpx playground snapshot before-upgrade
./bin/wpx playground restore before-upgrade
./bin/wpx playground down                  # stop, preserve volumes
./bin/wpx playground reset                 # confirm, delete only this sandbox's volumes, rebuild
./bin/wpx playground logs
./bin/wpx playground sh
./bin/wpx playground wp -- plugin list
./bin/wpx playground fix-perms
```

Snapshots contain **only the database**, not plugins or uploads. Restore validates the checksum,
project identity, URL, WordPress version and single/multisite mode, and writes a backup before
importing. Duplicate snapshot names are rejected. Restore and reset require confirmation;
automation must explicitly pass `--yes`. Reset retains snapshots.

Runtime state, generated Compose, ZIP staging and snapshots live under `.wplab/playground/`.
Do not edit generated files. A repository moved to another path must not reuse old state without
review: the identity check intentionally refuses to control the old project's volumes.

The site lives in named volumes: source directories are **never** mounted into its plugin tree.
ZIP packaging uses a separate disposable container with read-only sources. Before installing,
the CLI checks mounts and rejects symlinked plugin directories. Test commands and their databases
are not involved. WP-CLI writes are followed by a permissions repair for web uploads.

Mutating commands have an operation lock. If a process is killed, inspect the PID recorded in
`.wplab/playground/operation.lock`; remove only that lock after confirming the process is gone.
`wp -- ...` is a raw, intentionally powerful escape hatch scoped to this sandbox.

## Verification

```bash
node --test cli/tests/*.test.mjs
node cli/tests/playground-smoke.mjs
```

The second command needs Docker, the root npm dependencies and Playwright Chromium. It creates
temporary fixture projects, verifies fresh/repeated starts, role switching, mail, ZIP/slug installs,
snapshot/restore, multisite and cross-project isolation, then removes its own Docker volumes.
It runs in the full CI lane. It never resets existing lab or standalone playground environments.
