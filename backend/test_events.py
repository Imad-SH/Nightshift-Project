import asyncio
from app.services.keycloak_service import keycloak_service

async def main():
    await keycloak_service.get_admin_token()
    
    # 1. Get first user
    users = await keycloak_service.list_users()
    if not users:
        print("No users found.")
        return
    user = users[0]
    user_id = user["id"]
    print(f"Testing events for user: {user.get('username')} ({user_id})")
    
    # 2. Get client events for user
    url = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/events?user={user_id}&max=5"
    resp = await keycloak_service._make_request("GET", url)
    print("User Events:", resp.json())
    
    # 3. Get admin events for user (like role changes)
    # Admin events resourcePath usually contains "users/{user_id}"
    url_admin = f"{keycloak_service.server_url}/admin/realms/{keycloak_service.realm}/admin-events?resourcePath=users/{user_id}&max=5"
    resp_admin = await keycloak_service._make_request("GET", url_admin)
    print("Admin Events:", resp_admin.json())

if __name__ == "__main__":
    asyncio.run(main())
