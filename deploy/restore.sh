#!/usr/bin/env bash
# Restore a backup made by backup.sh. Replaces the current databases.
#
#   sudo ./restore.sh <backup.tar.gz> [--with-config] [--yes]
#
#   --with-config   also restore nightshift.env and the certificate (rebuilding a server).
#                   Without it, API keys saved in the UI only decrypt if this installation
#                   uses the same NIGHTSHIFT_SECRET_KEY as the backup.
#   --yes           do not ask for confirmation
set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$INSTALL_DIR/lib.sh"

ARCHIVE=""; WITH_CONFIG=false; YES=false
while [ $# -gt 0 ]; do
  case "$1" in
    --with-config) WITH_CONFIG=true; shift ;;
    --yes) YES=true; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *) ARCHIVE="$1"; shift ;;
  esac
done
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || die "Usage: ./restore.sh <backup.tar.gz> [--with-config] [--yes]"
require_docker

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar xzf "$ARCHIVE" -C "$WORK"
[ -f "$WORK/nightshift.dump" ] && [ -f "$WORK/keycloak.dump" ] || die "$ARCHIVE is not a Nightshift backup."
BACKUP_VERSION="$(tr -d '[:space:]' < "$WORK/VERSION" 2>/dev/null || echo unknown)"

if [ "$YES" != true ]; then
  [ -t 0 ] || die "Run with --yes when not interactive."
  warn "This replaces all current alerts, settings and accounts with the backup (version $BACKUP_VERSION)."
  read -r -p "Type 'restore' to continue: " answer
  [ "$answer" = restore ] || die "Cancelled."
fi

if [ "$WITH_CONFIG" = true ]; then
  umask 077
  cp "$WORK/$ENV_FILE" "$INSTALL_DIR/$ENV_FILE"
  [ -f "$WORK/certs.tar" ] && tar xf "$WORK/certs.tar" -C "$INSTALL_DIR"
  ok "Configuration and certificate restored"
fi
[ -f "$INSTALL_DIR/$ENV_FILE" ] || die "No $ENV_FILE: restore with --with-config, or run install.sh first."

step "Restoring databases"
dc stop web backend keycloak >/dev/null 2>&1 || true
dc up -d postgres >/dev/null
wait_healthy postgres 300 || die "The database did not start."
psql_admin() { dc exec -T postgres psql -v ON_ERROR_STOP=1 -q -U nightshift -d postgres "$@"; }
# Role passwords follow the (possibly restored) configuration file
psql_admin -v pw="$(env_get POSTGRES_PASSWORD)" -v kcpw="$(env_get KEYCLOAK_DB_PASSWORD)" >/dev/null <<'SQL'
ALTER USER nightshift WITH PASSWORD :'pw';
SELECT 'CREATE USER keycloak' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') \gexec
ALTER USER keycloak WITH PASSWORD :'kcpw';
SQL
for pair in nightshift:nightshift keycloak:keycloak; do
  db="${pair%%:*}"; owner="${pair##*:}"
  psql_admin -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db OWNER $owner" >/dev/null
  dc exec -T postgres pg_restore -U nightshift -d "$db" --no-owner --role="$owner" < "$WORK/$db.dump" \
    || die "Restoring the $db database failed."
  ok "Database $db restored"
done
if [ -s "$WORK/downloads.tar.gz" ]; then
  dc run --rm --no-deps -T --entrypoint tar backend xzf - -C /app/downloads < "$WORK/downloads.tar.gz" >/dev/null 2>&1 \
    && ok "Reports restored" || warn "Generated reports could not be restored."
fi

step "Starting"
dc up -d >/dev/null || true
wait_all_healthy 900 || die "Nightshift did not start after the restore (see the logs above)."
ok "Restore complete (backup version $BACKUP_VERSION)"
