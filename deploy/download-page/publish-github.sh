#!/usr/bin/env bash
# Publish a release on GitHub: the package as release assets of a public downloads
# repository, and the download page on that repository's GitHub Pages site.
#
#   deploy/download-page/publish-github.sh 1.0.0
#
# The repository (NIGHTSHIFT_DOWNLOADS_REPO, default Imad-SH/nightshift-downloads) is
# created if it does not exist. It holds the page and the packages only, never the
# source code. Anyone with the link can download the packages.
# Safe to run again: what is already published is kept.
# Needs curl, git and node. Signs in with GITHUB_TOKEN, or with git's saved GitHub login.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:?Usage: deploy/download-page/publish-github.sh <version>}"
REPO="${NIGHTSHIFT_DOWNLOADS_REPO:-Imad-SH/nightshift-downloads}"
OWNER="${REPO%%/*}"; NAME="${REPO#*/}"
TAG="v$VERSION"
PAGE_URL="https://$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]').github.io/$NAME/"
PKG="$ROOT/release/nightshift-$VERSION.tar.gz"
die() { echo "Error: $*" >&2; exit 1; }
[ -f "$PKG" ] && [ -f "$PKG.sha256" ] || die "No package for $VERSION in release/: run ./release.sh $VERSION first."

TOKEN="${GITHUB_TOKEN:-$(printf 'protocol=https\nhost=github.com\n\n' | GCM_INTERACTIVE=never GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^password=//p')}"
[ -n "$TOKEN" ] || die "No GitHub login: set GITHUB_TOKEN, or push to GitHub once so git saves your login."

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
api() { curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }
# Value at a dotted path of the JSON on standard input (empty when missing)
field() {
  node -e 'let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    let v; try { v = JSON.parse(s); } catch (e) {}
    for (const k of process.argv[1].split(".")) v = v == null ? v : v[k];
    process.stdout.write(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  })' "$1"
}

echo "== Repository $REPO"
code="$(api -o /dev/null -w '%{http_code}' "https://api.github.com/repos/$REPO")"
if [ "$code" = 404 ]; then
  login="$(api https://api.github.com/user | field login)"
  endpoint="https://api.github.com/orgs/$OWNER/repos"
  [ "$login" = "$OWNER" ] && endpoint="https://api.github.com/user/repos"
  body="$(node -e 'console.log(JSON.stringify({ name: process.argv[1], description: "Download and install Nightshift",
    homepage: process.argv[2], private: false, has_issues: false, has_projects: false, has_wiki: false, auto_init: true }))' "$NAME" "$PAGE_URL")"
  code="$(api -o "$TMP/repo.json" -w '%{http_code}' -X POST "$endpoint" -d "$body")"
  [ "$code" = 201 ] || die "Creating $REPO failed (HTTP $code): $(cat "$TMP/repo.json")"
  echo "Created the public repository"
  sleep 3
elif [ "$code" != 200 ]; then
  die "Cannot read $REPO (HTTP $code)"
fi

echo "== Release $TAG"
id="$(api "https://api.github.com/repos/$REPO/releases/tags/$TAG" | field id)"
if [ -z "$id" ]; then
  body="$(node -e 'const [tag, version, page, sha] = process.argv.slice(1); console.log(JSON.stringify({
    tag_name: tag, target_commitish: "main", name: "Nightshift " + version,
    body: "Installation steps: " + page + "\n\nSHA-256 of nightshift-" + version + ".tar.gz: `" + sha + "`" }))' \
    "$TAG" "$VERSION" "$PAGE_URL" "$(cut -d' ' -f1 "$PKG.sha256")")"
  id="$(api -X POST "https://api.github.com/repos/$REPO/releases" -d "$body" | field id)"
  [ -n "$id" ] || die "Creating the release $TAG failed."
  echo "Created the release"
fi
have=" $(api "https://api.github.com/repos/$REPO/releases/$id/assets?per_page=100" \
  | node -e 'let s = ""; process.stdin.on("data", d => s += d).on("end", () => console.log(JSON.parse(s).map(a => a.name).join(" ")))') "
for f in "$PKG.sha256" "$PKG"; do
  name="$(basename "$f")"
  case "$have" in *" $name "*) echo "Already uploaded: $name"; continue ;; esac
  echo "Uploading $name ($(du -h "$f" | cut -f1))..."
  code="$(curl -sS -o "$TMP/asset.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/octet-stream" -T "$f" \
    "https://uploads.github.com/repos/$REPO/releases/$id/assets?name=$name")"
  [ "$code" = 201 ] || die "Uploading $name failed (HTTP $code): $(cat "$TMP/asset.json")"
  [ "$(field size < "$TMP/asset.json")" = "$(wc -c < "$f" | tr -d ' ')" ] || die "$name arrived incomplete."
  echo "Uploaded $name"
done

echo "== Download page"
"$ROOT/deploy/download-page/build.sh" "$VERSION" "https://github.com/$REPO/releases/download/$TAG/"
git clone -q --depth 1 "https://github.com/$REPO.git" "$TMP/site"
for f in index.html favicon.png preview.png bluesec-logo.svg nightshift-logo.png nightshift-logo-white.png nightshift-mark.png nightshift-mark-white.png; do cp "$ROOT/release/$f" "$TMP/site/"; done
touch "$TMP/site/.nojekyll"
cat > "$TMP/site/README.md" <<EOF
# Nightshift downloads

Download and installation steps: **$PAGE_URL**

The packages are attached to the [releases](https://github.com/$REPO/releases).
EOF
git -C "$TMP/site" add -A
if git -C "$TMP/site" diff --cached --quiet; then
  echo "Page already up to date"
else
  git -C "$TMP/site" commit -q -m "Nightshift $VERSION download page"
  git -C "$TMP/site" push -q origin HEAD
  echo "Page pushed"
fi

code="$(api -o /dev/null -w '%{http_code}' "https://api.github.com/repos/$REPO/pages")"
if [ "$code" = 404 ]; then
  code="$(api -o "$TMP/pages.json" -w '%{http_code}' -X POST "https://api.github.com/repos/$REPO/pages" \
    -d '{"source":{"branch":"main","path":"/"}}')"
  [ "$code" = 201 ] || die "Turning on GitHub Pages failed (HTTP $code): $(cat "$TMP/pages.json")"
  echo "GitHub Pages turned on"
fi

echo "Waiting for $PAGE_URL to serve the new page (GitHub Pages takes a minute or two)..."
# Compare the whole page: an older page of the same version would match a simpler check
want="$(sha256sum "$ROOT/release/index.html" | cut -d" " -f1)"
for _ in $(seq 1 60); do
  [ "$(curl -s -H "Cache-Control: no-cache" "$PAGE_URL" | sha256sum | cut -d" " -f1)" = "$want" ] && { echo; echo "Published: $PAGE_URL"; exit 0; }
  sleep 5
done
die "The page is not online yet. Check https://github.com/$REPO/settings/pages"
