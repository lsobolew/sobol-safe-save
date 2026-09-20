# Extending Sobol Safe Save

Sobol Safe Save's free edition answers one question — *what will this save cost me?* — and shows the
answer. It never blocks a save, never keeps a history and never reports across a site. Those are
the things an add-on is for, and everything an add-on needs is on this page.

Two rules shape all of it:

1. **An add-on may only use what is documented here.** Reaching into a class that is not listed is
   a bug, not a shortcut: everything else is free to change in a patch release.
2. **The free plugin contains no paid functionality, not even switched off.** WordPress.org
   guideline 5 forbids shipping code that is withheld pending payment, so "prevent save" is not a
   disabled branch here — the code genuinely does not exist, and
   `tests/Integration/ExtensionApiTest.php` fails the build if it ever appears.

## The contract version

`Sobolewski\SobolSafeSave\Core\Api::VERSION` is semver and independent of the plugin version. A major
bump means a breaking change for add-ons.

```php
if ( ! class_exists( \Sobolewski\SobolSafeSave\Core\Api::class )
	|| ! \Sobolewski\SobolSafeSave\Core\Api::is_compatible( '1.0.0' ) ) {
	// Say so in an admin notice and stop. Never fatal on a customer's site.
	return;
}
```

## PHP

| Hook | Type | What it is for |
|---|---|---|
| `sobol_safe_save_modules` | filter | The list of module class names, before any is constructed. |
| `sobol_safe_save_register_modules` | action | Receives the `Plugin`; call `add_module()` to join the registry. |
| `sobol_safe_save_loaded` | action | Everything is booted. |
| `sobol_safe_save_should_check` | filter | `( bool $should, array $context )`. Return false and the editor is told there is nothing to say. Per-role and per-post-type policies live here. |
| `sobol_safe_save_analysis_complete` | action | `( Report $report, array $context )` after every analysis. **This is the audit hook**: history, alerts and site reports all hang on it. |
| `sobol_safe_save_report` | filter | `( array $payload, Report $report, array $context )`. Add fields for your own editor script to read. |
| `sobol_safe_save_settings_defaults` | filter | Add your own settings keys. |
| `sobol_safe_save_settings_sanitize` | filter | The last word before settings are stored. |
| `sobol_safe_save_max_content_length` | filter | Largest document to analyse, in bytes. |

`$context` carries `surface`, `post_id` and `post_type`. `surface` is `rest` today — it exists so
that an add-on adding its own analysis surface (a classic editor screen, a WP-CLI scan) can be told
apart from the editor without inspecting the request.

`Report` is read-only: `applies()`, `changed()`, `fields()`, `blocks()`, `confidence()`,
`to_array()`. A `Finding` has `scope()`, `key()`, `label()`, `before()`, `after()`, `changes()`.

### Keeping a history

```php
add_action(
	'sobol_safe_save_analysis_complete',
	function ( $report, $context ) {
		if ( ! $report->changed() ) {
			return;
		}

		my_addon_log( array(
			'user'    => get_current_user_id(),
			'post'    => $context['post_id'],
			'lost'    => array_map(
				static function ( $finding ) {
					return array( 'block' => $finding->label(), 'changes' => $finding->changes() );
				},
				$report->blocks()
			),
		) );
	},
	10,
	2
);
```

## JavaScript

The editor script registers a data store and fires one action. Both are read-only: nothing an
add-on does here changes what the free plugin displays.

```js
wp.data.select( 'sobol-safe-save' ).getReport();    // the latest analysis, or null
wp.data.select( 'sobol-safe-save' ).isAnalyzing();  // whether a request is in flight
wp.hooks.addAction( 'sobol_safe_save.report', 'vendor/addon', ( report ) => { /* ... */ } );
```

Hook names use dots. `@wordpress/hooks` validates them against `/^[a-zA-Z][a-zA-Z0-9_.-]*$/` and
rejects a slash, so `sobol-safe-save/report` would fail at runtime with only a console error to show for
it. Store names may contain slashes; this one does not.

### Blocking a save

This is the paid feature, and it belongs entirely in the add-on's own script:

```js
import { addAction } from '@wordpress/hooks';
import { dispatch } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';

const LOCK = 'my-addon';

addAction( 'sobol_safe_save.report', 'vendor/addon', ( report ) => {
	if ( report?.schemaVersion !== 1 ) {
		return; // Built against a payload this script does not understand.
	}

	const editor = dispatch( editorStore );

	report.changed ? editor.lockPostSaving( LOCK ) : editor.unlockPostSaving( LOCK );
} );
```

Enqueue it after the free script, and check the free script is actually there — `WP_Scripts` drops
a handle whose dependency is missing, silently:

```php
add_action( 'enqueue_block_editor_assets', function () {
	if ( ! wp_script_is( 'sobol-safe-save-editor', 'registered' ) ) {
		return; // Sobol Safe Save is not active. Say so in an admin notice.
	}

	wp_enqueue_script( 'my-addon-editor', $url, array( 'wp-hooks', 'wp-data', 'wp-editor', 'sobol-safe-save-editor' ), $ver, true );
} );
```

## The payload

`schemaVersion` is `1`. Check it before reading anything else.

```json
{
  "schemaVersion": 1,
  "applies": true,
  "changed": true,
  "confidence": "full",
  "fields": {
    "post_content": {
      "scope": "field", "key": "post_content", "label": "",
      "before": "…", "after": "…",
      "changes": [ { "kind": "tag_removed", "tag": "iframe", "name": "", "count": 1 } ]
    }
  },
  "blocks": [
    {
      "scope": "block", "key": "<clientId>", "label": "core/html",
      "before": "…", "after": "…", "changes": [ … ]
    }
  ]
}
```

`changed` is the verdict and comes from filtering the whole document, exactly as `wp_insert_post()`
does. `blocks` is **attribution**, which is a weaker claim — `confidence` says how far to trust it:

- `full` — every change is accounted for by a block (or the change was a title or excerpt, which
  have no blocks).
- `partial` — the content changes, but no single block accounts for it. A stray `<` at a block
  boundary is consumed differently in the whole document than in a fragment of it.
- `none` — no per-block information, either because none was asked for or because the site has
  `use_balanceTags` on, which rewrites the document as a whole and belongs to no block.

`kind` is one of `tag_removed`, `attribute_removed`, `style_property_removed`,
`block_delimiter_changed`, `entity_changed`, `whitespace_trimmed`, `other`.

## The REST route

`POST /sobol-safe-save/v1/analyze`, taking `post_id`, `post_type`, `title`, `content`, `excerpt` and an
optional `fragments` list of `{ clientId, name, html }`, where `html` is a block's **own** markup
with its children removed. Permissions are `edit_post` for an existing post, the post type's
`edit_posts` otherwise. The route only reads; it stores nothing.
