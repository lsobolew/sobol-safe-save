# Upgrading the lab

A repository created from this starter owns a copy of the tooling. That is what makes it work
offline, hackable and reproducible - and it is also why improvements do not arrive on their own.
`wpx upgrade` is how they do.

```bash
./bin/wpx upgrade status   # what you have, and whether the starter moved
./bin/wpx upgrade --dry-run
./bin/wpx upgrade
```

Point it at your starter first, in `starter.json`:

```jsonc
"lab": { "repo": "https://github.com/you/wp-plugin-lab.git", "ref": "" }
```

An empty `ref` means "whatever the default branch is".

## What it touches

| Upgraded | Left alone |
|---|---|
| `bin/`, `cli/`, `env/` | `plugins/`, `themes/`, `tests/` |
| `dashboard/`, `.githooks/`, `docs/` | `starter.json`, `wp-matrix.json` |
| `.github/workflows/{ci,release,update-skills}.yml` | `.github/dependabot.yml`, `deploy-wporg.yml` |

The list lives in `cli/lib/lab-paths.mjs`, with the reasoning next to it. The two workflow
exceptions are there because `wpx init` writes your plugin slug into them, so replacing them would
undo the rename.

`env/docker-compose.gen.yml` is regenerated from your matrix on every command, and
`env/docker-compose.override.yml` exists precisely so you can bend the environment without forking
it. Neither is touched.

Lab regression tests live in `cli/tests/` and are upgraded with the tooling. CI runs them directly
with Node, without depending on scripts in your project-owned `package.json`. Type checks use
`wpx test types`, which reads the enabled plugin directories from `starter.json`.

Run `./bin/wpx skills update` separately to update agent skills. Required resource dependencies
(such as `wp-project-triage`) are included automatically even if an older `skills.install` list
does not name them. Your configured selection is not rewritten.

## Why it insists on a clean tree

`wpx upgrade` refuses to run with uncommitted changes. That is the whole safety mechanism: with a
clean tree, everything it did shows up as a `git diff` you can read, accept, or revert hunk by
hunk. No three-way merge, no shared history between your plugin and the starter, no surprises.

```bash
./bin/wpx upgrade
git diff                       # read it
git checkout -- cli/lib/log.mjs   # keep your version of one file
git commit -am "Upgrade lab tooling"
```

If you have deliberately customised a lab file, expect the upgrade to overwrite it and to reappear
in that diff every time. That is the signal to either upstream the change into your starter or move
it somewhere the upgrade does not reach.

`wpx doctor` mentions the lab version, and warns once it is more than 60 days old.
