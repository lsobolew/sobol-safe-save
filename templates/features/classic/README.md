# Classic editor support (archived)

Working code, removed from the free plugin on purpose. Restore it with:

```bash
./bin/wpx feature add classic
```

## Why it is not in the free plugin

Not because it is broken. The server half is well covered, and the whole thing was verified running
before it was taken out. It is out because **the browser half has no end-to-end test**, and shipping
a claim to the WordPress.org directory that nothing exercises is worse than not making the claim.

WordPress has no supported way to force the classic editor in a test environment. The block editor
is the default for every post type that supports it, and the only realistic routes are installing
the Classic Editor plugin or filtering `use_block_editor_for_post` from a must-use plugin — neither
of which the lab's environment provides today.

## What is here, and what state it is in

| Piece | State |
|---|---|
| `src/Modules/Classic/Module.php` | Complete. Enqueues the warning script on a classic editing screen, and records what a save actually cost. |
| `src/Core/Explainer.php` | Complete. The PHP wording of a change record — the block editor does its own in TypeScript, which is why this travels with the classic feature rather than staying in the core. |
| `scripts/classic/index.ts` | Complete. Reads the title, content and excerpt (TinyMCE when the visual tab is open, the textarea otherwise), debounces, and renders a `notice notice-warning` above the form. Never touches the form submission. |
| `tests/Integration/ClassicNoticeTest.php` | **7 tests, all passing.** Covers the safety net end to end on the server: a lossy save is recorded, a clean one is not, the recorded report matches what the database actually holds, the notice shows once and does not nag, reports are per user, an unchecked post type is skipped, and a save that did not come from the classic form is ignored. |
| End-to-end test | **Missing. This is the gap.** |

## What "fully tested" would mean before this ships

One spec, `tests/e2e/free/classic.spec.ts`, as the author user the suite already creates:

1. The warning appears above the form after typing risky content, in both the visual and the text tab.
2. It names the right field.
3. It disappears when the content becomes clean again.
4. The form still submits, and the post saves.
5. After the save, the "this save changed your content" notice appears, once.
6. An administrator on a single site sees none of it.

Getting the classic editor to appear at all needs one of:

- **Install the Classic Editor plugin in the e2e setup.** Add `wp plugin install classic-editor
  --activate` to the environment before the suite runs. Honest, because it is what users actually
  do — but it needs network access on every run, and it changes the environment for every other
  spec, so it wants its own target in `wp-matrix.json` rather than being switched on globally.
- **Mount a must-use plugin that filters `use_block_editor_for_post` to false** for one post type.
  Offline and surgical, and the spec can then use a post type nothing else touches. Needs an
  `mu-plugins` mount adding to `env/`, which is a change to the lab rather than to this plugin.

The second is the better fit for a version matrix. Either way, **write the spec first and watch it
fail**, because a spec that passes against the block editor is testing nothing.

## If this moves to the Pro edition

It can, with one change: the module currently lives in `Sobolewski\SobolSafeSave\Modules\Classic` and
constructs `Core\Analyzer` directly. In an add-on it would move to the Pro namespace and reach the
analysis through the public surface instead — `sobol_safe_save_analysis_complete` already carries the
report and a `surface` of `classic`, which is what the after-the-fact notice needs. The script and
`Explainer` move across unchanged.

`Core\Analyzer::fragments_from_content()` deliberately stayed in the free plugin. It splits content
into per-block fragments for surfaces that have no block editor, it is covered by
`AnalyzerAttributionTest`, and a future WP-CLI scan needs it just as much as this did.
