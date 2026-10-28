#!/usr/bin/env bash
# Write the download page of a release to release/index.html, with its images
# (favicon, logos and preview.png).
#
#   deploy/download-page/build.sh 1.0.0
#       the package is hosted in the same folder as the page
#   deploy/download-page/build.sh 1.0.0 https://github.com/<owner>/<repo>/releases/download/v1.0.0/
#       the package is hosted elsewhere (here, as GitHub release assets)
#
# The page's download commands use that address, or the address the page is opened from.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:?Usage: deploy/download-page/build.sh <version> [download address]}"
DOWNLOAD_BASE="${2:-}"
case "$DOWNLOAD_BASE" in ""|*/) ;; *) DOWNLOAD_BASE="$DOWNLOAD_BASE/" ;; esac
case "$DOWNLOAD_BASE" in ""|https://*|http://*) ;; *) echo "The download address must start with https://" >&2; exit 1 ;; esac
PKG="$ROOT/release/nightshift-$VERSION.tar.gz"
[ -f "$PKG" ] && [ -f "$PKG.sha256" ] || { echo "No package for $VERSION in release/: run ./release.sh $VERSION first." >&2; exit 1; }

SHA="$(cut -d' ' -f1 "$PKG.sha256")"
BYTES="$(wc -c < "$PKG" | tr -d ' ')"
SIZE="$(awk -v b="$BYTES" 'BEGIN { if (b >= 1048576) printf "%d MB", b / 1048576; else printf "%d KB", (b + 1023) / 1024 }')"
DATE="$(date -r "$PKG" +%Y-%m-%d)"
# A kit without the image bundle downloads the images from a registry (small package)
PACKAGE=full
tar tzf "$PKG" | grep -q "^nightshift-$VERSION/REGISTRY$" && PACKAGE=small

sed -e "s|{{VERSION}}|$VERSION|g" -e "s|{{SHA256}}|$SHA|g" -e "s|{{SIZE}}|$SIZE|g" \
    -e "s|{{DATE}}|$DATE|g" -e "s|{{PACKAGE}}|$PACKAGE|g" -e "s|{{DOWNLOAD_BASE}}|$DOWNLOAD_BASE|g" \
    "$ROOT/deploy/download-page/index.html" > "$ROOT/release/index.html"
cp "$ROOT/deploy/download-page/nightshift-favicon.png" "$ROOT/release/favicon.png"
for f in bluesec-logo.svg nightshift-logo.png nightshift-logo-white.png nightshift-mark.png nightshift-mark-white.png; do cp "$ROOT/deploy/download-page/$f" "$ROOT/release/$f"; done
cp "$ROOT/.github/assets/dashboard.png" "$ROOT/release/preview.png"
if [ -n "$DOWNLOAD_BASE" ]; then
  echo "Download page: release/index.html ($PACKAGE package, $SIZE), downloads from $DOWNLOAD_BASE"
else
  echo "Download page: release/index.html ($PACKAGE package, $SIZE). Host it with nightshift-$VERSION.tar.gz and its .sha256."
fi
