import asyncio
from app.services.keycloak_service import keycloak_service

async def main():
    try:
        users = await keycloak_service.list_users()
        print(f"Users found: {len(users)}")
        for u in users:
            print(f"- {u.get('username')} (ID: {u.get('id')})")
    except Exception as e:
        print(f"Error accessing Keycloak: {e}")

if __name__ == "__main__":
    asyncio.run(main())
