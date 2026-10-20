# Data flows and security

What BlueSec Nightshift sends where, what it stores, and how it is protected. Written
for security and privacy reviews.

## Summary

| Destination | What is sent | When | How to avoid it |
|---|---|---|---|
| **LLM provider** | Full alert content (see below) | When an alert is AI-scanned | Use a local LLM |
| **Threat-intelligence services** | Public indicators only (public IPs, domains, URLs, hashes, emails, CVE IDs) | When an alert is AI-scanned | Do not configure those services |
| **Your SOAR** | Case title, description with the AI analysis, indicators | On escalation | Choose "none" |
| **Your Wazuh API** | Your Wazuh API credentials | Health check every 15 s | Leave the API settings empty |
| **BlueSec's image registry** | Your registry account, to download the Nightshift images (no alert or configuration data) | Installing and upgrading, small package only | Use the full package |
| **BlueSec** (otherwise) | Nothing | Never | — |

Nightshift has no telemetry: the running application makes no calls to BlueSec. The
MITRE ATT&CK data and all fonts are bundled.

## Which alerts are analyzed

An alert is sent to the AI pipeline when its severity falls within the thresholds set
under **LLM Settings** (and it is less than 5 minutes old), or when an analyst starts a
scan manually. All other alerts are only stored.

## LLM provider

The administrator chooses the provider under **LLM Settings**: Nebius, OpenAI,
Anthropic, Google Gemini, any OpenAI-compatible endpoint, or a **local model**
(e.g. Ollama or vLLM on your network).

- **Extraction (agent 1)** receives the alert's full content as received from the SIEM.
  This can include host names, user names, IP addresses, command lines, file paths and
  log lines.
- **Verdict (agent 3)** receives the alert, the extracted indicators, the
  threat-intelligence results and internal statistics (how often the rule fired, on
  which hosts).

With a cloud provider, this data leaves your network and is subject to the provider's
terms. With a local model, nothing leaves your network.

## Threat-intelligence services

Used only for services that have an API key configured under **CTI Configuration**: a
service without a key is never contacted. (Services with a free tier, such as NVD or
EmailRep, also need their free key to be enabled.) The services are
VirusTotal, AbuseIPDB, URLScan, AlienVault OTX, Hybrid Analysis, MxToolbox,
GreyNoise, ThreatFox/abuse.ch, Shodan, EmailRep, NVD, and any custom source you add.

Only indicators that are meaningful outside your network are looked up:

- IP addresses that are publicly routable (private, loopback, reserved and multicast
  ranges are never sent);
- domains with public top-level domains (internal names are skipped), URLs;
- file hashes, email addresses, CVE identifiers.

Host names, user names, file paths and registry keys are analyzed locally and never sent.

## Stored data

| Data | Where | Protection |
|---|---|---|
| Alerts, AI results, settings | PostgreSQL (Docker volume) | Server access only |
| API keys, passwords, intake tokens entered in the UI | PostgreSQL | **Encrypted** (Fernet: AES-128-CBC + HMAC-SHA256) with the installation key `NIGHTSHIFT_SECRET_KEY` |
| Accounts | PostgreSQL (Keycloak) | Password hashes (Keycloak) |
| Internal service passwords, encryption key | `/opt/nightshift/nightshift.env` | Readable by root only |
| Backups | `/opt/nightshift/backups` (or your target) | Readable by root only; contain the configuration secrets |

The database itself is not encrypted at rest: use encrypted disks if required.
Secrets are never returned by the API: the interface shows `••••` and keeps the stored
value unless a new one is typed. A stored secret is only ever sent to the address it was
saved with.

## In transit

- Browsers and SIEMs connect over HTTPS (TLS 1.2/1.3), with HTTP redirected to HTTPS.
- Connections to cloud LLM and threat-intelligence services use HTTPS.
- Services talk to each other over a private Docker network on the same server; only
  the web entry point is published.

## Access control

- Sign-in through the built-in Keycloak identity server (OpenID Connect, authorization
  code flow with PKCE). Accounts lock temporarily after 10 failed attempts.
- Every API call and the live-update channel require a valid, unexpired token issued to
  Nightshift. Administrative functions require the SOC Manager role.
- Keycloak's own administration console is not reachable from outside unless enabled.
- SIEMs authenticate with a per-source intake token (shown once, stored encrypted,
  replaceable at any time); intake is rate-limited per sender.
- Security headers on every page (HSTS, no MIME sniffing, no framing by other sites).
