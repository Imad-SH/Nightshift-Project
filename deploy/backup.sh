#!/usr/bin/env bash
# Back up Nightshift: both databases (alerts/settings and accounts), the
# configuration, the TLS certificate and generated reports, in one archive.
#
#   sudo ./backup.sh [--output DIR]      (default: backups/ in the installation directory)
#
# The archive contains secrets (nightshift.env): store it as carefully as the server.
# The last line printed is the archive path.
set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$INSTALL_DIR/lib.sh"

OUT="$INSTALL_DIR/backups"
while [ $# -gt 0 ]; do
  case "$1" in
    --output) OUT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

require_docker
[ -f "$INSTALL_DIR/$ENV_FILE" ] || die "No $ENV_FILE in $INSTALL_DIR: run backup.sh from the installation directory."
VERSION="$(env_get NIGHTSHIFT_VERSION)"
ARCHIVE="$OUT/nightshift-backup-${VERSION}-$(date +%Y%m%d-%H%M%S).tar.gz"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077
mkdir -p "$OUT"

step "Backing up Nightshift $VERSION"
for db in nightshift keycloak; do
  dc exec -T postgres pg_dump -U nightshift -d "$db" -Fc > "$WORK/$db.dump" \
    || die "Could not dump the $db database (is the stack running?)."
  ok "Database $db ($(du -h "$WORK/$db.dump" | cut -f1))"
done
cp "$INSTALL_DIR/$ENV_FILE" "$INSTALL_DIR/VERSION" "$WORK/"
[ -d "$INSTALL_DIR/certs" ] && tar cf "$WORK/certs.tar" -C "$INSTALL_DIR" certs
dc exec -T backend tar czf - -C /app/downloads . > "$WORK/downloads.tar.gz" 2>/dev/null \
  || warn "Generated reports were not included (backend not running)."
ok "Configuration, certificate and reports"

tar czf "$ARCHIVE" -C "$WORK" .
chmod 600 "$ARCHIVE"
ok "Backup written ($(du -h "$ARCHIVE" | cut -f1)). Keep it safe: it contains the configuration secrets."
echo "$ARCHIVE"
