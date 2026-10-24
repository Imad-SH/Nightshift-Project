# Shared helpers for the Nightshift operator scripts. Sourced, not run.
# shellcheck shell=bash

PROJECT=nightshift
INSTALL_DIR_DEFAULT=/opt/nightshift
ENV_FILE=nightshift.env

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_OK=; C_WARN=; C_ERR=; C_DIM=; C_B=; C_0=
fi

ok()   { printf '%s[✓]%s %s\n' "$C_OK" "$C_0" "$*"; }
info() { printf '%s[·]%s %s\n' "$C_DIM" "$C_0" "$*"; }
warn() { printf '%s[!]%s %s\n' "$C_WARN" "$C_0" "$*" >&2; }
die()  { printf '%s[✗]%s %s\n' "$C_ERR" "$C_0" "$*" >&2; exit 1; }
step() { printf '\n%s%s%s\n' "$C_B" "$*" "$C_0"; }

# docker compose for the installation in $INSTALL_DIR
dc() { docker compose --project-name "$PROJECT" --project-directory "$INSTALL_DIR" \
         -f "$INSTALL_DIR/docker-compose.yml" --env-file "$INSTALL_DIR/$ENV_FILE" "$@"; }

# Value of KEY in the installation's config file
env_get() { sed -n "s/^$1=//p" "$INSTALL_DIR/$ENV_FILE" | tail -n1; }

# Set KEY=VALUE in the config file (replacing an existing line)
env_set() {
  local key="$1" value="$2" file="$INSTALL_DIR/$ENV_FILE"
  if grep -q "^$key=" "$file"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$file" > "$tmp"
    cat "$tmp" > "$file"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

random_hex() { head -c "${1:-24}" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
fernet_key() { head -c 32 /dev/urandom | base64 | tr -d '\n' | tr '+/' '-_'; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Engine 24+ first: https://docs.docker.com/engine/install/"
  docker info >/dev/null 2>&1 || die "Cannot talk to Docker. Run as root (sudo) or as a member of the docker group."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (the 'docker compose' plugin)."
}

# Wait until a compose service reports healthy (or running, for services without a health check)
# "unhealthy" can be transient (a container restarting after a fix), so it only counts as
# a failure once it has lasted 3 minutes; a container that exited fails at once.
wait_healthy() {
  local service="$1" timeout="${2:-600}" waited=0 unhealthy_for=0 cid state
  while :; do
    cid="$(dc ps -q "$service" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
      # A container that keeps crashing is restarted by Docker instead of staying "exited"
      [ "$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)" -ge 3 ] && [ "$state" != healthy ] && return 1
      case "$state" in
        healthy|running) return 0 ;;
        exited|dead) return 1 ;;
        unhealthy) unhealthy_for=$((unhealthy_for + 5)); [ "$unhealthy_for" -ge 180 ] && return 1 ;;
        *) unhealthy_for=0 ;;
      esac
    fi
    [ "$waited" -ge "$timeout" ] && return 1
    sleep 5; waited=$((waited + 5))
  done
}

wait_all_healthy() {
  local s
  for s in postgres redis keycloak backend web; do
    if wait_healthy "$s" "${1:-600}"; then ok "$s is up"; else
      warn "$s did not become healthy. Recent logs:"; dc logs --tail 40 "$s" >&2 || true; return 1
    fi
  done
}

# Third-party images a release pins and ships alongside its own (keep in sync with
# docker-compose.yml)
THIRD_PARTY_IMAGES="postgres:15-alpine redis:7-alpine"

# Every image an installation of a version runs, under the registry prefix it was
# downloaded from (none for images loaded from the package)
image_refs() {
  local version="$1" registry="${2:-}" name
  for name in backend web keycloak; do printf '%snightshift-%s:%s\n' "$registry" "$name" "$version"; done
  for name in $THIRD_PARTY_IMAGES; do printf '%s%s\n' "$registry" "$name"; done
}

# Whether the images of a version are already in Docker
images_present() {
  local ref
  for ref in $(image_refs "$1" "${2:-}"); do
    docker image inspect "$ref" >/dev/null 2>&1 || return 1
  done
}

# Whether the kit contains the offline image bundle
has_bundle() { compgen -G "$1/images/*.tar*" >/dev/null; }

