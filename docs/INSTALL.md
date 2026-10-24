# Installing Nightshift

Nightshift runs as a set of containers on one Linux server. Analysts use it from
their browser; nothing is installed on their machines.

## Requirements

| | Minimum | Recommended |
|---|---|---|
| OS | 64-bit Linux: Ubuntu 22.04/24.04, Debian 12, RHEL/Rocky/Alma 9 | |
| Docker | Docker Engine 24+ with the Compose v2 plugin (`docker compose`) | |
| CPU / memory | 4 cores / 8 GB | 8 cores / 16 GB |
| Disk | 40 GB free | 100 GB (alert history grows) |
| Access | root or `sudo` on the server | |

Install Docker from https://docs.docker.com/engine/install/ if needed.

### Network

| Direction | Port | Purpose |
|---|---|---|
| Inbound | 443/TCP (`HTTPS_PORT`) | Analysts' browsers, and alerts pushed by your SIEM |
| Inbound | 80/TCP (`HTTP_PORT`) | Redirect to HTTPS (optional) |
| Outbound | 443/TCP | Your LLM provider and threat-intelligence services, if you use cloud ones (see DATA-FLOWS.md) |
| Outbound | Your SIEM / SOAR | Wazuh API (55000) for health checks; your case-management system |
| Outbound | 443/TCP to the image registry | Small package only: downloading the images when installing and upgrading |

Nothing else is exposed: the database, cache, identity server and API are only
reachable inside the server.

## 1. Check the package

You receive `nightshift-<version>.tar.gz` and `nightshift-<version>.tar.gz.sha256`
(and possibly an `.asc` signature), in one of two forms:

- **Full package** (about 550 MB): contains the images. Installs without internet access.
- **Small package** (about 20 KB): the images are downloaded from BlueSec's registry
  during installation, with the registry account BlueSec gives you (see
  [Small package](#small-package-signing-in-to-the-registry)).

```bash
sha256sum -c nightshift-<version>.tar.gz.sha256
# if you received a signature and BlueSec's public key:
gpg --verify nightshift-<version>.tar.gz.asc nightshift-<version>.tar.gz
```

## 2. Install

```bash
tar xzf nightshift-<version>.tar.gz
cd nightshift-<version>
sudo ./install.sh --url https://soc.example.local
```

`--url` is the address analysts will open. Use the name your users and your SIEM
will reach the server by (DNS name, or IP address). Other options:

| Option | Use |
|---|---|
| `--dir DIR` | Install somewhere other than `/opt/nightshift` |
| `--admin-user NAME`, `--admin-email EMAIL` | First administrator account (default `admin`) |
| `--no-tls` | A reverse proxy in front of Nightshift terminates TLS (see below) |
| `--registry-user NAME` | Small package: your registry account (see below) |
| `--registry PREFIX` | Small package: download the images from another registry, e.g. your own mirror `registry.internal.example/bluesec/` |

The installer checks the server, loads the images (no internet needed), generates a
random password for every internal service, creates a TLS certificate if you did not
provide one, starts everything and creates the first administrator. At the end it
prints:

- the address to open and the administrator's **temporary password** (you choose a
  new one at first login);
- the **Wazuh intake URL and token**.

They are shown only once: note them before closing the terminal. Running
`install.sh` again is safe; it keeps the existing configuration, accounts and data.

### Small package: signing in to the registry

Add your registry account to the install command:

```bash
sudo ./install.sh --url https://soc.example.local --registry-user <account>
```

You are asked for the account's password before anything else happens. For an
unattended install, pass it on standard input instead:
`echo "$REGISTRY_TOKEN" | sudo ./install.sh --url ... --registry-user <account>`.

Docker keeps the sign-in (in root's `~/.docker/config.json`), so upgrades download
without asking again; `sudo docker logout <registry>` removes it. If the download fails,
the installer stops before changing anything and shows Docker's error.

## 3. First login and setup

1. Open the address, sign in with the temporary password and choose a new one.
2. **Integrations**: connect your SIEM (Wazuh, or any SIEM through the Generic
   Webhook) and choose your case-management system (Flowintel, TheHive, or a
   webhook). Each card has a step-by-step guide and a "Send test alert" button.
3. **LLM Settings**: choose the AI provider and models, and enter the API key.
4. **CTI Configuration**: enter the keys of the threat-intelligence services you use.
5. **Users Management**: create accounts for your analysts.

To connect Wazuh, follow `wazuh-connector/README.md` (also available in the
installation directory).

## Using your own certificate

Before running the installer (or later, then `sudo docker compose -p nightshift restart web`),
put your certificate and key in the installation directory:

```
/opt/nightshift/certs/server.crt   (certificate, with intermediate certificates appended)
/opt/nightshift/certs/server.key   (private key, unencrypted)
```

Without them, the installer creates a self-signed certificate. Browsers will warn
until you import it or replace it, and your SIEM must be told to trust it (for Wazuh,
see the connector guide).

## Behind a reverse proxy or load balancer

Install with `--no-tls`, set `HTTP_PORT` in `nightshift.env` if needed, and configure
the proxy to:

- forward all paths to Nightshift's `HTTP_PORT`, keeping the `Host` header;
- set `X-Forwarded-Proto: https`;
- allow WebSocket upgrades on `/socket.io/`;
- allow request bodies of at least 25 MB.

## Troubleshooting

```bash
cd /opt/nightshift
sudo docker compose -p nightshift ps            # status of each service
sudo docker compose -p nightshift logs --tail 100 backend   # or web, keycloak, postgres, redis
```

| Symptom | Check |
|---|---|
| Installer stops at "did not start correctly" | The logs it prints; most often memory (8 GB+) or disk space |
| Installer stops at "Could not download" | The server cannot reach the registry (firewall; behind an HTTP proxy, [configure Docker's proxy](https://docs.docker.com/engine/daemon/proxy/)), or it needs `--registry-user` |
| Browser shows a certificate warning | Expected with the self-signed certificate; install your own |
| "Port 443 is already in use" | Another web server runs on this machine: stop it or set `HTTPS_PORT` |
| Login page loops or shows "invalid redirect" | The address you open must match `NIGHTSHIFT_PUBLIC_URL` exactly (including the port) |
| Live alerts never arrive | Integrations > your SIEM: status and "Last alert"; on Wazuh, `/var/ossec/logs/integrations.log` |
