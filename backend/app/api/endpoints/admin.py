from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List, Optional
from app.core.security import require_role, get_current_user
from app.services.keycloak_service import keycloak_service
from pydantic import BaseModel, EmailStr
import time

router = APIRouter()

# A session counts as active while its sign-in was renewed recently (open tabs renew every
# few minutes; access tokens last 5 minutes)
ACTIVE_SESSION_WINDOW_SECONDS = 10 * 60

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str

class UserUpdate(BaseModel):
    name: str
    email: EmailStr
    role: str
    status: str
    password: Optional[str] = None

@router.get("/users", response_model=List[Dict[str, Any]])
async def list_users(user: Dict[str, Any] = Depends(require_role("soc_admin"))):
    """
    Admin-only endpoint to list users in the SOC Platform via Keycloak.
    """
    try:
        users = await keycloak_service.list_users()
        
        # Robust fetching of full profile (including attributes) and roles
        enriched_users = []
        for u in users:
            uid = u.get("id")
            try:
                # 1. Fetch full profile to get attributes (title)
                full_user = await keycloak_service.get_user(uid)
                # 2. Fetch roles
                roles = await keycloak_service.get_user_roles(uid)
                
                # Combine
                print(f"DEBUG: Full attributes for {full_user.get('username')}: {full_user.get('attributes')}")
                enriched_users.append({

                    "id": uid,
                    "username": full_user.get("username", "Unknown"),
                    "firstName": full_user.get("firstName", ""),
                    "lastName": full_user.get("lastName", ""),
                    "email": full_user.get("email", ""),
                    "enabled": full_user.get("enabled", True),
                    "createdTimestamp": full_user.get("createdTimestamp", 0),
                    "roles": roles,
                    "title": (full_user.get("attributes") or {}).get("soc_title", [""])[0]
                })

            except Exception as e:
                print(f"⚠️ Failed to enrich user {uid}: {e}")
                # Fallback to basic info if enrichment fails
                enriched_users.append({
                    "id": uid,
                    "username": u.get("username"),
                    "firstName": u.get("firstName"),
                    "lastName": u.get("lastName"),
                    "email": u.get("email"),
                    "enabled": u.get("enabled"),
                    "createdTimestamp": u.get("createdTimestamp"),
                    "roles": [],
                    "title": ""
                })
        
        return enriched_users
    except Exception as e:
        print(f"❌ Admin Users List Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")

