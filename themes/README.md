# Local themes

Drop a theme directory here and it is mounted into every WordPress container, exactly like the
plugins are. Edit it on the host and the change is live on every version at once.

To include one in the tests, add it to `wp-matrix.json`:

```jsonc
{ "slug": "acme-theme", "alias": "acme", "source": "local", "type": "block" }
```

`source: "local"` means "already on disk here". Use `source: "wporg"` for anything installable
from the WordPress.org theme directory - those are downloaded into the container instead, so they
do not need to sit in this repository.

`type` is either `block` or `classic`. It is documentation rather than behaviour, but it is the
distinction that matters when a block misbehaves: classic themes have no `theme.json`, load styles
differently, and do not render the editor inside an iframe.
