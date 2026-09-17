# readme.txt field reference

Every field, with the rule that actually matters. Source: the Plugin Handbook, plus what Plugin
Check enforces in practice.

## Header

```
=== Plugin Name ===
Contributors: wporg-username
Donate link: https://example.org/donate
Tags: tag1, tag2
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Short description, plain text, 150 characters maximum.
```

| Field | Required | Rule |
|---|---|---|
| Plugin Name | yes | Between `===`. Must not contain a restricted or trademarked term. |
| Contributors | no | WordPress.org **usernames**, comma separated. A name that is not a username credits nobody and cannot be fixed by the user later. |
| Donate link | no | A single URL. |
| Tags | no | Only the first 5 are indexed. Unrelated or competitor tags count as keyword stuffing. |
| Requires at least | yes in practice | The oldest WordPress you test. Shown on the plugin page and enforced at install time. |
| Tested up to | yes in practice | The newest WordPress you tested. If it falls two major versions behind, the directory shows the plugin as untested. |
| Requires PHP | no | Enforced at install time. |
| Stable tag | yes | Must be identical to `Version:` in the main plugin file. |
| License / License URI | yes | GPL-compatible. |

### Stable tag, in detail

`Stable tag` names the SVN tag the directory serves. Three failure modes:

- **Mismatch with the plugin header** - Plugin Check reports `stable_tag_mismatch`, and users get a
  version that does not match what the directory advertises.
- **Left as `trunk`** - every commit to trunk ships immediately to every user. Occasionally
  deliberate, almost always a mistake.
- **Pointing at a tag that does not exist** - the directory serves nothing.

### Short description

The line after the header block, before the first `==` section. Plain text, **150 characters**.
Longer is truncated with no warning on the page itself; Plugin Check reports
`readme_parser_warnings_trimmed_short_description`.

## Sections

Order is conventional rather than enforced, but users expect this one:

```
== Description ==
== Installation ==
== Frequently Asked Questions ==
== Screenshots ==
== Changelog ==
== Upgrade Notice ==
```

- **Description** - what it does and who it is for. The first paragraph is what people read.
- **Installation** - only worth writing when something beyond "activate it" is needed.
- **Frequently Asked Questions** - each question is a `= Question =` heading followed by the answer.
- **Screenshots** - a numbered list. Item *n* is the caption for `screenshot-n.png` in the assets
  directory, not in the plugin zip.
- **Changelog** - newest first, `= 1.2.0 =` per version. Keep it factual.
- **Upgrade Notice** - per version, one or two lines; it appears inline in the update prompt, so
  anything long gets cut.

Custom sections are allowed and appear as extra tabs.

## Formatting

A restricted Markdown:

- `**bold**`, `*italic*`
- `` `code` `` and indented blocks
- `[text](https://example.com)` and bare URLs
- `*` or `1.` lists
- `= Heading =` inside a section
- `> blockquote`

HTML is not rendered.

## Validation

- <https://wordpress.org/plugins/developers/readme-validator/> checks a pasted readme.
- `./bin/wpx test plugin-check --targets=latest` runs the same checks the reviewers run, against a
  copy assembled the way a release is.

Checks worth knowing by name: `stable_tag_mismatch`, `no_plugin_readme`,
`readme_parser_warnings_trimmed_short_description`, `trademarked_term`, `default_readme_text`
(placeholder text left from a generator), `outdated_tested_upto_header`.
