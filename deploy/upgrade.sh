#!/usr/bin/env bash
# Upgrade an installation to the version in this kit. Run it from the NEW, extracted kit:
#
#   sudo ./upgrade.sh [--dir /opt/nightshift] [--no-backup]
#
# Steps: back up, load the new images, install the new files (nightshift.env and the
# certificate are kept), restart on the new version, wait until healthy.
# If the new version does not come up healthy, the previous version and the
# pre-upgrade backup are restored automatically.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$KIT_DIR/lib.sh"

INSTALL_DIR="$INSTALL_DIR_DEFAULT"
BACKUP=true
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --no-backup) BACKUP=false; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

require_docker
[ -f "$INSTALL_DIR/$ENV_FILE" ] || die "No installation found in $INSTALL_DIR (use --dir)."
NEW_VERSION="$(tr -d '[:space:]' < "$KIT_DIR/VERSION")"
OLD_VERSION="$(env_get NIGHTSHIFT_VERSION)"
printf '%sBlueSec Nightshift upgrade: %s -> %s%s\n' "$C_B" "$OLD_VERSION" "$NEW_VERSION" "$C_0"
[ "$NEW_VERSION" != "$OLD_VERSION" ] || { ok "Already on $NEW_VERSION, nothing to do."; exit 0; }

step "1/4  Backup"
ARCHIVE=""
if [ "$BACKUP" = true ]; then
  ARCHIVE="$("$INSTALL_DIR/backup.sh" | tail -n1)"
  [ -f "$ARCHIVE" ] || die "The backup failed; nothing was changed."
  ok "Backup: $ARCHIVE"
else
  warn "Skipping the backup (--no-backup): an automatic rollback can only restore the previous images."
fi

step "2/4  New images"
if images_present "$NEW_VERSION"; then
  ok "Images for $NEW_VERSION already loaded"
elif load_images "$KIT_DIR"; then :; else
  info "No image bundle in the kit: pulling from the registry."
fi

step "3/4  Installing the new version"
ROLLBACK="$INSTALL_DIR/.rollback-$OLD_VERSION"
rm -rf "$ROLLBACK"; mkdir -p "$ROLLBACK"
for item in VERSION docker-compose.yml lib.sh install.sh upgrade.sh backup.sh restore.sh uninstall.sh \
            nightshift.env.example postgres wazuh-connector docs; do
  [ -e "$INSTALL_DIR/$item" ] && cp -R "$INSTALL_DIR/$item" "$ROLLBACK/"
  if [ -e "$KIT_DIR/$item" ]; then rm -rf "${INSTALL_DIR:?}/$item"; cp -R "$KIT_DIR/$item" "$INSTALL_DIR/"; fi
done
chmod +x "$INSTALL_DIR"/*.sh "$INSTALL_DIR"/postgres/init/*.sh
env_set NIGHTSHIFT_VERSION "$NEW_VERSION"
[ -n "$(env_get NIGHTSHIFT_REGISTRY)" ] && dc pull --quiet

step "4/4  Starting $NEW_VERSION (database migrations run automatically)"
# compose up itself fails when a service never gets healthy: treat it like a failed health wait
if dc up -d --remove-orphans && wait_all_healthy 900; then
  rm -rf "$ROLLBACK"
  printf '\n%sUpgraded to %s.%s Images of %s can be removed with: docker image prune\n' "$C_OK$C_B" "$NEW_VERSION" "$C_0" "$OLD_VERSION"
  exit 0
fi

# ---- rollback -------------------------------------------------------------------------
warn "$NEW_VERSION did not start correctly: rolling back to $OLD_VERSION."
for item in "$ROLLBACK"/*; do
  name="$(basename "$item")"; rm -rf "${INSTALL_DIR:?}/$name"; cp -R "$item" "$INSTALL_DIR/"
done
env_set NIGHTSHIFT_VERSION "$OLD_VERSION"
if [ -n "$ARCHIVE" ]; then
  # The new version may already have migrated the database: restore the pre-upgrade backup
  "$INSTALL_DIR/restore.sh" "$ARCHIVE" --yes || die "Rollback restore failed. Backup: $ARCHIVE"
else
  dc up -d --remove-orphans || true
  wait_all_healthy 900 || die "Rollback did not come up healthy. Check: docker compose logs"
fi
rm -rf "$ROLLBACK"
die "Upgrade failed and $OLD_VERSION was restored. Please send the logs above to BlueSec support."
