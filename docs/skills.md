# WordPress agent skills

The repository ships the official [WordPress agent skills](https://github.com/WordPress/agent-skills)
in `.agents/skills/`, with a generated compatibility copy in `.claude/skills/`. They are
instruction bundles that teach an AI assistant how WordPress
actually works: plugin architecture, hooks and security, the REST API, block development, WP-CLI,
performance, PHPStan, and the WordPress.org directory guidelines.

They are maintained by the WordPress project and licensed GPL-2.0-or-later.

## Install and update

```bash
./bin/wpx skills install    # first time
./bin/wpx skills update     # same command, refreshes to the newest upstream commit
./bin/wpx skills status     # what is installed, and whether upstream moved
./bin/wpx skills list       # everything available upstream
./bin/wpx skills global     # this repository's own skills, at user level
```

## Two kinds of skill

`wp-plugin-lab`, `create-wp-plugin`, and `wp-org-release` are maintained in this repository.
Everything else comes from WordPress. The installer adapts upstream `skills/...` resource paths
to `.agents/skills/...` and verifies that referenced resources exist before saving the lock.

`wpx skills global` copies all three into `~/.agents/skills/` for Codex and `~/.claude/skills/`
for Claude Code. That matters for one specific
case: a project skill is only visible once an agent is already inside the repository, which is too
late to help with "clone the starter and build me a plugin". Installed at user level, the
instructions are there before the clone exists.

Which skills get installed is configured in `starter.json`:

```jsonc
"skills": {
  "repo": "https://github.com/WordPress/agent-skills.git",
  "ref": "trunk",
  "targets": [ "codex", "claude" ],
  "install": [ "wordpress-router", "wp-plugin-development", "..." ]
}
```

An empty `install` array means every skill. This starter deliberately pins a project-focused list,
including `wp-project-triage`, so new upstream skills do not appear without review. `targets`
accepts `codex`, `claude`, `cursor`, `vscode`, and `antigravity`; several may be listed at once.
The canonical Codex directory is always installed, including when only a compatibility target is
requested, so cross-skill resource paths keep working.

## Why they are committed

`.agents/skills/` is the canonical, checked-in skill directory. `.claude/skills/` is regenerated
from the same sources for Claude Code. Both are committed on purpose:

- everyone working on the project - person or agent - gets the same instructions,
- an upgrade shows up as a reviewable diff rather than as silently changed behaviour,
- a clone is immediately useful with no extra setup step.

`.agents/wplab-skills.lock.json` records the exact upstream commit, its date, the selected skills
and the install targets.

## Keeping them current

Three things keep the pack from going stale:

1. `./bin/wpx skills update` fetches the newest commit and reports what moved.
2. `./bin/wpx doctor` warns once the installed pack is more than 30 days old.
3. `.github/workflows/update-skills.yml` runs weekly and opens a pull request whenever upstream
   has changed, so the update lands as a normal review rather than as a surprise.

Review the diff before merging. These files steer how code gets written in this repository, so they
deserve the same attention as any other dependency bump.
