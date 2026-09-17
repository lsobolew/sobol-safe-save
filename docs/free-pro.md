# Free and Pro editions

The starter ships two plugins: a free one meant for WordPress.org, and a paid add-on that extends
it. This is the **base plus add-on** model, not two builds of one codebase.

## Why an add-on

WordPress.org forbids paid code inside a hosted plugin, so a single codebase would have to be split
at build time anyway. An add-on is better on top of that:

- A customer who buys does not have to deactivate anything; they install a second plugin.
- Free and paid can be released, versioned and updated on their own schedules.
- Both configurations - free alone, and free with the add-on - can be tested independently, which
  is exactly where paid plugins tend to break.

## How they connect

The add-on never bundles the free plugin's classes. It consumes them at runtime through a
versioned contract:

```php
// Free plugin, Core\Api
const VERSION = '1.0.0';   // semver for the extension contract, not the plugin version

// Add-on, my-plugin-pro.php
define( 'MY_PLUGIN_PRO_MIN_CORE_API', '1.0.0' );
```

On `plugins_loaded` (priority 1, before the free plugin boots at 5) the add-on checks that
`Core\Api` exists and that `Api::is_compatible()` accepts it. If not, it shows an admin notice and
stops. It never takes the site down with a fatal error.

Two more safeguards: the `Requires Plugins: my-plugin` header (WordPress 6.5+) stops activation
without the base plugin, and a different major API version is treated as incompatible even when it
is numerically newer.

## The extension points

| Hook | Purpose |
|---|---|
| `myplugin_modules` | Filter the list of module classes |
| `myplugin_register_modules` | Add modules to the registry (this is what the add-on uses) |
| `myplugin_loaded` | The plugin is fully booted |
| `myplugin_settings_defaults` | Add keys to the settings |
| `myplugin_settings_sanitize` | Final say on what is stored |
| `myplugin_rest_item` | Add fields to the REST response |
| `myplugin_upgraded` | React to a version upgrade |

The add-on's `Modules\Featured\Module` uses nothing else. Anything beyond this list is an internal
detail and may change - if the add-on needs more, add a hook to the free plugin rather than
reaching around it, and bump `Api::VERSION` accordingly.

## Licensing and updates

`License\LicenseManager` stores the key, asks the provider whether it is valid, and caches the
answer in a transient for twelve hours. A failed request is cached as `unknown` for one hour and
never as "invalid" - a temporary store outage must not lock a paying customer out.

**Only updates are gated by the licence.** The features keep working when a licence expires, so a
lapsed subscription never breaks a live site. That is a deliberate product decision; change it in
`Core\Bootstrap` if your business model differs.

Updates use the native `update_plugins_{$hostname}` filter (WordPress 5.8+) together with the
`Update URI` header, rather than rewriting the `update_plugins` transient. The filter only fires
for plugins whose header points at your host, so there is no way to accidentally hijack somebody
else's update - a very real risk with the transient approach.

The licence backend is one class behind an interface:

```php
add_filter( 'myplugin_pro_license_provider', fn() => new MyEddProvider() );
add_filter( 'myplugin_pro_license_endpoint', fn() => 'https://shop.example.com/api/' );
```

`GenericJsonProvider` documents the request and response shape. EDD Software Licensing, Lemon
Squeezy and Freemius all fit the same interface.

## Building both

```bash
./bin/wpx build --edition=both --verify
```

Two zips land in `dist/`. `--verify` unpacks each one into a throwaway directory on a running site
and activates it, which catches a package that is missing files before a customer downloads it.
