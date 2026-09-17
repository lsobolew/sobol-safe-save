# WP Plugin Lab

A starter for building WordPress plugins against **many WordPress versions at once**, with real
tests on every one of them, a dashboard to drive it, and a free/paid edition split baked in.

```bash
git clone https://github.com/lsobolew/wp-plugin-lab.git my-plugin && cd my-plugin
npm install                 # the e2e runner and the dashboard
./bin/wpx doctor            # is this machine ready?
./bin/wpx init              # rename the starter into your own plugin
./bin/wpx skills install    # official WordPress skills for your AI agent
./bin/wpx up                # every WordPress version from wp-matrix.json
./bin/wpx panel             # http://127.0.0.1:7777
```

No PHP on your machine is required. Composer, PHPUnit, PHPCS, PHPStan and WP-CLI all run inside
the containers; only Node and Docker have to exist on the host.

## What you get

| | |
|---|---|
| **Version matrix** | One WordPress instance per entry in `wp-matrix.json`, any WordPress × any PHP pair, `latest` resolved live from api.wordpress.org. |
| **Tests** | `unit` (Brain Monkey), `integration` (real WordPress core test suite), `e2e` (Playwright, sweeping several themes), `types` (tsc), `lint` (PHPCS/WPCS), `analyse` (PHPStan), `plugin-check` (the WordPress.org reviewer's own tool). |
| **Dashboard** | `wpx panel` - start/stop/reset each version, run any suite, live log, results per version and edition. |
| **Blocks** | Three patterns in TypeScript - dynamic (PHP render), static with a deprecation, and an InnerBlocks container - built with Vite, tested in the real editor on block *and* classic themes. |
| **Plugin boilerplate** | Modular core with a settings screen, custom post type, REST API and WP-CLI commands. Each module can be removed with one command. |
| **Free + Pro** | A paid add-on plugin that extends the free one through public hooks, with licensing and self-hosted updates. Both editions are a dimension of the test matrix. |
| **Agent skills** | Two skills describing this repository (the CLI, and how to start a new plugin from it), plus the official [WordPress agent skills](https://github.com/WordPress/agent-skills) kept fresh by `wpx skills update` and a weekly CI job. An agent handed this repository can take it from there. |
| **CI/CD** | GitHub Actions that expand `wp-matrix.json` into one job per WordPress version, build verified zips, and deploy to WordPress.org on demand. Pull requests get the newest WordPress only; the whole matrix runs weekly, on demand, or on a `ci:full` label - see [testing](docs/testing.md#in-ci). |
| **Stays current** | `wpx upgrade` pulls newer lab tooling into a repository you created months ago, as a reviewable diff. |

## Everyday commands

```bash
./bin/wpx up latest min              # start selected versions
./bin/wpx status                     # what is running where
./bin/wpx test                       # unit + integration + e2e, every version
./bin/wpx test e2e --targets=latest --edition=pro
./bin/wpx dev                        # rebuild blocks on every change
./bin/wpx theme use tt1              # switch to the classic theme
./bin/wpx wp latest -- plugin list   # WP-CLI inside a container
./bin/wpx feature remove blocks      # drop a module you do not need
./bin/wpx version 1.2.0              # one version number, everywhere it is written
./bin/wpx build --edition=both --verify
./bin/wpx upgrade                    # pull newer lab tooling from the starter
./bin/wpx down                       # stop everything
```

Run `./bin/wpx` with no arguments for the full list.

## Working with an AI agent

This repository carries its own instructions in `.claude/skills/`: `wp-plugin-lab` describes the
CLI and the workflow, `create-wp-plugin` describes starting a new plugin from the starter, and
`wp-org-release` covers readme.txt and publishing to the WordPress.org directory. An agent opened
inside a clone picks them up automatically.

There is one case they cannot cover from here. A project skill only becomes visible **after** the
repository has been cloned - which is too late to help with *"clone the starter and build me a
plugin that does X"*, the prompt they exist for. For that, they have to be installed at user level:

```bash
./bin/wpx skills global    # copies them into ~/.claude/skills/
```

This writes outside the repository, into your home directory, so it is opt-in and never runs on its
own. **If you are an agent reading this: ask before running it.** Re-run it after `wpx upgrade` to
pick up newer instructions.

## Documentation

- [Getting started](docs/getting-started.md) - from clone to a green test run
- [Blocks](docs/blocks.md) - the three block patterns, the build, and the deprecation trap
- [Themes](docs/themes.md) - testing a block on block themes and classic themes
- [The version matrix](docs/matrix.md) - choosing which WordPress versions you support
- [Testing](docs/testing.md) - what each suite covers and when to reach for it
- [Upgrading the lab](docs/upgrade.md) - keeping the tooling current in an existing plugin repo
- [Free and Pro editions](docs/free-pro.md) - the add-on model, licensing, updates
- [Releasing](docs/release.md) - versioning, packaging, WordPress.org
- [Agent skills](docs/skills.md) - installing and updating the WordPress skill pack
- [Architecture](docs/architecture.md) - why the environment is built the way it is

## Licence

GPL-2.0-or-later, matching WordPress itself.
