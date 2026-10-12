import asyncio
import sys
import os

from app.services.keycloak_service import keycloak_service

async def test():
    try:
        await keycloak_service.get_admin_token()
        
        # 1. Fetch config
        url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/events/config"
        config_resp = await keycloak_service._make_request("GET", url)
        config = config_resp.json()
        print("Events Config Enabled Types:", config.get("enabledEventTypes"))
        
        # 2. Fetch all events (no type filter)
        url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/events?max=20"
        resp = await keycloak_service._make_request("GET", url)
        events = resp.json()
        
        print("\n--- RECENT EVENTS ---")
        for e in events:
            print(f"[{e.get('type')}] {e.get('userId')} - Err: {e.get('error')} - Details: {e.get('details')}")
            
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(test())