@router.get("/users/me")
async def get_my_profile(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Allow any authenticated user to fetch their own Keycloak profile and attributes.
    """
    try:
        user_id = user.get("sub")
        if not user_id:
            raise ValueError("User token missing 'sub' claim")
            
        full_user = await keycloak_service.get_user(user_id)
        roles = await keycloak_service.get_user_roles(user_id)
        title = full_user.get("attributes", {}).get("soc_title", [""])[0]
        
        return {
            "id": full_user.get("id"),
            "username": full_user.get("username"),
            "email": full_user.get("email"),
            "firstName": full_user.get("firstName"),
            "lastName": full_user.get("lastName"),
            "title": title,
            "roles": roles
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch profile: {str(e)}")

@router.get("/stats")
async def get_admin_stats(user: Dict[str, Any] = Depends(require_role("soc_admin"))):
    """
    Fetch aggregate statistics like live active sessions from Keycloak.
    """
    try:
        sessions = await keycloak_service.get_active_sessions()
        # An open Nightshift tab renews its sign-in every few minutes, which updates the
        # session's lastAccess. Sessions idle for longer belong to closed browsers: Keycloak
        # keeps them until its idle timeout, but they are not in use.
        cutoff_ms = (time.time() - ACTIVE_SESSION_WINDOW_SECONDS) * 1000
        in_use = [s for s in sessions if (s.get("lastAccess") or s.get("start") or 0) >= cutoff_ms]
        in_use.sort(key=lambda s: s.get("lastAccess") or 0, reverse=True)
        active_users = [
            {
                "username": s.get("username"),
                "ip": s.get("ipAddress"),
                "start": s.get("start"),
                "last_access": s.get("lastAccess")
            }
            for s in in_use
        ]
        return {
            "active_sessions": len(in_use),
            "active_users": active_users,
            "idle_sessions": len(sessions) - len(in_use)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    user: Dict[str, Any] = Depends(require_role("soc_admin"))
):
    """
    Admin-only endpoint to delete a SOC User from Keycloak.
    """
    try:
        await keycloak_service.delete_user(user_id)
        return {"status": "success", "message": f"User {user_id} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

@router.post("/users")
async def add_user(
    new_user: UserCreate, 
    user: Dict[str, Any] = Depends(require_role("soc_admin"))
):
    """
    Admin-only endpoint to add a new SOC Analyst to Keycloak.
    """
    try:
        # 1. Parse Name
        parts = new_user.name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""
        
        # 2. Create User in Keycloak
        username = new_user.name.lower().replace(" ", ".")
        
        user_id = await keycloak_service.create_user(
            username=username,
            email=new_user.email,
            first_name=first_name,
            last_name=last_name,
            attributes={"soc_title": [new_user.role]}
        )
        
        # 3. Set Password
        await keycloak_service.set_user_password(user_id, new_user.password)
        
        # 4. Map Role
        # Mapping frontend labels to Keycloak Realm Roles
        role_map = {
            "SOC Manager": "soc_admin",
            "L3 SOC Analyst": "soc_analyst_l3",
            "L2 SOC Analyst": "soc_analyst_l2",
            "L1 SOC Analyst": "soc_analyst",
            "Admin": "soc_admin",
        }
        
        keycloak_role = role_map.get(new_user.role, "soc_analyst")
        
        # Ensure the technical role exists in Keycloak before assigning
        await keycloak_service.ensure_role_exists(keycloak_role)
        await keycloak_service.assign_realm_role(user_id, keycloak_role)
        
        return {
            "status": "success", 
            "message": f"User {username} provisioned successfully in Keycloak",
            "user_id": user_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to provision user: {str(e)}")

@router.put("/users/{user_id}")
async def edit_user(
    user_id: str,
    update_data: UserUpdate,
    user: Dict[str, Any] = Depends(require_role("soc_admin"))
):
    """
    Admin-only endpoint to edit an existing SOC Analyst in Keycloak.
    """
    try:
        parts = update_data.name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""
        
        is_enabled = update_data.status.upper() == "ACTIVE"
        
        # 1. Fetch existing user to preserve other attributes and debug
        try:
            full_user = await keycloak_service.get_user(user_id)
            current_attrs = full_user.get("attributes", {})
            print(f"DEBUG: Current attributes for {user_id}: {current_attrs}")
        except Exception as e:
            print(f"DEBUG: Failed to fetch existing user for attributes: {e}")
            current_attrs = {}

        # Update soc_title attribute
        current_attrs["soc_title"] = [update_data.role]
        print(f"DEBUG: Saving soc_title '{update_data.role}' for user {user_id}")

        # 2. Update basic details and merged attributes
        await keycloak_service.update_user(
            user_id=user_id,
            email=update_data.email,
            first_name=first_name,
            last_name=last_name,
            enabled=is_enabled,
            attributes=current_attrs
        )
        print(f"DEBUG: Keycloak update_user call completed for {user_id}")
        
        # 2. Reset password if provided
        if update_data.password and update_data.password.strip():
            await keycloak_service.set_user_password(user_id, update_data.password.strip())
            
        # 3. Handle Role Updates
        role_map = {
            "SOC Manager": "soc_admin",
            "L3 SOC Analyst": "soc_analyst_l3",
            "L2 SOC Analyst": "soc_analyst_l2",
            "L1 SOC Analyst": "soc_analyst",
            "Admin": "soc_admin"
        }
        target_role = role_map.get(update_data.role, "soc_analyst")
        
        # Ensure the technical role exists before assigning
        await keycloak_service.ensure_role_exists(target_role)
        
        current_roles = await keycloak_service.get_user_roles(user_id)
        
        # Clean up old SOC roles and assign new one if it changed
        if target_role not in current_roles:
            soc_roles_to_clean = ["soc_manager", "soc_admin", "soc_analyst", "soc_analyst_l1", "soc_analyst_l2", "soc_analyst_l3"]
            for r in soc_roles_to_clean:
                if r in current_roles:
                    await keycloak_service.remove_realm_role(user_id, r)
                
            await keycloak_service.assign_realm_role(user_id, target_role)
            
        return {
            "status": "success", 
            "message": f"User {user_id} updated successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

@router.get("/audit/login-activity")
async def get_login_activity(
    max_events: int = 100,
    user: Dict[str, Any] = Depends(require_role("soc_admin"))
):
    """
    Admin-only endpoint to fetch login activity logs from Keycloak.
    """
    try:
        # Fetch events
        events = await keycloak_service.get_login_events(max_events=max_events)
        
        # Pre-fetch users to map UUID to Username
        users = await keycloak_service.list_users()
        user_map = {u.get("id"): u.get("username", "Unknown") for u in users}
        
        formatted_events = []
        for e in events:
            user_id = e.get("userId", "N/A")
            details = e.get("details", {})
            
            # Prefer username from details if login, else lookup in user_map, else fallback to UUID
            username = details.get("username")
            if not username and user_id != "N/A":
                username = user_map.get(user_id, user_id)
            elif not username:
                username = "Unknown"
                
            formatted_events.append({
                "id": e.get("id", ""),
                "time": e.get("time", 0),
                "type": e.get("type", "UNKNOWN"),
                "userId": user_id,
                "username": username,
                "ipAddress": e.get("ipAddress", "N/A"),
                "error": e.get("error", None),
                "details": details
            })
            
        return formatted_events
    except Exception as ex:
        print(f"❌ Admin Login Activity Error: {str(ex)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch login activity: {str(ex)}")

@router.get("/audit/users/{user_id}")
async def get_user_audit(
    user_id: str,
    max_events: int = 20,
    user: Dict[str, Any] = Depends(require_role("soc_manager"))
):
    """
    Admin-only endpoint to fetch a specific user's login and administrative audit logs from Keycloak.
    """
    try:
        events = await keycloak_service.get_user_audit_events(user_id, max_events)
        formatted_events = []
        for e in events:
            # Check if it's an admin event (has 'operationType')
            if "operationType" in e:
                op = e.get("operationType", "UPDATE")
                res = e.get("resourcePath", "")
                if "role-mappings" in res:
                    formatted_events.append({
                        "id": e.get("id", str(e.get("time"))),
                        "type": "ROLE_MODIFIED",
                        "time": e.get("time"),
                        "description": "System Assigned New Permissions"
                    })
                else:
                    formatted_events.append({
                        "id": e.get("id", str(e.get("time"))),
                        "type": f"PROFILE_{op}",
                        "time": e.get("time"),
                        "description": "User profile modified by admin"
                    })
            else:
                # Client event
                ev_type = e.get("type", "UNKNOWN")
                desc = "Unknown Event"
                if ev_type == "LOGIN":
                    desc = "Secure Session Established"
                elif ev_type == "LOGOUT":
                    desc = "Session Terminated"
                elif ev_type == "LOGIN_ERROR":
                    desc = e.get("error", "Authentication Failed").replace("_", " ").title()
                elif ev_type == "CODE_TO_TOKEN":
                    desc = "Authentication Token Exchanged"
                    
                formatted_events.append({
                    "id": e.get("id", str(e.get("time", 0))),
                    "type": f"SYSTEM_{ev_type}" if ev_type in ["LOGIN", "LOGOUT"] else ev_type,
                    "time": e.get("time", 0),
                    "description": desc
                })
        
        return formatted_events
    except Exception as ex:
        print(f"❌ User Audit Error for {user_id}: {str(ex)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user audit: {str(ex)}")

