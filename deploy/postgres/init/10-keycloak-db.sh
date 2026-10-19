#!/bin/sh
# Runs once, when the database volume is first initialized:
# a separate database and user for Keycloak.
set -eu
psql -v ON_ERROR_STOP=1 -v kc_password="${KEYCLOAK_DB_PASSWORD}" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE USER keycloak WITH PASSWORD :'kc_password';
CREATE DATABASE keycloak OWNER keycloak;
SQL
