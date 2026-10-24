#!/usr/bin/env bash
# Stop and remove Nightshift.
#
#   sudo ./uninstall.sh            remove the containers; data and configuration are kept
#   sudo ./uninstall.sh --purge    also delete all data, the configuration and the certificate
#
# Take a backup first (./backup.sh) if you may need the data again.
set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$INSTALL_DIR/lib.sh"

PURGE=false
case "${1:-}" in
  --purge) PURGE=true ;;
  ""|--keep-data) ;;
  -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) die "Unknown option: $1" ;;
esac
require_docker

if [ "$PURGE" = true ]; then
  [ -t 0 ] || die "--purge must be run interactively."
  warn "This permanently deletes all alerts, settings, accounts, the configuration and the certificate."
  read -r -p "Type 'delete everything' to continue: " answer
  [ "$answer" = "delete everything" ] || die "Cancelled."
  dc down --volumes --remove-orphans
  rm -f "$INSTALL_DIR/$ENV_FILE"
  rm -rf "$INSTALL_DIR/certs"
  ok "Nightshift and its data were removed. Backups in $INSTALL_DIR/backups were kept."
else
  dc down --remove-orphans
  ok "Containers removed. Data and configuration are kept: run install.sh again to restart."
fi
