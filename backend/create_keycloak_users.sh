#!/bin/bash
# Authenticate
/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin

# Create SOC Admin User
/opt/keycloak/bin/kcadm.sh create users -r "AI-Driven SOC" -s username=admin -s enabled=true
/opt/keycloak/bin/kcadm.sh set-password -r "AI-Driven SOC" --username admin --new-password admin
/opt/keycloak/bin/kcadm.sh add-roles -r "AI-Driven SOC" --uusername admin --rolename soc_admin

# Create SOC Analyst User
/opt/keycloak/bin/kcadm.sh create users -r "AI-Driven SOC" -s username=analyst -s enabled=true
/opt/keycloak/bin/kcadm.sh set-password -r "AI-Driven SOC" --username analyst --new-password analyst
/opt/keycloak/bin/kcadm.sh add-roles -r "AI-Driven SOC" --uusername analyst --rolename soc_analyst

echo "Users created successfully."
