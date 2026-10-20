#!/usr/bin/env bash
# Build a BlueSec Nightshift release kit (run on the vendor side, from the repository).
#
#   ./release.sh 1.0.0                  images + kit with the offline image bundle
#   ./release.sh 1.0.0 --push registry.example.com/bluesec/   also push the images
#   ./release.sh 1.0.0 --no-bundle --push registry.example.com/bluesec/
#                                       small kit that downloads the images from that registry
#   ./release.sh 1.0.0 --allow-dirty    build from uncommitted changes (testing only)
#
# Output in release/: nightshift-<version>.tar.gz and its .sha256
# (plus a detached .asc signature when NIGHTSHIFT_GPG_KEY names a GPG key).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

VERSION="${1:-}"; shift || true
BUNDLE=true; PUSH=""; ALLOW_DIRTY=false
while [ $# -gt 0 ]; do
  case "$1" in
    --no-bundle) BUNDLE=false; shift ;;
    --push) PUSH="${2:-}"; shift 2 ;;
    --allow-dirty) ALLOW_DIRTY=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.]+)?$ ]] || { echo "Usage: ./release.sh <version, e.g. 1.0.0> [options]" >&2; exit 1; }
case "$PUSH" in ""|*/) ;; *) PUSH="$PUSH/" ;; esac
if [ "$BUNDLE" = false ] && [ -z "$PUSH" ]; then
  echo "Note: --no-bundle without --push: clients will have to name a registry with install.sh --registry." >&2
fi

if [ -n "$(git status --porcelain)" ] && [ "$ALLOW_DIRTY" != true ]; then
  echo "The working tree has uncommitted changes. Commit them, or use --allow-dirty for a test build." >&2
  exit 1
fi
REVISION="$(git rev-parse --short HEAD)"
THIRD_PARTY="$(. deploy/lib.sh && echo "$THIRD_PARTY_IMAGES")"
LABELS=(--label "org.opencontainers.image.version=$VERSION" --label "org.opencontainers.image.revision=$REVISION"
        --label "org.opencontainers.image.vendor=BlueSec")

echo "== Building images for $VERSION ($REVISION)"
docker build "${LABELS[@]}" -t "nightshift-backend:$VERSION" backend/
docker build "${LABELS[@]}" -t "nightshift-web:$VERSION" .
docker build "${LABELS[@]}" --build-context theme=backend/keycloak-theme -t "nightshift-keycloak:$VERSION" deploy/keycloak
for image in $THIRD_PARTY; do docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"; done

if [ -n "$PUSH" ]; then
  echo "== Pushing to $PUSH"
  for name in backend web keycloak; do
    docker tag "nightshift-$name:$VERSION" "${PUSH}nightshift-$name:$VERSION"
    docker push "${PUSH}nightshift-$name:$VERSION"
  done
  # The third-party images too: clients then need access to one registry only, and get
  # exactly the images this release was tested with
  for image in $THIRD_PARTY; do
    docker tag "$image" "$PUSH$image"
    docker push "$PUSH$image"
  done
fi

echo "== Assembling the kit"
KIT="release/nightshift-$VERSION"
rm -rf "$KIT"; mkdir -p "$KIT/wazuh-connector" "$KIT/images"
cp deploy/docker-compose.yml deploy/nightshift.env.example deploy/lib.sh deploy/install.sh deploy/upgrade.sh \
   deploy/backup.sh deploy/restore.sh deploy/uninstall.sh "$KIT/"
cp -R deploy/postgres "$KIT/"
cp deploy/wazuh-connector/README.md backend/app/connectors/siem/wazuh_kit/custom-nightshift \
   backend/app/connectors/siem/wazuh_kit/custom-nightshift.py "$KIT/wazuh-connector/"
[ -d docs ] && cp -R docs "$KIT/"
echo "$VERSION" > "$KIT/VERSION"

if [ "$BUNDLE" = true ]; then
  echo "== Saving the offline image bundle (several minutes)"
  # shellcheck disable=SC2086
  docker save "nightshift-backend:$VERSION" "nightshift-web:$VERSION" "nightshift-keycloak:$VERSION" $THIRD_PARTY \
    | gzip > "$KIT/images/nightshift-images-$VERSION.tar.gz"
else
  rmdir "$KIT/images"
  # Where install.sh and upgrade.sh download the images from
  [ -z "$PUSH" ] || echo "$PUSH" > "$KIT/REGISTRY"
fi

echo "== Packaging"
# Docker on Windows (Git Bash) needs a Windows path for bind mounts
MOUNT_ROOT="$ROOT"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) MOUNT_ROOT="$(cygpath -w "$ROOT")"; export MSYS_NO_PATHCONV=1 ;; esac
# Pack inside a Linux container so file modes (executable scripts) are right whatever the build OS
docker run --rm --user 0 --entrypoint sh -v "$MOUNT_ROOT/release:/release" "nightshift-backend:$VERSION" -c "
  set -e
  # Work on the container's own filesystem: permissions set on a Windows bind mount do not stick
  mkdir -p /tmp/pack && cp -R /release/nightshift-$VERSION /tmp/pack/
  cd /tmp/pack
  find nightshift-$VERSION -type d -exec chmod 755 {} +
  find nightshift-$VERSION -type f -exec chmod 644 {} +
  chmod 755 nightshift-$VERSION/*.sh nightshift-$VERSION/postgres/init/*.sh nightshift-$VERSION/wazuh-connector/custom-nightshift*
  tar --owner=0 --group=0 --numeric-owner -czf /release/nightshift-$VERSION.tar.gz nightshift-$VERSION
  cd /release
  sha256sum nightshift-$VERSION.tar.gz > nightshift-$VERSION.tar.gz.sha256
  chown $(id -u):$(id -g) nightshift-$VERSION.tar.gz nightshift-$VERSION.tar.gz.sha256 2>/dev/null || true
"
rm -rf "$KIT"
if [ -n "${NIGHTSHIFT_GPG_KEY:-}" ]; then
  gpg --local-user "$NIGHTSHIFT_GPG_KEY" --armor --detach-sign "release/nightshift-$VERSION.tar.gz"
fi

echo
echo "Release ready:"
ls -l release/nightshift-"$VERSION".tar.gz*
cat "release/nightshift-$VERSION.tar.gz.sha256"
