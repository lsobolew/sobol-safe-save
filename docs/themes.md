# Themes

A block behaves differently depending on the theme around it, and the difference that matters is
not which theme - it is **block theme versus classic theme**:

| | Block theme (TT5, TT4) | Classic theme (TT1) |
|---|---|---|
| `theme.json` | Yes - drives colours, spacing, layout | No, or partial |
| Editor canvas | Rendered in an iframe | Often not |
| Block styles | `wp_enqueue_block_style`, loaded per block | Usually one global stylesheet |
| Layout support | Provided by the theme | Your block is on its own |

A block that looks perfect on Twenty Twenty-Five can be unstyled, mispositioned or broken on a
classic theme, and nobody notices until a customer reports it. That is the entire reason themes are
a dimension of the test matrix.

## Configuration

In `wp-matrix.json`:

```jsonc
"themes": {
  "default": "twentytwentyfive",
  "sweep": {
    "targets": [ "latest" ],
    "themes": [ "twentytwentyfive", "twentytwentyfour", "twentytwentyone" ]
  },
  "available": [
    { "slug": "twentytwentyfive", "alias": "tt5", "source": "wporg", "type": "block" },
    { "slug": "twentytwentyfour", "alias": "tt4", "source": "wporg", "type": "block" },
    { "slug": "twentytwentyone",  "alias": "tt1", "source": "wporg", "type": "classic" }
  ]
}
```

- **`default`** is what every environment runs day to day.
- **`sweep`** decides where the full set runs. Every extra theme is another complete end-to-end
  run, so by default only the newest WordPress sweeps all three and the rest stay on the default.
  Two block themes and one classic theme is the cheapest set that still covers the real split.
- **`alias`** is what shows up in result names (`latest-free-tt1-e2e`) and on the dashboard badges.
  Full slugs would not fit.

## Your own themes

Two sources are supported:

**`wporg`** - anything in the WordPress.org theme directory. Installed into the container by the
entrypoint, so it never has to sit in your repository.

**`local`** - a directory in `themes/`, mounted into every container exactly like the plugins.
Edit it on the host and the change is live on every WordPress version at once:

```jsonc
{ "slug": "acme-theme", "alias": "acme", "source": "local", "type": "block" }
```

A configured local theme whose directory does not exist is skipped rather than mounted, because
Docker would otherwise create an empty directory and WordPress would list a broken theme.

## Commands

```bash
./bin/wpx theme list                        # configured themes, and what is active where
./bin/wpx theme use twentytwentyone          # switch one environment (slug or alias)
./bin/wpx theme use tt1 --targets=latest,min
./bin/wpx theme install                      # pull every wporg theme into the containers

./bin/wpx test e2e                           # sweeps per the matrix
./bin/wpx test e2e --themes=tt1              # just the classic theme
```

The runner activates the theme before the suite starts rather than inside a test: switching
mid-suite would leave a page rendered by a different theme than the assertions were written for.

Switching by hand with `wpx theme use` sticks - the entrypoint only forces the default on a fresh
site or after a core upgrade, so a restart will not undo your choice.