# The registry prefix to download images from: none for a kit with the image bundle
# (offline package), else the --registry option, the installation's current setting,
# or the registry recorded in the kit (REGISTRY file)
resolve_registry() {
  local kit="$1" option="$2" current="$3" registry=""
  if has_bundle "$kit"; then
    [ -z "$option" ] || warn "Ignoring --registry: this package contains the images."
  elif [ -n "$option" ]; then registry="$option"
  elif [ -n "$current" ]; then registry="$current"
  elif [ -s "$kit/REGISTRY" ]; then registry="$(tr -d '[:space:]' < "$kit/REGISTRY")"
  fi
  case "$registry" in ""|*/) ;; *) registry="$registry/" ;; esac
  [ -z "$registry" ] || [[ "$registry" =~ ^[A-Za-z0-9._:/-]+$ ]] || die "Invalid registry '$registry' (e.g. registry.example.com/bluesec/)."
  printf '%s' "$registry"
}

# Server part of a registry prefix such as ghcr.io/bluesec/ (empty for Docker Hub)
registry_host() {
  local first="${1%%/*}"
  case "$first" in *.*|*:*|localhost) printf '%s' "$first" ;; esac
}

# Read the registry password for a user name: asked when interactive, else the first line
# of standard input. Done first thing, before other steps can consume standard input.
read_registry_password() {
  REGISTRY_PASSWORD=""
  if [ -t 0 ]; then
    read -r -s -p "Registry password for $1: " REGISTRY_PASSWORD; echo
  else
    IFS= read -r REGISTRY_PASSWORD || true
  fi
  [ -n "$REGISTRY_PASSWORD" ] || die "No registry password given."
}

# Sign in to the registry with the password read by read_registry_password. Docker keeps
# the credentials (in root's ~/.docker/config.json), so later upgrades download without
# asking again.
registry_login() {
  local host out
  host="$(registry_host "$1")"
  out="$(printf '%s' "$REGISTRY_PASSWORD" | docker login ${host:+"$host"} --username "$2" --password-stdin 2>&1)" \
    || die "Signing in to ${host:-Docker Hub} as $2 failed: $(printf '%s' "$out" | tail -n1)"
  ok "Signed in to ${host:-Docker Hub} as $2"
}

# Download the images of a version from the registry
pull_images() {
  local ref out
  info "Downloading the images from ${2%/} (this can take a few minutes)..."
  for ref in $(image_refs "$1" "$2"); do
    out="$(docker pull --quiet "$ref" 2>&1)" || { warn "Could not download $ref: $(printf '%s' "$out" | tail -n1)"; return 1; }
  done
  ok "Images downloaded"
}

# Make the images of a version available: already there, loaded from the kit's bundle,
# or downloaded from the registry (after signing in when a user name is given)
get_images() {
  local kit="$1" version="$2" registry="$3" user="$4"
  if [ -n "$registry" ] && [ -n "$user" ]; then registry_login "$registry" "$user"; fi
  if images_present "$version" "$registry"; then
    ok "Images for $version already loaded"
  elif [ -z "$registry" ]; then
    load_images "$kit" || die "This package has no images (images/ folder) and no registry to download them from. Use the full package, or --registry (see docs/INSTALL.md)."
  elif [ -n "$user" ]; then
    pull_images "$version" "$registry" || die "Check that this server can reach ${registry%/} over HTTPS and that your account has access."
  else
    pull_images "$version" "$registry" || die "Check that this server can reach ${registry%/} over HTTPS. If it asks for a sign-in, add --registry-user NAME (the account BlueSec gave you)."
  fi
}

# Load the image bundle shipped with the kit (offline installs), if present
load_images() {
  local kit="$1" f found=0
  for f in "$kit"/images/*.tar "$kit"/images/*.tar.gz; do
    [ -e "$f" ] || continue
    found=1
    info "Loading images from $(basename "$f") (this can take a few minutes)..."
    if [ "${f%.gz}" != "$f" ]; then gunzip -c "$f" | docker load >/dev/null; else docker load -i "$f" >/dev/null; fi
  done
  if [ "$found" = 1 ]; then ok "Images loaded"; return 0; fi
  return 1
}
