# BlueSec Nightshift identity server: Keycloak with the BlueSec login theme and
# the Nightshift realm, served under /auth behind the web container.
# Build context: this folder; the theme comes from the "theme" build context:
#   docker build --build-context theme=../../backend/keycloak-theme -t nightshift-keycloak .
ARG KEYCLOAK_VERSION=26.5.5

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION} AS builder
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_HTTP_RELATIVE_PATH=/auth
COPY --from=theme bluesec /opt/keycloak/themes/bluesec
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Imported on first start only (an existing realm is left as is)
COPY nightshift-realm.json /opt/keycloak/data/import/nightshift-realm.json
ENV KC_HTTP_ENABLED=true \
    KC_PROXY_HEADERS=xforwarded \
    KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true
EXPOSE 8080 9000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
