# Administering Nightshift

Commands assume the default installation directory, `/opt/nightshift`, and are run as
root (or with `sudo`). All `docker compose` commands use the same options:

```bash
cd /opt/nightshift
alias nsc='docker compose -p nightshift --env-file nightshift.env'
```

## Everyday commands

| Task | Command |
|---|---|
| Status of each service | `nsc ps` |
| Logs (follow) | `nsc logs -f backend` (or `web`, `keycloak`, `postgres`, `redis`) |
| Restart everything | `nsc restart` |
| Stop / start | `nsc stop` / `nsc up -d` |
| Health check for monitoring tools | `https://<address>/healthz` returns `ok` |

Container logs are rotated automatically (5 files of 10 MB per service).

## Configuration

All settings live in `nightshift.env` (readable by root only). After editing it,
apply the change with `nsc up -d`. What is configured where:

| In `nightshift.env` | In the web interface (admins only) |
|---|---|
| Address, ports, TLS, image version | SIEM and SOAR connections, intake tokens |
| Internal passwords and the encryption key | LLM provider, models and prompts |
| Keycloak admin console on/off | Threat-intelligence API keys |
| Branding | AI-scan thresholds, auto-escalation |
| MITRE ATT&CK updates on/off (`MITRE_AUTO_UPDATE`) | User accounts |

### MITRE ATT&CK updates

The ATT&CK matrix (Statistics) always uses the newest MITRE ATT&CK Enterprise release
available. Each Nightshift release bundles the newest one at the time; after that,
Nightshift checks MITRE's official repository once a day and switches to a new release
(new tactics, techniques and sub-techniques) without a restart. The matrix shows the
version in use and when it was last checked; administrators can also click **Check for
updates**. On servers without internet access the bundled version is used; set
`MITRE_AUTO_UPDATE=false` in `nightshift.env` to turn the daily check off.

API keys entered in the web interface are stored encrypted with
`NIGHTSHIFT_SECRET_KEY`. **Never lose or change that key**: without it, stored API keys
cannot be decrypted and must be entered again. Keep it in your backups.

## Users and roles

Create and manage accounts under **Users Management**. Roles:

| Role | Can |
|---|---|
| SOC Manager | Everything, including Integrations, LLM and CTI settings, users, login activity |
| L1 / L2 / L3 SOC Analyst | Monitor alerts, run AI scans, escalate to the SOAR, view statistics |

Accounts are locked for a while after 10 failed sign-ins in a row.

### Signing in with Active Directory / LDAP

Accounts are managed by the built-in Keycloak identity server, which can connect to
your directory:

1. Set `KEYCLOAK_ADMIN_CONSOLE=enabled` in `nightshift.env`, then `nsc up -d`.
2. Open `https://<address>/auth/admin`, sign in with `KEYCLOAK_ADMIN_USER` /
   `KEYCLOAK_ADMIN_PASSWORD` from `nightshift.env`, and select the **nightshift** realm.
3. **User federation > Add LDAP provider**, fill in your directory's details, and map
   your groups to the roles above (**Role mappings**).
4. Set `KEYCLOAK_ADMIN_CONSOLE=disabled` again and run `nsc up -d`.

## Changing the address

1. Update `NIGHTSHIFT_PUBLIC_URL` (and `HTTPS_PORT` if it changes) in `nightshift.env`.
2. Replace the certificate if it does not cover the new name.
3. Allow the new address for sign-in (the identity server only redirects to known addresses):

   ```bash
   NEW=https://new-name.example.local
   nsc exec -T -e PW="$(sed -n 's/^KEYCLOAK_ADMIN_PASSWORD=//p' nightshift.env)" keycloak bash -c '
     K=/opt/keycloak/bin/kcadm.sh
     $K config credentials --server http://localhost:8080/auth --realm master --user admin --password "$PW"
     ID=$($K get clients -r nightshift -q clientId=bluesec-frontend --fields id --format csv --noquotes)
     $K update clients/$ID -r nightshift -s "rootUrl='"$NEW"'" -s "redirectUris=[\"'"$NEW"'/*\"]"'
   ```
4. Apply: `nsc up -d`, and update the intake URL in your SIEM.

## Backups

```bash
/opt/nightshift/backup.sh                 # writes /opt/nightshift/backups/nightshift-backup-<version>-<date>.tar.gz
/opt/nightshift/backup.sh --output /mnt/backup
```

A backup contains both databases (alerts, settings, accounts), `nightshift.env`, the
certificate and generated reports. It contains secrets: store it as carefully as the
server. Schedule it, and copy it off the server:

```cron
# /etc/cron.d/nightshift-backup: every night at 02:00, keep 14 days
0 2 * * * root /opt/nightshift/backup.sh >/var/log/nightshift-backup.log 2>&1 && find /opt/nightshift/backups -name 'nightshift-backup-*' -mtime +14 -delete
```

Restoring is described in UPGRADE.md.

## Where the data is

| Data | Location |
|---|---|
| Alerts, settings, AI results | Docker volume `nightshift_postgres-data` (database `nightshift`) |
| Accounts and sign-in settings | same volume (database `keycloak`) |
| Threat-intelligence cache | Docker volume `nightshift_redis-data` |
| Generated reports | Docker volume `nightshift_downloads` |
| Configuration, certificate, backups | `/opt/nightshift` |

The database is not encrypted at rest by Nightshift (stored API keys are): use
disk encryption on the server if your policy requires it.

## Uninstalling

```bash
/opt/nightshift/uninstall.sh            # remove the containers, keep data and configuration
/opt/nightshift/uninstall.sh --purge    # delete everything except backups (asks for confirmation)
```
