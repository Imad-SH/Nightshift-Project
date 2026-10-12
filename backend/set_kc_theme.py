import asyncio
import sys
import os

from app.services.keycloak_service import keycloak_service

async def set_theme():
    try:
        await keycloak_service.get_admin_token()
        
        # Get realm representation
        url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}"
        resp = await keycloak_service._make_request("GET", url)
        realm_config = resp.json()
        
        # Set theme
        realm_config["loginTheme"] = "bluesec"
        
        # Update realm
        update_resp = await keycloak_service._make_request("PUT", url, json=realm_config)
        print("Set theme successful:", update_resp.status_code == 204)
            
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(set_theme())
