=== SEO Autofill ===
Contributors: seoautofill
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later

REST API for safely filling missing WooCommerce and Yoast SEO fields, driven by an external agent.

== Description ==
Exposes scan, batch update, history, and rollback endpoints under the `seo-autofill/v1` namespace. The plugin enforces an empty-only write rule: it refuses to overwrite any field that already has non-whitespace content. Every write is logged in a custom rollback table.

== Installation ==
1. Upload the `plugin/` folder to `wp-content/plugins/seo-autofill`.
2. Activate it.
3. Visit Settings &rarr; SEO Autofill, generate a token, and set the token user ID (must have `manage_woocommerce`).

== Changelog ==
= 0.1.0 =
* Initial release.
