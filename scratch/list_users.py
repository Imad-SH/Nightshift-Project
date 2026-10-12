import asyncio
import os
import sys

# Force UTF-8 for Windows Terminal
sys.stdout.reconfigure(encoding='utf-8')

# Add backend to path
backend_dir = r"c:\Users\imads\Desktop\Web App\backend"
sys.path.append(backend_dir)

from app.services.keycloak_service import keycloak_service

async def list_usernames():
    # Override server URL for host-side script
    keycloak_service.server_url = "http://localhost:8080"
    
    print(f"Connecting to Keycloak at {keycloak_service.server_url}...")
    try:
        users = await keycloak_service.list_users()
        print("\n--- ACTIVE USERNAMES ---")
        for u in users:
            print(f"- {u.get('username')} (Name: {u.get('firstName')} {u.get('lastName')})")
        print("------------------------\n")
        print("TRY ONE OF THESE USERNAMES TO LOGIN!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(list_usernames())
