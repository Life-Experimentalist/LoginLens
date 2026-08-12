#!/usr/bin/env bash
#
# Asserts that `npm run build` in website/ produced a real prerendered site.
#
# A regression that turns the build back into a plain SPA is invisible in a
# browser — React hydrates and the page looks right — and total for anything
# that does not run JavaScript, which is every crawler and link preview that
# matters for a site whose job is to explain what the extension does.
#
# Called from two places on purpose: CI runs it on pull requests, where a
# failure is still cheap to fix, and deploy-website.yml runs it against the
# tree it is about to publish. Sharing the script is what keeps those two
# checks from drifting apart.
#
# Run from the website/ directory, after a build.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

for page in index docs/index decrypt/index uninstall/index 404; do
  file="dist/${page}.html"
  [ -f "$file" ] || fail "$file was not generated"
  if grep -q '<div id="root"></div>' "$file"; then
    fail "$file shipped an empty root — prerender did not run"
  fi
done

[ -f dist/sitemap.xml ] || fail "sitemap.xml missing"

# Pages drops the custom domain when this file is absent, which silently
# moves the site to *.github.io and breaks every published link to it.
[ -f dist/CNAME ] || fail "CNAME missing — Pages would drop the custom domain"

echo "prerendered pages, sitemap and CNAME all present"
