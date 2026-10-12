@echo off
echo Restoring Keycloak configuration...
docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin
docker exec keycloak /opt/keycloak/bin/kcadm.sh create realms -s realm=BlueSec-SOC -s enabled=true
docker exec keycloak /opt/keycloak/bin/kcadm.sh create clients -r BlueSec-SOC -s clientId=bluesec-frontend -s enabled=true -s publicClient=true -s "redirectUris=[\"http://localhost:5173/*\"]" -s "webOrigins=[\"+\"]"

docker exec keycloak /opt/keycloak/bin/kcadm.sh create roles -r BlueSec-SOC -s name=soc_admin
docker exec keycloak /opt/keycloak/bin/kcadm.sh create roles -r BlueSec-SOC -s name="SOC Manager"
docker exec keycloak /opt/keycloak/bin/kcadm.sh create roles -r BlueSec-SOC -s name="L1 SOC Analyst"
docker exec keycloak /opt/keycloak/bin/kcadm.sh create roles -r BlueSec-SOC -s name="L2 SOC Analyst"
docker exec keycloak /opt/keycloak/bin/kcadm.sh create roles -r BlueSec-SOC -s name="L3 SOC Analyst"

echo Deleting old users...
docker exec keycloak /opt/keycloak/bin/kcadm.sh delete users/admin -r BlueSec-SOC
docker exec keycloak /opt/keycloak/bin/kcadm.sh delete users/analyst -r BlueSec-SOC

echo Creating users with full profiles...
docker exec keycloak /opt/keycloak/bin/kcadm.sh create users -r BlueSec-SOC -s username=admin -s enabled=true -s firstName=Admin -s lastName=User -s email=admin@bluesec.com -s emailVerified=true
docker exec keycloak /opt/keycloak/bin/kcadm.sh set-password -r BlueSec-SOC --username admin --new-password admin
docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles -r BlueSec-SOC --uusername admin --rolename soc_admin
docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles -r BlueSec-SOC --uusername admin --rolename "SOC Manager"

docker exec keycloak /opt/keycloak/bin/kcadm.sh create users -r BlueSec-SOC -s username=analyst -s enabled=true -s firstName=SOC -s lastName=Analyst -s email=analyst@bluesec.com -s emailVerified=true
docker exec keycloak /opt/keycloak/bin/kcadm.sh set-password -r BlueSec-SOC --username analyst --new-password analyst
docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles -r BlueSec-SOC --uusername analyst --rolename "L1 SOC Analyst"

echo Disabling mandatory profile updates...
docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/BlueSec-SOC -s "verifyEmail=false" -s "registrationEmailAsUsername=false" -s "editUsernameAllowed=false"


echo Keycloak restored successfully.
