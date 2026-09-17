# Blocks

The starter ships three blocks, in TypeScript, because they cover three genuinely different
problems. Copy whichever matches what you are building and delete the rest with
`./bin/wpx feature remove blocks` or by hand.

```
plugins/<slug>/blocks/           sources (TypeScript, never shipped)
  item-list/   dynamic  - rendered by render.php on every request
  callout/     static   - save() writes markup into the post, plus a deprecation
  section/     container - InnerBlocks
plugins/<slug>/build/            output (what actually ships)
```

Adding a block means adding a directory with a `block.json`. Nothing in PHP names an individual
block: `Modules\Blocks\Module` registers whatever it finds under `build/`.

## Choosing a shape

**Dynamic** (`render` in block.json, `save` returns null). The markup is produced by PHP on every
request, so the output can depend on data that changes after the post was saved - a list of recent
items, anything user-specific, anything permission-dependent. It costs a little performance and it
cannot be cached as plain HTML.

**Static** (`save` returns JSX). The markup is written into the post content, so rendering costs
nothing. The catch is below.

**Container** (InnerBlocks). The block contributes a wrapper and lets other blocks live inside it.
`useInnerBlocksProps` merges the wrapper and the inner block list into one element instead of
nesting two divs.

## The deprecation trap

This is the one that bites, and it only bites in production.

A static block stores its HTML in the database. When WordPress loads a post it re-runs `save()`
and compares the result with what is stored. If they differ by so much as a class name, the editor
shows *"This block contains unexpected or invalid content"* and the author is offered a choice
between recovering the block and losing it.

So: **changing `save()` breaks every post already saved with the old markup**, unless the old shape
is listed in `deprecated`.

`blocks/callout/deprecated.tsx` shows the pattern. Two rules keep it working:

1. **Never edit an entry that has shipped.** Add a new one. An entry describes markup sitting in
   somebody's database right now; rewriting it means the block that used to load no longer does.
2. **Newest first.** WordPress tries the current `save` and then walks the list in order.

`migrate` converts the old attributes into the current ones - in the example, the v1 `text`
attribute becomes `message` and a default `tone` is added.

The e2e suite has a test for exactly this (`tests/e2e/free/blocks.spec.ts`): it loads v1 markup and
fails if the editor flags it as invalid. Delete the `deprecated` import and watch it go red - that
is the regression it is there to catch.

## Capabilities change what gets saved

WordPress filters post content through `wp_kses_post()` for every user without the
`unfiltered_html` capability. Measured on WordPress 7.x:

| Where | Who has `unfiltered_html` |
|---|---|
| Single site | administrator, editor |
| **Multisite** | **super admin only** - a site administrator does not |

So the person writing the plugin, testing as an administrator on their own machine, never sees what
their users get. For a static block that is not cosmetic: KSES rewrites the stored markup, the
markup stops matching what `save()` produces, and the next person to open the post is told the
block contains invalid content.

What actually survives, measured rather than assumed:

| Survives | Stripped |
|---|---|
| `class`, `data-*` attributes | `<script>` |
| CSS custom properties, `url()` values included | `mask-image`, `-webkit-mask-image` |
| `background-color`, `width`, `height`, `display` | `behavior:` and other dangerous CSS |
| Block delimiters (`<!-- wp:… -->`) | |

The practical consequence: **do not write exotic CSS into the `style` attribute**. An icon built on
`mask-image` has to put the URL into a custom property (`--icon: url(…)`, which survives) and let a
stylesheet consume it. The direct version silently loses its styling for anyone who is not an
administrator - and for everyone but the super admin on multisite.

`tests/Integration/KsesCompatibilityTest.php` guards this: it asserts each block's saved markup
passes through KSES untouched, and that an author saves byte-identical content to an administrator.
Extend the provider when you add a block.

## The build

Vite, driven by `cli/vite/wordpress-blocks.mjs`.

```bash
./bin/wpx dev      # rebuild on every change
./bin/wpx build    # production build, minified
./bin/wpx test types   # tsc --noEmit
```

Each block produces:

| File | What it is |
|---|---|
| `index.js` | The editor script, as an IIFE - WordPress loads editor scripts as classic scripts |
| `index.asset.php` | The script handles the block depends on, plus a version hash |
| `index.css` | Editor styles (from `editor.scss`) |
| `style-index.css` | Front-end styles (from `style.scss`), built separately so the two never merge |
| `block.json`, `render.php` | Copied next to the build, because that is where WordPress reads them |

`index.asset.php` is the part that is easy to get wrong and hard to notice. It tells WordPress that
the block needs `wp-blocks`, `wp-block-editor` and friends. Without it the script is registered
with no dependencies, loads before the editor exists, and the block silently never appears. The
build reuses the mapping from `@wordpress/dependency-extraction-webpack-plugin`, so the handles are
exactly the ones the official tooling would emit.

## TypeScript

`strict` is on, along with `noUncheckedIndexedAccess`. Two accommodations are worth knowing about:

- `blocks/shared/register.ts` wraps `registerBlockType`. The published type definitions still
  describe the pre-5.8 API, where blocks passed their title, category and attributes in JavaScript;
  since `block.json` became the source of truth, real call sites pass only a name and the edit/save
  pair, which those types reject. The mismatch lives in that one file so nothing else needs a cast.
- `types/wordpress.d.ts` declares `@wordpress/server-side-render`, which ships no types at all.

Both are the kind of thing to delete once the WordPress packages ship their own types.

## Testing a block

`./bin/wpx test e2e` inserts each block in the real editor, publishes, and checks the front end -
on every theme in the sweep. It also fails on any console error, which turns out to be the most
useful signal when a block meets a theme it has never seen. See [themes](themes.md).
