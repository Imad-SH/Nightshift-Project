import httpx
import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app.core.config import settings

async def list_agents():
    print(f"Connecting to Wazuh: {settings.wazuh_url}")
    auth = httpx.BasicAuth(settings.wazuh_user, settings.wazuh_password)
    
    async with httpx.AsyncClient(verify=False) as client:
        # 1. Auth
        auth_url = f"{settings.wazuh_url}/security/user/authenticate"
        r = await client.get(auth_url, auth=auth)
        if r.status_code != 200:
            print(f"Auth Failed: {r.text}")
            return
        token = r.json().get('data', {}).get('token')
        
        # 2. List Agents
        headers = {"Authorization": f"Bearer {token}"}
        agents_url = f"{settings.wazuh_url}/agents"
        r = await client.get(agents_url, headers=headers)
        
        if r.status_code == 200:
            agents = r.json().get('data', {}).get('affected_items', [])
            print("\n--- ACTIVE WAZUH AGENTS ---")
            for agent in agents:
                print(f"ID: {agent['id']} | Name: {agent['name']} | Status: {agent['status']} | IP: {agent.get('ip', 'N/A')}")
        else:
            print(f"Failed to list agents: {r.text}")

if __name__ == "__main__":
    asyncio.run(list_agents())
