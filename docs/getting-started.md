# Getting started

## Requirements

- Docker Desktop (or any Docker with Compose v2)
- Node 20+

That is the whole list. PHP, Composer, WP-CLI, PHPUnit, PHPCS and PHPStan all live inside the
containers, so a broken or missing PHP on your machine changes nothing. `./bin/wpx doctor` says so
explicitly when it finds one.

## First run

```bash
npm install          # Playwright and the e2e helpers
./bin/wpx doctor     # Docker, ports, plugins, skills
./bin/wpx up latest  # build the image, download WordPress, install it
```

The first start takes a few minutes: it builds a PHP image and downloads a WordPress core. Later
starts take seconds. When it finishes you get a URL and credentials:

```
OK latest: WP 7.1 / PHP 8.4 -> http://localhost:8091
   Login: admin / password   Mailpit: http://localhost:8025
```

## Make it your plugin

```bash
./bin/wpx init
```

It asks for a slug, a display name, a PHP namespace and an author, then rewrites every file:
plugin headers, namespaces, constants, hook prefixes, text domain, option names, directory and file
names, for both the free and the paid edition. Use `--dry-run` first if you want to see the scope.

After renaming, rebuild the sites so they mount the new directories:

```bash
./bin/wpx reset --all
./bin/wpx test
```

## Install the agent skills

```bash
./bin/wpx skills install   # the official WordPress skill pack
./bin/wpx skills global    # this repository's own skills, at user level
```

The first pulls the WordPress skill pack into canonical `.agents/skills/`, generates the
`.claude/skills/` compatibility copy, and records the upstream commit in
`.agents/wplab-skills.lock.json`; commit all three.

The second copies the repository-owned skills into `~/.agents/skills/` and `~/.claude/skills/`,
which is what
lets an agent act on "clone the starter and build me a plugin X" from an empty directory - a
project skill would only become visible after the clone already happened. See [skills](skills.md).

## Run the dashboard

```bash
./bin/wpx panel
```

It listens on `127.0.0.1:7777` only. From there you can start, stop and reset each WordPress
version, run any test suite against any selection of versions and editions, and watch the output
live.

## Where things are

| Path | What it is |
|---|---|
| `wp-matrix.json` | Which WordPress versions you support |
| `starter.json` | Plugin identity, editions, features, skills |
| `plugins/<slug>/` | Your free plugin |
| `plugins/<slug>-pro/` | Your paid add-on |
| `tests/e2e/` | Playwright specs, split into `free/` and `pro/` |
| `plugins/<slug>/blocks/` | Block sources in TypeScript |
| `themes/` | Local themes, mounted into every container |
| `.agents/skills/` | Canonical instructions for AI agents working here |
| `.claude/skills/` | Generated Claude Code compatibility copy |
| `.wplab/` | Logs, test results, caches (never committed) |
