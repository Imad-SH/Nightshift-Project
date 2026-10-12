#!/bin/bash
/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin
/opt/keycloak/bin/kcadm.sh create clients -r "AI-Driven SOC" -s clientId=bluesec-frontend -s enabled=true -s publicClient=true -s 'redirectUris=["http://localhost:5173/*"]' -s 'webOrigins=["+"]'
echo "Keycloak client creation script finished."
