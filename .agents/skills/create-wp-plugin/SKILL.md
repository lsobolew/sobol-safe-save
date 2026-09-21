---
name: create-wp-plugin
description: "Use when asked to start a new WordPress plugin from the WP Plugin Lab starter - phrasings like 'fork wp-plugin-lab and build me a plugin that ...', 'create a new WordPress plugin from this starter/template', or 'set up a plugin project based on lsobolew/wp-plugin-lab'. Covers cloning or templating the repository, renaming it into the new plugin, installing the WordPress agent skills, bringing the environment up and verifying it before any feature work begins."
compatibility: "Requires Docker and Node 20+ on the host. All PHP tooling runs inside containers."
---

# Creating a new plugin from WP Plugin Lab

The starter lives at **https://github.com/lsobolew/wp-plugin-lab**. Clone it, rename it into the
plugin being asked for, and the environment, tests, CI and block tooling come with it.

Work through the phases below in order. Do not start writing the requested feature until phase 5
reports green - a broken environment makes every later error ambiguous.

## Phase 1 - Get the repository

If the `gh` CLI is available and the starter has GitHub's template flag enabled, that is the
cleanest route:

```bash
gh repo create <new-repo-name> --template lsobolew/wp-plugin-lab --private --clone
```

If `gh` is missing or the command fails because the repository is not marked as a template, clone
instead and start a fresh history. **Check with the user before pushing anywhere** - creating
a repository under their account is theirs to authorise:

```bash
git clone https://github.com/lsobolew/wp-plugin-lab.git <new-dir>
cd <new-dir>
rm -rf .git && git init && git add -A && git commit -m "Initial commit from wp-plugin-lab"
# then ask the user for the new repository URL before adding a remote
```

Either way, leave `starter.json` → `lab.repo` pointing at the starter. That is not a git remote -
it is where `./bin/wpx upgrade` later pulls tooling improvements from, and it must keep pointing at
the lab, not at the new repository.

## Phase 2 - Decide the plugin identity

Derive these from what the user asked for, and state your choices rather than asking a list of
questions:

| Value | Rule |
|---|---|
| slug | lowercase with dashes, no `-pro` suffix (reserved for the paid edition) |
| name | human readable, title case |
| namespace | `Vendor\PluginName` - ask for the vendor if there is no obvious one |
| Pro edition | keep it only if the user mentioned a paid or premium tier |

Then run the rename. It rewrites headers, namespaces, constants, hook prefixes, text domain, option
names, block names, directory and file names, in both editions and in the CI files:

```bash
./bin/wpx init --yes --slug=<slug> --name="<Name>" --namespace='Vendor\PluginName'
./bin/wpx init --yes --slug=<slug> ... --no-pro    # single-edition plugin
```

Use `--dry-run` first if the scope is unclear.

## Phase 3 - Install the skills and dependencies

```bash
npm install                              # Playwright and the dashboard
npm --prefix plugins/<slug> install      # Vite, TypeScript, block dependencies
./bin/wpx skills install                 # official WordPress agent skills
./bin/wpx hooks install                  # pre-commit PHPCS
```

`wpx skills install` puts the WordPress project's own guidance for blocks, REST, WP-CLI,
performance and the plugin directory rules into `.claude/skills/`.

**Then offer, and do not assume:** ask the user whether to also run `./bin/wpx skills global`. That
copies this starter's own two skills into `~/.claude/skills/`, which is what makes "clone the
starter and build me a plugin" work from an empty directory next time. It writes outside the
repository, into their home directory, so it needs their word first. **Read the relevant one before
writing WordPress code** - they are more current than anything you remember. Which ones get
installed is configured in `starter.json` → `skills.install`; add more with
`./bin/wpx skills list` to see what exists.

## Phase 4 - Choose the shape of the plugin

The starter ships more than most plugins need. Remove what does not apply, rather than leaving
dead examples behind:

```bash
./bin/wpx feature list
./bin/wpx feature remove blocks         # not a block plugin
./bin/wpx feature remove content-type   # no custom post type
./bin/wpx feature remove rest cli settings
```

Rules of thumb:

- **A block plugin** keeps `blocks`; the three example blocks (dynamic, static with a deprecation,
  InnerBlocks container) are the starting points - adapt one and delete the others.
- **A settings-only plugin** keeps `settings` and drops the rest.
- `content-type` is a demo custom post type. Delete it unless the plugin really needs one.

Also set the WordPress versions worth supporting in `wp-matrix.json`, and the themes to test
against under `themes` if this is a block plugin.

## Phase 5 - Bring it up and prove it works

```bash
./bin/wpx doctor
./bin/wpx up latest
./bin/wpx test lint analyse types --targets=latest
./bin/wpx test unit integration --targets=latest --edition=both
```

Everything must be green before feature work starts. If something fails here it is the environment,
not the user's plugin, and fixing it first saves hours.

## Phase 6 - Build what was actually asked for

Now write the plugin. Follow `.claude/skills/wp-plugin-lab/SKILL.md` for the CLI, and the installed
WordPress skills for WordPress itself. Keep these in mind:

- PHP runs only in containers.
- Blocks are TypeScript built with Vite; `./bin/wpx dev` watches.
- Changing a static block's `save()` requires a `deprecated` entry, or existing posts break.
- Test on the oldest supported WordPress too: `--targets=latest,min`.

## Phase 7 - Report

Tell the user what was created, what was removed, what is running and on which ports, and what you
verified with which command. Point them at `./bin/wpx panel` for the dashboard and at `docs/` for
the rest.

## What not to do

- Do not run `wp plugin install` against a plugin directory in `plugins/` - it is bind-mounted, and
  WordPress deletes the target directory before unpacking, destroying the working copy on the host.
  Use `./bin/wpx build --verify` to test a package.
- Do not reintroduce `@wordpress/scripts`; the block build is Vite.
- Do not edit generated files: `env/docker-compose.gen.yml`, `plugins/*/build/`, `*.asset.php`.
- Do not push to a remote the user has not asked for.
