# SOC Platform - Setup Instructions

## Prerequisites
- Docker Desktop installed and running
- 7-Zip installed
- All files placed on your Desktop

## Step 1: Load Docker images
```powershell
docker load -i "$HOME\Desktop\all-snapshots.tar"
docker load -i "$HOME\Desktop\wazuh-certs.tar"
```
This takes a few minutes (loading ~6 GB of images).

## Step 2: Retag images to original names
```powershell
docker tag bluesec-keycloak-snapshot bluesec-keycloak-fixed
docker tag cortex-postgres-snapshot postgres:15-alpine
docker tag cortex-redis-snapshot redis:7-alpine
docker tag cortex-backend-snapshot backend-backend
docker tag wazuh-manager-snapshot wazuh/wazuh-manager:4.8.2
docker tag wazuh-indexer-snapshot wazuh/wazuh-indexer:4.8.2
docker tag wazuh-dashboard-snapshot wazuh/wazuh-dashboard:4.8.2
docker tag thehive-snapshot strangebee/thehive:5.3.3-1
docker tag elasticsearch-snapshot elasticsearch:7.17.9
docker tag cassandra-snapshot cassandra:4.0
docker tag minio-snapshot minio/minio
```

## Step 3: Extract source code
IMPORTANT: The folder names MUST be exactly as shown below.
```powershell
7z x "$HOME\Desktop\SOC-Dashboard.7z" -o"$HOME\Desktop\Web App"
7z x "$HOME\Desktop\Wazuh-Stack.7z" -o"$HOME\Desktop\wazuh"
7z x "$HOME\Desktop\TheHive-Stack.7z" -o"$HOME\Desktop\TheHive"
```

## Step 4: Start Wazuh (wait 60 seconds after this)
```powershell
cd "$HOME\Desktop\wazuh"
docker compose up -d
```

## Step 5: Start TheHive (wait 30 seconds after this)
```powershell
cd "$HOME\Desktop\TheHive"
docker compose up -d
```

## Step 6: Start SOC Dashboard (DO NOT use --build flag)
```powershell
cd "$HOME\Desktop\Web App\backend"
docker compose up -d
```

## Step 7: Restore database data (optional - adds historical alerts)
```powershell
docker run --rm -v backend_postgres-data:/data -v "$HOME\Desktop":/backup alpine sh -c "tar xzf /backup/vol-postgres.tar.gz -C /data"
docker run --rm -v backend_redis-data:/data -v "$HOME\Desktop":/backup alpine sh -c "tar xzf /backup/vol-redis.tar.gz -C /data"
docker run --rm -v backend_cortex-downloads:/data -v "$HOME\Desktop":/backup alpine sh -c "tar xzf /backup/vol-downloads.tar.gz -C /data"
```

## Step 8: Restart to pick up restored data
```powershell
cd "$HOME\Desktop\Web App\backend"
docker compose restart
```

## Step 9: Open the dashboard
Open your browser and go to: http://localhost:5173

### Login Credentials
| Username | Password | Role         |
|----------|----------|--------------|
| admin    | admin    | SOC Manager  |
| analyst  | analyst  | L1 Analyst   |

### Other Services
| Service         | URL                     |
|-----------------|-------------------------|
| Keycloak Admin  | http://localhost:8080    |
| Wazuh Dashboard | https://localhost:8443   |
| TheHive         | http://localhost:9000    |

## IMPORTANT WARNINGS

1. In Step 6, use ONLY "docker compose up -d". Do NOT add "--build" or it will break.
2. The Wazuh folder MUST be named "wazuh" (lowercase). The SOC Dashboard depends on the network name "wazuh_wazuh" which is derived from this folder name.
3. Start services in order: Wazuh first, then TheHive, then SOC Dashboard.

## Troubleshooting

### Wazuh shows DISCONNECTED
Restart the backend:
```powershell
cd "$HOME\Desktop\Web App\backend"
docker compose restart backend
```

### SYSTEM_OFFLINE on login page
Wait 60 seconds for Keycloak to fully start, then refresh the page.

### To stop everything (reverse order)
```powershell
cd "$HOME\Desktop\Web App\backend"
docker compose down
cd "$HOME\Desktop\TheHive"
docker compose down
cd "$HOME\Desktop\wazuh"
docker compose down
```
