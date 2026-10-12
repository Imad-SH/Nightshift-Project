import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings

class KeycloakService:
    def __init__(self):
        self.server_url = settings.keycloak_server_url
        self.realm = settings.keycloak_realm
        self.admin_user = settings.keycloak_admin_user
        self.admin_password = settings.keycloak_admin_password
        self._admin_token = None

    async def get_admin_token(self) -> str:
        """
        Authenticates with Keycloak as master admin to get an access token.
        """
        url = f"{self.server_url}/realms/master/protocol/openid-connect/token"
        data = {
            "client_id": "admin-cli",
            "username": self.admin_user,
            "password": self.admin_password,
            "grant_type": "password",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=data)
            response.raise_for_status()
            token_data = response.json()
            self._admin_token = token_data["access_token"]
            return self._admin_token

    def _get_headers(self) -> Dict[str, str]:
        if not self._admin_token:
            raise ValueError("Admin token not initialized. Call get_admin_token() first.")
        return {
            "Authorization": f"Bearer {self._admin_token}",
            "Content-Type": "application/json",
        }

    async def _make_request(self, method: str, url: str, **kwargs):
        """
        Helper to execute HTTP requests with automatic admin token refresh on 401.
        """
        if not self._admin_token:
            await self.get_admin_token()
        
        async with httpx.AsyncClient() as client:
            headers = self._get_headers()
            if 'headers' in kwargs:
                headers.update(kwargs.pop('headers'))
                
            response = await client.request(method, url, headers=headers, **kwargs)
            
            # If token expired, refresh and retry once
            if response.status_code == 401:
                await self.get_admin_token()
                headers = self._get_headers()
                if 'headers' in kwargs:
                    headers.update(kwargs.get('headers', {}))
                response = await client.request(method, url, headers=headers, **kwargs)
                
            return response

    async def create_user(self, username: str, email: str, first_name: str, last_name: str, attributes: Dict[str, Any] = None) -> str:
        """
        Creates a new user in the specific realm.
        Returns the new user's ID.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/users"
        user_data = {
            "username": username,
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": True,
            "emailVerified": True
        }
        if attributes:
            user_data["attributes"] = attributes

        response = await self._make_request("POST", url, json=user_data)
        
        if response.status_code == 201:
            location = response.headers.get("Location")
            if location:
                return location.split("/")[-1]
            
        response.raise_for_status()
        return ""

    async def set_user_password(self, user_id: str, password: str, temporary: bool = False):
        """
        Sets a user's password.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/users/{user_id}/reset-password"
        payload = {
            "type": "password",
            "value": password,
            "temporary": temporary
        }

        response = await self._make_request("PUT", url, json=payload)
        response.raise_for_status()

    async def get_realm_role(self, role_name: str) -> Dict[str, Any]:
        """
        Retrieves a realm role by name. Returns None if it doesn't exist.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/roles/{role_name}"
        response = await self._make_request("GET", url)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def create_realm_role(self, role_name: str):
        """
        Creates a new realm role.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/roles"
        payload = {"name": role_name}
        response = await self._make_request("POST", url, json=payload)
        # 201 Created or 409 Conflict (already exists) are fine
        if response.status_code not in [201, 409]:
            response.raise_for_status()

    async def ensure_role_exists(self, role_name: str):
        """
        Helper to make sure a role is there before we assign it.
        """
        role = await self.get_realm_role(role_name)
        if not role:
            await self.create_realm_role(role_name)

    async def assign_realm_role(self, user_id: str, role_name: str):
        """
        Assigns a realm role to a user.
        """
        role_info = await self.get_realm_role(role_name)
        
        url = f"{self.server_url}/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm"
        # Payload is a list of roles
        payload = [
            {
                "id": role_info["id"],
                "name": role_info["name"]
            }
        ]
        
        response = await self._make_request("POST", url, json=payload)
        response.raise_for_status()

    async def list_users(self) -> List[Dict[str, Any]]:
        """
        Lists all users in the realm.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/users"
        response = await self._make_request("GET", url)
        response.raise_for_status()
        return response.json()

    async def get_user(self, user_id: str) -> Dict[str, Any]:
        """
        Retrieves a single user's details including attributes.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/users/{user_id}"
        response = await self._make_request("GET", url)
        response.raise_for_status()
        return response.json()

    async def get_client_uuid(self, client_id: str) -> str:
        """
        Looks up the internal Keycloak UUID for a given client ID string.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/clients?clientId={client_id}"
        response = await self._make_request("GET", url)
        if response.status_code == 200:
            clients = response.json()
            if clients:
                return clients[0].get("id")
        return None

    async def get_active_sessions(self) -> List[Dict[str, Any]]:
        """
        Retrieves the exact list of active user sessions for the frontend client.
        """
        client_uuid = await self.get_client_uuid("bluesec-frontend")
        if not client_uuid:
            return []
            
        url = f"{self.server_url}/admin/realms/{self.realm}/clients/{client_uuid}/user-sessions"
        response = await self._make_request("GET", url)
        if response.status_code == 200:
            return response.json()
        return []

    async def get_active_sessions_count(self) -> int:
        """
        Retrieves the exact number of active Keycloak sessions for the frontend.
        """
        sessions = await self.get_active_sessions()
        return len(sessions)

    async def get_user_roles(self, user_id: str) -> List[str]:
        """
        Retrieves the realm roles assigned to a user.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm"
        response = await self._make_request("GET", url)
        response.raise_for_status()
        roles = response.json()
        return [role["name"] for role in roles]

    async def delete_user(self, user_id: str):
        """
        Deletes a user from the realm.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/users/{user_id}"
        response = await self._make_request("DELETE", url)
        response.raise_for_status()

    async def update_user(self, user_id: str, email: str, first_name: str, last_name: str, enabled: bool, attributes: Dict[str, Any] = None):
        """
        Updates a user's basic details and attributes.
        """
        url = f"{self.server_url}/admin/realms/{self.realm}/users/{user_id}"
        user_data = {
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": enabled
        }
        if attributes:
            user_data["attributes"] = attributes
            
        response = await self._make_request("PUT", url, json=user_data)
        response.raise_for_status()

    async def remove_realm_role(self, user_id: str, role_name: str):
        """
        Removes a realm role from a user.
        """
        try:
            role_info = await self.get_realm_role(role_name)
            url = f"{self.server_url}/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm"
            payload = [
                {
                    "id": role_info["id"],
                    "name": role_info["name"]
                }
            ]
            response = await self._make_request("DELETE", url, json=payload)
            response.raise_for_status()
        except Exception as e:
            print(f"Failed to remove role {role_name}: {e}")

    async def get_login_events(self, max_events: int = 100) -> List[Dict[str, Any]]:
        """
        Retrieves login and logout events from Keycloak.
        Ensures events tracking is enabled in the realm.
        """
        config_url = f"{self.server_url}/admin/realms/{self.realm}/events/config"
        config_resp = await self._make_request("GET", config_url)
        if config_resp.status_code == 200:
            config = config_resp.json()
            enabled = config.get("eventsEnabled", False)
            types = config.get("enabledEventTypes", [])
            needed = ["LOGIN", "LOGIN_ERROR", "LOGOUT"]
            if not enabled or any(t not in types for t in needed):
                config["eventsEnabled"] = True
                config["enabledEventTypes"] = list(set(types + needed))
                await self._make_request("PUT", config_url, json=config)

        url = f"{self.server_url}/admin/realms/{self.realm}/events"
        params = [
            ("type", "LOGIN"),
            ("type", "LOGIN_ERROR"),
            ("type", "LOGOUT"),
            ("max", max_events)
        ]
        response = await self._make_request("GET", url, params=params)
        if response.status_code == 200:
            return response.json()
        return []

    async def get_user_audit_events(self, user_id: str, max_events: int = 20) -> List[Dict[str, Any]]:
        """
        Retrieves combined login/logout and admin execution events for a specific user ID.
        """
        # 1. Ensure events are enabled
        config_url = f"{self.server_url}/admin/realms/{self.realm}/events/config"
        config_resp = await self._make_request("GET", config_url)
        if config_resp.status_code == 200:
            config = config_resp.json()
            enabled = config.get("eventsEnabled", False)
            admin_enabled = config.get("adminEventsEnabled", False)
            types = config.get("enabledEventTypes", [])
            needed = ["LOGIN", "LOGIN_ERROR", "LOGOUT"]
            needs_update = not enabled or not admin_enabled or any(t not in types for t in needed)
            
            if needs_update:
                config["eventsEnabled"] = True
                config["adminEventsEnabled"] = True
                config["enabledEventTypes"] = list(set(types + needed))
                await self._make_request("PUT", config_url, json=config)

        all_events = []
        
        # 2. Get client events for the user
        client_url = f"{self.server_url}/admin/realms/{self.realm}/events"
        params_client = [("user", user_id), ("max", max_events)]
        client_resp = await self._make_request("GET", client_url, params=params_client)
        if client_resp.status_code == 200:
            all_events.extend(client_resp.json())
            
        # 3. Get admin events
        admin_url = f"{self.server_url}/admin/realms/{self.realm}/admin-events"
        # Base user resource
        params_admin = [("resourcePath", f"users/{user_id}"), ("max", max_events)]
        admin_resp = await self._make_request("GET", admin_url, params=params_admin)
        if admin_resp.status_code == 200:
            all_events.extend(admin_resp.json())
            
        # Role mappings for the user (sub-path)
        params_roles = [("resourcePath", f"users/{user_id}/role-mappings/realm"), ("max", max_events)]
        roles_resp = await self._make_request("GET", admin_url, params=params_roles)
        if roles_resp.status_code == 200:
            all_events.extend(roles_resp.json())
            
        # 4. Sort descending by time
        all_events.sort(key=lambda x: x.get("time", 0), reverse=True)
        return all_events[:max_events]

keycloak_service = KeycloakService()
