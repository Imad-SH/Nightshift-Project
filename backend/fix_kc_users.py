import asyncio
import os
from dotenv import load_dotenv
from app.services.keycloak_service import keycloak_service

load_dotenv()

async def fix_users():
    try:
        await keycloak_service.get_admin_token()
        
        # 1. Disable Required Actions for the Realm
        realm_url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}"
        realm_resp = await keycloak_service._make_request("GET", realm_url)
        if realm_resp.status_code == 200:
            realm_cfg = realm_resp.json()
            realm_cfg["verifyEmail"] = False
            await keycloak_service._make_request("PUT", realm_url, json=realm_cfg)
            print("Realm level verifyEmail disabled.")

        # 2. Delete and recreate users with full profiles
        for username in ["admin", "analyst"]:
            # Find user
            search_url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/users?username={username}"
            search_resp = await keycloak_service._make_request("GET", search_url)
            users = search_resp.json()
            
            for user in users:
                if user["username"] == username:
                    del_url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/users/{user['id']}"
                    await keycloak_service._make_request("DELETE", del_url)
                    print(f"Deleted existing user: {username}")

            # Create fresh
            role = "soc_admin" if username == "admin" else "soc_analyst"
            user_data = {
                "username": username,
                "enabled": True,
                "firstName": "SOC" if username == "analyst" else "Admin",
                "lastName": "Analyst" if username == "analyst" else "User",
                "email": f"{username}@bluesec.com",
                "emailVerified": True,
                "requiredActions": [] # Clear all required actions!
            }
            create_url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/users"
            await keycloak_service._make_request("POST", create_url, json=user_data)
            print(f"Created fresh user: {username}")
            
            # Set password
            # Need to find the new ID
            search_resp = await keycloak_service._make_request("GET", search_url)
            new_user = search_resp.json()[0]
            pass_url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/users/{new_user['id']}/reset-password"
            await keycloak_service._make_request("PUT", pass_url, json={
                "type": "password",
                "value": username,
                "temporary": False
            })
            
            # Add roles
            # First find role ID
            role_url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/roles/{role}"
            role_resp = await keycloak_service._make_request("GET", role_url)
            role_data = role_resp.json()
            
            map_url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/users/{new_user['id']}/role-mappings/realm"
            await keycloak_service._make_request("POST", map_url, json=[role_data])
            print(f"Assigned role {role} to {username}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(fix_users())
