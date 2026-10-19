"""
Build the production realm template (nightshift-realm.json) from a Keycloak realm export.

Run after changing the realm in a development Keycloak and exporting it:
    python deploy/keycloak/make_realm_template.py backend/keycloak-realm-export.json

What it changes for production:
- the frontend client accepts redirects only to the installation's public URL
  (${NIGHTSHIFT_PUBLIC_URL}, resolved by Keycloak from the environment at import),
  uses the authorization-code flow with PKCE and no direct password grant;
- brute-force protection is on;
- key providers are dropped so every installation generates its own signing keys.
"""
import json
import sys
from pathlib import Path

CLIENT_ID = "bluesec-frontend"
PUBLIC_URL = "${NIGHTSHIFT_PUBLIC_URL}"
HERE = Path(__file__).resolve().parent


def main(export_path: str) -> None:
    realm = json.loads(Path(export_path).read_text(encoding="utf-8"))

    realm["realm"] = "nightshift"
    realm["displayName"] = "BlueSec Nightshift"
    realm["loginTheme"] = "bluesec"
    realm["sslRequired"] = "external"
    realm["registrationAllowed"] = False

    # Lock an account for a while after repeated failed logins
    realm.update({
        "bruteForceProtected": True,
        "permanentLockout": False,
        "failureFactor": 10,
        "waitIncrementSeconds": 60,
        "maxFailureWaitSeconds": 900,
        "maxDeltaTimeSeconds": 43200,
    })

    for client in realm.get("clients", []):
        if client.get("clientId") != CLIENT_ID:
            continue
        client["publicClient"] = True
        client["standardFlowEnabled"] = True
        client["directAccessGrantsEnabled"] = False
        client["implicitFlowEnabled"] = False
        client["redirectUris"] = [f"{PUBLIC_URL}/*"]
        client["webOrigins"] = ["+"]
        client["rootUrl"] = PUBLIC_URL
        attributes = client.setdefault("attributes", {})
        attributes["pkce.code.challenge.method"] = "S256"
        attributes["post.logout.redirect.uris"] = "+"
        break
    else:
        sys.exit(f"Client {CLIENT_ID} not found in the export")

    # Fresh signing keys per installation
    components = realm.get("components", {})
    components.pop("org.keycloak.keys.KeyProvider", None)

    realm.pop("users", None)
    out = HERE / "nightshift-realm.json"
    out.write_text(json.dumps(realm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(HERE.parent.parent / "backend" / "keycloak-realm-export.json"))
