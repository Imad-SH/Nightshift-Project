#!/usr/bin/env bash
# BlueSec Nightshift installer.
#
#   sudo ./install.sh --url https://soc.example.local
#
# Options:
#   --url URL            address analysts will open (asked if omitted)
#   --dir DIR            installation directory (default /opt/nightshift)
#   --admin-user NAME    first administrator account (default: admin)
#   --admin-email EMAIL  its email address
#   --no-tls             a reverse proxy in front terminates TLS
#
# Safe to run again: existing configuration, certificates, accounts and tokens are kept.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$KIT_DIR/lib.sh"

INSTALL_DIR="$INSTALL_DIR_DEFAULT"
PUBLIC_URL=""
ADMIN_USER="admin"
ADMIN_EMAIL=""
NO_TLS=false

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --url) PUBLIC_URL="${2:-}"; shift 2 ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --admin-user) ADMIN_USER="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --no-tls) NO_TLS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[[ "$ADMIN_USER" =~ ^[A-Za-z0-9._-]+$ ]] || die "Invalid --admin-user (letters, digits, . _ - only)."
[ -z "$ADMIN_EMAIL" ] || [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || die "Invalid --admin-email."

VERSION="$(tr -d '[:space:]' < "$KIT_DIR/VERSION" 2>/dev/null || true)"
[ -n "$VERSION" ] || die "VERSION file not found: run install.sh from an extracted release kit."
printf '%sBlueSec Nightshift %s installer%s\n' "$C_B" "$VERSION" "$C_0"

# ---------------------------------------------------------------------------------------
step "1/7  Checking this server"
require_docker
ok "Docker $(docker version -f '{{.Server.Version}}' 2>/dev/null), Compose $(docker compose version --short 2>/dev/null)"
mem_gb=$(( $(sed -n 's/^MemTotal:[[:space:]]*\([0-9]*\).*/\1/p' /proc/meminfo 2>/dev/null || echo 0) / 1024 / 1024 ))
cpus=$(nproc 2>/dev/null || echo 0)
mkdir -p "$INSTALL_DIR"
disk_gb=$(( $(df -Pk "$INSTALL_DIR" | awk 'NR==2 {print $4}') / 1024 / 1024 ))
[ "$mem_gb" -ge 7 ] && ok "Memory: ${mem_gb} GB" || warn "Memory: ${mem_gb} GB (8 GB or more recommended)"
[ "$cpus" -ge 4 ] && ok "CPUs: $cpus" || warn "CPUs: $cpus (4 or more recommended)"
[ "$disk_gb" -ge 20 ] && ok "Free disk: ${disk_gb} GB" || warn "Free disk: ${disk_gb} GB (20 GB or more recommended)"

# ---------------------------------------------------------------------------------------
step "2/7  Installing files in $INSTALL_DIR"
if [ "$KIT_DIR" != "$(cd "$INSTALL_DIR" && pwd)" ]; then
  for item in VERSION docker-compose.yml lib.sh install.sh upgrade.sh backup.sh restore.sh uninstall.sh \
              nightshift.env.example postgres wazuh-connector docs; do
    [ -e "$KIT_DIR/$item" ] && cp -R "$KIT_DIR/$item" "$INSTALL_DIR/"
  done
fi
chmod 700 "$INSTALL_DIR"
chmod +x "$INSTALL_DIR"/*.sh "$INSTALL_DIR"/postgres/init/*.sh
ok "Files installed"

# ---------------------------------------------------------------------------------------
step "3/7  Images"
if images_present "$VERSION"; then
  ok "Images for $VERSION already loaded"
elif load_images "$KIT_DIR"; then :; else
  info "No image bundle in the kit: images will be pulled from the registry set in nightshift.env."
fi

# ---------------------------------------------------------------------------------------
step "4/7  Configuration"
if [ ! -f "$INSTALL_DIR/$ENV_FILE" ]; then
  if [ -z "$PUBLIC_URL" ]; then
    [ -t 0 ] || die "--url is required when not running interactively."
    read -r -p "Address analysts will open (e.g. https://soc.example.local): " PUBLIC_URL
  fi
  PUBLIC_URL="${PUBLIC_URL%/}"
  [[ "$PUBLIC_URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] \
    || die "Invalid address '$PUBLIC_URL'. Use the form https://soc.example.local (optionally with :port, no path)."
  scheme="${PUBLIC_URL%%://*}"
  port="$(printf '%s' "$PUBLIC_URL" | sed -n 's#^https\{0,1\}://[^:/]*:\([0-9]*\)$#\1#p')"

  umask 077
  cp "$INSTALL_DIR/nightshift.env.example" "$INSTALL_DIR/$ENV_FILE"
  env_set NIGHTSHIFT_PUBLIC_URL "$PUBLIC_URL"
  env_set NIGHTSHIFT_VERSION "$VERSION"
  if [ "$NO_TLS" = true ]; then
    env_set TLS_ENABLED false
    # Behind a TLS-terminating proxy the public port is the proxy's; Nightshift listens on HTTP_PORT
  else
    [ "$scheme" = https ] || die "An http:// address needs --no-tls (TLS terminated by a proxy in front)."
    [ -n "$port" ] && env_set HTTPS_PORT "$port"
  fi
  env_set NIGHTSHIFT_SECRET_KEY "$(fernet_key)"
  env_set POSTGRES_PASSWORD "$(random_hex 24)"
  env_set KEYCLOAK_DB_PASSWORD "$(random_hex 24)"
  env_set REDIS_PASSWORD "$(random_hex 24)"
  env_set KEYCLOAK_ADMIN_PASSWORD "$(random_hex 24)"
  chmod 600 "$INSTALL_DIR/$ENV_FILE"
  umask 022
  ok "Created $INSTALL_DIR/$ENV_FILE with generated secrets"
else
  env_set NIGHTSHIFT_VERSION "$VERSION"
  ok "Keeping the existing $ENV_FILE"
fi
PUBLIC_URL="$(env_get NIGHTSHIFT_PUBLIC_URL)"
TLS_ENABLED="$(env_get TLS_ENABLED)"
REGISTRY="$(env_get NIGHTSHIFT_REGISTRY)"
HOST="$(printf '%s' "$PUBLIC_URL" | sed 's#^https\{0,1\}://##; s#:[0-9]*$##')"

# ---------------------------------------------------------------------------------------
step "5/7  TLS certificate"
mkdir -p "$INSTALL_DIR/certs"
if [ "$TLS_ENABLED" != true ]; then
  ok "TLS is terminated by your reverse proxy (TLS_ENABLED=false)"
elif [ -s "$INSTALL_DIR/certs/server.crt" ] && [ -s "$INSTALL_DIR/certs/server.key" ]; then
  ok "Using the certificate in $INSTALL_DIR/certs"
else
  info "No certificate provided: generating a self-signed one for $HOST"
  docker run --rm -i --user 0 --entrypoint python -v "$INSTALL_DIR/certs:/certs" \
    "${REGISTRY}nightshift-backend:${VERSION}" - "$HOST" <<'PY'
import datetime, ipaddress, sys
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

host = sys.argv[1]
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, host)])
try:
    san = [x509.IPAddress(ipaddress.ip_address(host))]
except ValueError:
    san = [x509.DNSName(host)]
now = datetime.datetime.now(datetime.timezone.utc)
cert = (x509.CertificateBuilder()
        .subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        # its own CA, so SIEMs can trust it directly (e.g. custom-nightshift.ca on Wazuh)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256()))
with open("/certs/server.key", "wb") as f:
    f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                              serialization.NoEncryption()))
with open("/certs/server.crt", "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))
PY
  [ -s "$INSTALL_DIR/certs/server.crt" ] && [ -s "$INSTALL_DIR/certs/server.key" ] \
    || die "Generating the self-signed certificate failed."
  touch "$INSTALL_DIR/certs/.self-signed"
  ok "Self-signed certificate created (valid 825 days). Replace certs/server.crt and server.key with your own anytime."
fi
SELF_SIGNED=false
[ "$TLS_ENABLED" = true ] && [ -f "$INSTALL_DIR/certs/.self-signed" ] && SELF_SIGNED=true
if [ "$TLS_ENABLED" = true ]; then
  # The web container runs nginx as uid 101: it must be able to enter the folder and read both files
  chmod 755 "$INSTALL_DIR/certs"
  chown 101:101 "$INSTALL_DIR/certs/server.key" 2>/dev/null || true
  chmod 600 "$INSTALL_DIR/certs/server.key"
  chmod 644 "$INSTALL_DIR/certs/server.crt"
fi

# ---------------------------------------------------------------------------------------
step "6/7  Starting Nightshift (first start takes a few minutes)"
if [ -z "$(dc ps -q web 2>/dev/null)" ]; then
  for p in "$(env_get HTTPS_PORT)" "$(env_get HTTP_PORT)"; do
    if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$p )" | grep -q LISTEN; then
      die "Port $p is already in use on this server. Free it or change HTTPS_PORT/HTTP_PORT in $ENV_FILE."
    fi
  done
fi
[ -n "$REGISTRY" ] && dc pull --quiet
dc up -d || true
wait_all_healthy 900 || die "Nightshift did not start correctly (see the logs above)."

# ---------------------------------------------------------------------------------------
step "7/7  First administrator and alert intake"
KC_ADMIN="$(env_get KEYCLOAK_ADMIN_USER)"
KC_PASSWORD="$(env_get KEYCLOAK_ADMIN_PASSWORD)"
kcadm() {
  dc exec -T -e KC_ADMIN="$KC_ADMIN" -e KC_PASSWORD="$KC_PASSWORD" keycloak bash -c '
    K=/opt/keycloak/bin/kcadm.sh
    $K config credentials --server http://localhost:8080/auth --realm master --user "$KC_ADMIN" --password "$KC_PASSWORD" >/dev/null 2>&1 || exit 3
    '"$1"
}
ADMIN_PASSWORD=""
existing="$(kcadm "\$K get users -r nightshift -q exact=true -q username=$ADMIN_USER --fields id")" \
  || die "Could not sign in to Keycloak's admin API (check KEYCLOAK_ADMIN_USER/PASSWORD in $ENV_FILE)."
existing="$(printf '%s' "$existing" | tr -d '[:space:]')"
if [ "$existing" = "[]" ] || [ -z "$existing" ]; then
  ADMIN_PASSWORD="$(random_hex 10)"
  email="${ADMIN_EMAIL:-$ADMIN_USER@$HOST}"
  kcadm "\$K create users -r nightshift -s username=$ADMIN_USER -s enabled=true -s firstName=SOC -s lastName=Administrator -s email=$email -s emailVerified=true >/dev/null 2>&1
         \$K set-password -r nightshift --username $ADMIN_USER --new-password $ADMIN_PASSWORD --temporary
         \$K add-roles -r nightshift --uusername $ADMIN_USER --rolename soc_admin" \
    || die "Could not create the administrator account in Keycloak."
  ok "Administrator '$ADMIN_USER' created"
else
  ok "Administrator '$ADMIN_USER' already exists (kept)"
fi

WAZUH_TOKEN="$(dc exec -T backend python -m app.cli ingest-token wazuh --if-missing 2>/dev/null | tail -n1 | tr -d '[:space:]')"
[ -n "$WAZUH_TOKEN" ] || die "Could not create the Wazuh ingest token."
if [ "$WAZUH_TOKEN" != exists ]; then
  # The backend reads tokens at startup
  dc restart backend >/dev/null
  wait_healthy backend 300 || die "The backend did not restart correctly."
  dc restart web >/dev/null
  wait_healthy web 120 || die "The web container did not restart correctly."
  ok "Wazuh ingest token created"
else
  ok "Wazuh ingest token already set (kept)"
fi

# ---------------------------------------------------------------------------------------
printf '\n%sBlueSec Nightshift %s is running%s\n\n' "$C_OK$C_B" "$VERSION" "$C_0"
printf '  Open:             %s\n' "$PUBLIC_URL"
if [ -n "$ADMIN_PASSWORD" ]; then
  printf '  First login:      %s / %s   (you will choose a new password)\n' "$ADMIN_USER" "$ADMIN_PASSWORD"
fi
printf '  Wazuh intake URL: %s/api/ingest/wazuh\n' "$PUBLIC_URL"
if [ "$WAZUH_TOKEN" != exists ]; then
  printf '  Wazuh token:      %s\n' "$WAZUH_TOKEN"
fi
printf '\n  Shown once: note the password and token now. A new token can be generated later\n'
printf '  under Integrations > Wazuh.\n\n'
printf 'Next steps\n'
printf '  1. Connect Wazuh: %s/wazuh-connector/README.md (or Integrations > Wazuh in the UI).\n' "$INSTALL_DIR"
if [ "$SELF_SIGNED" = true ]; then
  printf '  2. The certificate is self-signed: copy %s/certs/server.crt to the Wazuh manager as\n' "$INSTALL_DIR"
  printf '     /var/ossec/integrations/custom-nightshift.ca, and trust it in browsers or replace it.\n'
fi
printf '  %s. Add LLM and threat-intelligence API keys under LLM Settings and CTI Configuration.\n' "$([ "$SELF_SIGNED" = true ] && echo 3 || echo 2)"
printf '  %s. Schedule backups: %s/backup.sh (keep them safe: they contain the configuration).\n\n' \
  "$([ "$SELF_SIGNED" = true ] && echo 4 || echo 3)" "$INSTALL_DIR"
