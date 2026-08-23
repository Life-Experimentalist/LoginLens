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
[ -f dist/robots.txt ] || fail "robots.txt missing"
[ -f dist/llms.txt ] || fail "llms.txt missing"

grep -q '<lastmod>' dist/sitemap.xml ||
  fail "sitemap.xml has no <lastmod> — the checkout has no git history to read it from"

# The homepage is the only page that may claim to *be* the extension. When the
# same graph is copied onto every page, /docs advertises itself as a
# SoftwareApplication living at a URL that is not its own canonical.
grep -q '"SoftwareApplication"' dist/index.html ||
  fail "homepage lost its SoftwareApplication structured data"
grep -q '"TechArticle"' dist/docs/index.html ||
  fail "docs page lost its TechArticle structured data"
# `if` rather than `&& fail`: under `set -e` a trailing `&&` whose left side
# fails takes the whole script down, which is the passing case here.
if grep -q '"SoftwareApplication"' dist/docs/index.html; then
  fail "docs page claims to be the extension — structured data is not per-route"
fi

grep -q 'noindex' dist/uninstall/index.html ||
  fail "uninstall page is missing its noindex — it would be indexed"

# Pages drops the custom domain when this file is absent, which silently
# moves the site to *.github.io and breaks every published link to it.
[ -f dist/CNAME ] || fail "CNAME missing — Pages would drop the custom domain"

echo "prerendered pages, per-page structured data, sitemap, robots, llms.txt and CNAME all present"
