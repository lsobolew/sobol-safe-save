=== Sobol Safe Save ===
Contributors: lsobolew
Tags: editor, content, kses, permissions, html
Requires at least: 6.8
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Warns you before saving when WordPress is about to strip part of your content, and shows which blocks.

== Description ==

WordPress quietly removes HTML that the person saving is not allowed to publish. No warning, no
notice, no record: the editor closes, the content looks wrong, and nobody knows why.

It happens more often than most people realise, because it has nothing to do with the content and
everything to do with who saved it. Anyone without the `unfiltered_html` capability is affected —
that is every Author and Contributor on a normal site, and **every user except the super admin on
multisite, site administrators included**.

Sobol Safe Save tells you before it happens.

= What it does =

* Checks your content while you write, a moment after you stop typing.
* Warns you before you save that this save will change your content.
* Lists which blocks are affected, and takes you to them.
* Says what will go: a removed `<iframe>`, an `onclick` attribute, a `mask-image` style, a block
  marker that will be rewritten.
* Works in the block editor.
* **Never blocks a save.** It is a warning, not a gate. You stay in control of your own content.

= How it knows =

Sobol Safe Save does not guess, and it does not keep its own list of what WordPress allows. It runs your
content through the same code WordPress itself runs on save — including the filters that are not
KSES at all, such as the one that rewrites certain characters and the one that trims post titles —
and reports the difference. Its test suite checks the prediction against what actually lands in the
database, on every WordPress version it supports.

= What it does not do =

Nothing is sent anywhere. There is no tracking, no external service and no account. The analysis
happens on your own server, and nothing is stored.

= For developers =

Sobol Safe Save exposes documented PHP hooks and a JavaScript data store so that an add-on can build on
it — an audit log, alerts, per-role policies. See EXTENDING.md in the plugin's repository.

== Installation ==

1. Install and activate the plugin.
2. That is all — it starts checking straight away for the users who need it.

Under Settings → Sobol Safe Save you can choose which post types are checked, whether the title and
excerpt are checked too, and how long to wait after typing stops.

== Frequently Asked Questions ==

= Why am I not seeing any warnings? =

Most likely nothing of yours is being filtered. On a single site, administrators and editors hold
the `unfiltered_html` capability, so WordPress leaves their content alone and Sobol Safe Save has nothing
to report. Try the same content as an Author.

= Does it stop me from saving? =

No. It warns you before you save, and the save button works exactly as it did. What you do about
the warning is up to you.

= Does it change my content? =

No. Sobol Safe Save only ever reads. The changes it reports are made by WordPress itself, and would
happen whether or not this plugin is installed — the difference is that you now know about them.

= Does it slow down the editor? =

The check runs on your own server a short pause after you stop typing, never on every keystroke,
and it stops asking altogether for users whose content is not filtered. The delay is configurable.

= Does it work on multisite? =

Yes, and that is where it matters most: on multisite only the super admin may post unfiltered HTML,
so a site's own administrator loses content exactly as an author does.

= What about the classic editor? =

Not yet. This version covers the block editor only. Classic editor support is written and works, but
it is not shipped until it has the same end-to-end test coverage as everything else here.

== Changelog ==

= 0.1.0 =
* Initial release.

== Upgrade Notice ==

= 0.1.0 =
Initial release.
