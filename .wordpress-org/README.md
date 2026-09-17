# WordPress.org directory assets

Published to the plugin's directory page by `deploy-wporg.yml`. They live in the SVN `assets/`
directory, beside `trunk` and `tags` - they are **not** part of the plugin zip.

| File | Size | Limit | Purpose |
|---|---|---|---|
| `banner-772x250.png` | 772×250 | 4 MB | Header on the plugin page |
| `banner-1544x500.png` | 1544×500 | 4 MB | Retina banner; only works alongside the standard one |
| `icon-128x128.png` | 128×128 | 1 MB | Icon in search results and the plugins screen |
| `icon-256x256.png` | 256×256 | 1 MB | Retina icon |
| `icon.svg` | vector | 1 MB | Optional, and still needs a PNG fallback |
| `screenshot-1.png` | any | 10 MB | Caption comes from the first entry under `== Screenshots ==` |

JPG works wherever PNG does. Filenames must be lowercase - uppercase is ignored. Screenshot
numbering maps to the readme list in order, so `screenshot-2.png` is the second line.

Localised variants append a locale before the extension: `banner-772x250-pl_PL.png`.

See `.claude/skills/wp-org-release/` for the readme.txt format and the submission process.
