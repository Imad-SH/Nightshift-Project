"""
Keycloak Realm Setup Script
Creates the 'AI-Driven SOC' realm, client, roles, and users via the Admin REST API.
"""
import requests
import json
import sys

# Auto-detect internal Docker hostname or localhost
import socket
try:
    socket.gethostbyname('keycloak')
    KC_URL = "http://keycloak:8080"
except socket.gaierror:
    KC_URL = "http://localhost:8080"

REALM = "AI-Driven SOC"

def get_admin_token():
    r = requests.post(f"{KC_URL}/realms/master/protocol/openid-connect/token", data={
        "grant_type": "password",
        "client_id": "admin-cli",
        "username": "admin",
        "password": "admin"
    })
    r.raise_for_status()
    return r.json()["access_token"]

def main():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # 1. Check if realm already exists
    r = requests.get(f"{KC_URL}/admin/realms/{REALM}", headers=headers)
    if r.status_code == 200:
        print(f"✅ Realm '{REALM}' already exists, skipping creation.")
    else:
        print(f"📦 Creating realm '{REALM}'...")
        r = requests.post(f"{KC_URL}/admin/realms", headers=headers, json={
            "realm": REALM,
            "enabled": True,
            "loginTheme": "bluesec"
        })
        if r.status_code == 201:
            print(f"✅ Realm '{REALM}' created.")
        else:
            print(f"❌ Failed to create realm: {r.status_code} {r.text}")
            sys.exit(1)

    # 2. Create client 'bluesec-frontend'
    print("📦 Creating client 'bluesec-frontend'...")
    r = requests.post(f"{KC_URL}/admin/realms/{REALM}/clients", headers=headers, json={
        "clientId": "bluesec-frontend",
        "enabled": True,
        "publicClient": True,
        "directAccessGrantsEnabled": True,
        "standardFlowEnabled": True,
        "redirectUris": ["http://localhost:5173/*", "http://localhost:8081/*"],
        "webOrigins": ["+", "*"],
        "protocol": "openid-connect",
        "attributes": {
            "post.logout.redirect.uris": "http://localhost:5173/*"
        }
    })
    if r.status_code == 201:
        print("✅ Client 'bluesec-frontend' created.")
    elif r.status_code == 409:
        print("✅ Client 'bluesec-frontend' already exists.")
    else:
        print(f"⚠️  Client creation: {r.status_code} {r.text}")

    # 3. Create roles
    roles = ["soc_admin", "SOC Manager", "L1 SOC Analyst", "L2 SOC Analyst", "L3 SOC Analyst"]
    for role in roles:
        r = requests.post(f"{KC_URL}/admin/realms/{REALM}/roles", headers=headers, json={
            "name": role
        })
        if r.status_code == 201:
            print(f"  ✅ Role '{role}' created.")
        elif r.status_code == 409:
            print(f"  ✅ Role '{role}' already exists.")
        else:
            print(f"  ⚠️  Role '{role}': {r.status_code}")

    # 4. Create admin user
    print("📦 Creating user 'admin'...")
    r = requests.post(f"{KC_URL}/admin/realms/{REALM}/users", headers=headers, json={
        "username": "admin",
        "enabled": True,
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@bluesec.com",
        "emailVerified": True,
        "credentials": [{"type": "password", "value": "admin", "temporary": False}]
    })
    if r.status_code == 201:
        print("  ✅ User 'admin' created.")
        # Get user ID and assign roles
        r2 = requests.get(f"{KC_URL}/admin/realms/{REALM}/users?username=admin&exact=true", headers=headers)
        if r2.ok and r2.json():
            user_id = r2.json()[0]["id"]
            # Get role IDs
            for role_name in ["soc_admin", "SOC Manager"]:
                r3 = requests.get(f"{KC_URL}/admin/realms/{REALM}/roles/{role_name}", headers=headers)
                if r3.ok:
                    role_data = r3.json()
                    requests.post(f"{KC_URL}/admin/realms/{REALM}/users/{user_id}/role-mappings/realm",
                                  headers=headers, json=[role_data])
                    print(f"  ✅ Role '{role_name}' assigned to admin.")
    elif r.status_code == 409:
        print("  ✅ User 'admin' already exists.")
    else:
        print(f"  ⚠️  User 'admin': {r.status_code} {r.text}")

    # 5. Create analyst user
    print("📦 Creating user 'analyst'...")
    r = requests.post(f"{KC_URL}/admin/realms/{REALM}/users", headers=headers, json={
        "username": "analyst",
        "enabled": True,
        "firstName": "SOC",
        "lastName": "Analyst",
        "email": "analyst@bluesec.com",
        "emailVerified": True,
        "credentials": [{"type": "password", "value": "analyst", "temporary": False}]
    })
    if r.status_code == 201:
        print("  ✅ User 'analyst' created.")
        r2 = requests.get(f"{KC_URL}/admin/realms/{REALM}/users?username=analyst&exact=true", headers=headers)
        if r2.ok and r2.json():
            user_id = r2.json()[0]["id"]
            r3 = requests.get(f"{KC_URL}/admin/realms/{REALM}/roles/L1 SOC Analyst", headers=headers)
            if r3.ok:
                requests.post(f"{KC_URL}/admin/realms/{REALM}/users/{user_id}/role-mappings/realm",
                              headers=headers, json=[r3.json()])
                print("  ✅ Role 'L1 SOC Analyst' assigned to analyst.")
    elif r.status_code == 409:
        print("  ✅ User 'analyst' already exists.")
    else:
        print(f"  ⚠️  User 'analyst': {r.status_code} {r.text}")

    # 6. Disable forced profile update
    print("📦 Configuring realm settings...")
    requests.put(f"{KC_URL}/admin/realms/{REALM}", headers=headers, json={
        "verifyEmail": False,
        "registrationEmailAsUsername": False,
        "editUsernameAllowed": False,
        "loginTheme": "bluesec"
    })
    print("✅ Realm configured.")

    print("\n🎉 Keycloak setup complete! You can now access the dashboard.")

if __name__ == "__main__":
    main()
