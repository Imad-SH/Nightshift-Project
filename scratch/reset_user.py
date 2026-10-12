import asyncio
import os
import sys

# Force UTF-8 for Windows Terminal
sys.stdout.reconfigure(encoding='utf-8')

# Add backend to path
backend_dir = r"c:\Users\imads\Desktop\Web App\backend"
sys.path.append(backend_dir)

from app.services.keycloak_service import keycloak_service

async def reset_failsafe():
    keycloak_service.server_url = "http://localhost:8080"
    target_username = "imad.chouiouukh"
    new_password = "Password123!" # Standard strong password
    
    print(f"Connecting to Keycloak to reset {target_username}...")
    try:
        users = await keycloak_service.list_users()
        target_user = next((u for u in users if u.get('username') == target_username), None)
        
        if not target_user:
            print(f"Error: User {target_username} not found!")
            return

        uid = target_user['id']
        await keycloak_service.set_user_password(uid, new_password, temporary=False)
        print(f"\n✅ SUCCESS! {target_username} is ready.")
        print(f"CREDENTIALS:")
        print(f"Username: {target_username}")
        print(f"Password: {new_password}")
        print("\nTry logging in with these exact details now.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(reset_failsafe())
