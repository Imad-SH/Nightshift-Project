import requests
import sys
import os
from dotenv import load_dotenv

load_dotenv()
KC_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://keycloak:8080")
REALM = "AI-Driven SOC"
CLIENT = "bluesec-frontend"

# 1. Get Access Token
token_req = requests.post(
    f"{KC_URL}/realms/master/protocol/openid-connect/token",
    data={
        "client_id": "admin-cli",
        "username": "admin",
        "password": "admin",
        "grant_type": "password"
    }
)

if token_req.status_code != 200:
    print(f"Failed to get admin token: {token_req.text}")
    sys.exit(1)

token = token_req.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 2. Find Client UUID
clients_req = requests.get(f"{KC_URL}/admin/realms/{REALM}/clients?clientId={CLIENT}", headers=headers)
if clients_req.status_code != 200 or len(clients_req.json()) == 0:
    print("Found no client named bluesec-frontend")
    sys.exit(1)

client_data = clients_req.json()[0]
client_uuid = client_data["id"]

# 3. Update Client with wildcards, while preserving existing ones just in case
redirect_uris = client_data.get("redirectUris", [])
if "http://*:5173/*" not in redirect_uris:
    redirect_uris.append("http://*:5173/*")

# Also add some typical local subnets just in case Keycloak complains about broad wildcards
for prefix in ["192.168", "10", "172.16", "172.17", "172.18", "172.19", "172.20", "172.21", "172.22", "172.23", "172.24", "172.25", "172.26", "172.27", "172.28", "172.29", "172.30", "172.31"]:
    uri = f"http://{prefix}.*:5173/*"
    if uri not in redirect_uris:
        redirect_uris.append(uri)

web_origins = client_data.get("webOrigins", [])
if "*" not in web_origins:
    web_origins.append("*")
if "+" not in web_origins: # Keycloak shorthand for permitted redirect uris
    web_origins.append("+")

client_data["redirectUris"] = redirect_uris
client_data["webOrigins"] = web_origins

# 4. PUT Update
update_req = requests.put(f"{KC_URL}/admin/realms/{REALM}/clients/{client_uuid}", json=client_data, headers=headers)
if update_req.status_code == 204:
    print("Successfully updated Keycloak redirect URIs and Web Origins!")
else:
    print(f"Failed to update client: {update_req.text}")

