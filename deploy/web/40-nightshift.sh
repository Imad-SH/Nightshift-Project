#!/bin/sh
# Runs at container start (nginx image entrypoint hook). Writes, from environment variables:
#   - the site configuration (TLS, reverse proxy to the backend and Keycloak);
#   - /config.json, the frontend's runtime configuration.
#
# NIGHTSHIFT_PUBLIC_URL      https://soc.example.local   address users open (required)
# TLS_ENABLED                true | false   false when a reverse proxy in front terminates TLS
# KEYCLOAK_ADMIN_CONSOLE     disabled | enabled   expose Keycloak's admin console at /auth/admin
# KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID   defaults: nightshift, bluesec-frontend
set -eu

PUBLIC_URL="${NIGHTSHIFT_PUBLIC_URL:?NIGHTSHIFT_PUBLIC_URL must be set, e.g. https://soc.example.local}"
PUBLIC_URL="${PUBLIC_URL%/}"
TLS_ENABLED="${TLS_ENABLED:-true}"
REALM="${KEYCLOAK_REALM:-nightshift}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-bluesec-frontend}"
CONF=/etc/nginx/conf.d/nightshift.conf

cat > /usr/share/nginx/html/config.json <<JSON
{"apiBaseUrl": "", "authUrl": "/auth", "realm": "${REALM}", "clientId": "${CLIENT_ID}"}
JSON

headers() {
  cat <<'NGX'
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
NGX
  if [ "$TLS_ENABLED" = "true" ]; then
    echo '    add_header Strict-Transport-Security "max-age=31536000" always;'
  fi
}

app_locations() {
  cat <<NGX
    root /usr/share/nginx/html;
    client_max_body_size 25m;
$(headers)

    location = /healthz { access_log off; default_type text/plain; return 200 "ok\n"; }

    # Frontend: index.html and config.json are never cached, built assets are
    location = /config.json { add_header Cache-Control "no-store" always; $(headers | tr '\n' ' ') }
    location /assets/ { expires 7d; $(headers | tr '\n' ' ') }
    location / {
        try_files \$uri /index.html;
        add_header Cache-Control "no-cache" always;
$(headers)
    }

    # Alert intake from SIEMs: rate-limited per sender
    location ~ ^/api/(ingest/|webhook/wazuh) {
        limit_req zone=nightshift_ingest burst=2000 nodelay;
        limit_req_status 429;
        proxy_pass http://backend:8000;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$forwarded_proto;
    }

    # API and live updates
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$forwarded_proto;
        proxy_read_timeout 300s;
    }
    location /socket.io/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$forwarded_proto;
        proxy_read_timeout 1h;
    }

    # Identity (Keycloak)
NGX
  if [ "${KEYCLOAK_ADMIN_CONSOLE:-disabled}" != "enabled" ]; then
    cat <<'NGX'
    location /auth/admin/ { return 403; }
    location /auth/realms/master/ { return 403; }
NGX
  fi
  cat <<NGX
    # \$http_host keeps the port: Keycloak builds its token endpoint URL from it
    location /auth/ {
        proxy_pass http://keycloak:8080;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$forwarded_proto;
        proxy_set_header X-Forwarded-Host \$http_host;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
NGX
}

{
  cat <<'NGX'
server_tokens off;
gzip on;
gzip_types text/plain text/css application/json application/javascript image/svg+xml;
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
limit_req_zone $binary_remote_addr zone=nightshift_ingest:10m rate=200r/s;
NGX
  if [ "$TLS_ENABLED" = "true" ]; then
    cat <<NGX
map \$scheme \$forwarded_proto { default https; }

server {
    listen 8443 ssl;
    http2 on;
    server_name _;
    ssl_certificate     /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
$(app_locations)
}

server {
    listen 8080;
    server_name _;
    location = /healthz { access_log off; default_type text/plain; return 200 "ok\n"; }
    location / { return 301 ${PUBLIC_URL}\$request_uri; }
}
NGX
  else
    cat <<NGX
# TLS is terminated by a reverse proxy in front of this container
map \$http_x_forwarded_proto \$forwarded_proto { default \$http_x_forwarded_proto; '' \$scheme; }

server {
    listen 8080;
    server_name _;
$(app_locations)
}
NGX
  fi
} > "$CONF"

echo "nightshift: site configured for ${PUBLIC_URL} (TLS ${TLS_ENABLED}, Keycloak admin console ${KEYCLOAK_ADMIN_CONSOLE:-disabled})"
