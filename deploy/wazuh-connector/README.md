# Connecting Wazuh to Nightshift

The Wazuh manager sends each alert to Nightshift as it happens, through a small
integration script. You need:

- the **intake URL**: `https://<your Nightshift address>/api/ingest/wazuh`
- the **ingest token**: shown once by `install.sh`, or generated under
  **Integrations > Wazuh > Generate token** in Nightshift

The Integrations screen also shows this guide with your URL and token filled in.

## 1. Install the integration script on the Wazuh manager

Copy `custom-nightshift` and `custom-nightshift.py` from this folder to
`/var/ossec/integrations/` on the manager, then:

```bash
cd /var/ossec/integrations
chown root:wazuh custom-nightshift custom-nightshift.py
chmod 750 custom-nightshift custom-nightshift.py
```

Wazuh running in Docker: copy them into the manager container instead, e.g.
`docker cp custom-nightshift <manager-container>:/var/ossec/integrations/` (same for the
`.py` file), then run the two commands above inside the container
(`docker exec -it <manager-container> bash`). To keep them across container
re-creation, mount them through your Wazuh compose file.

## 2. Trust Nightshift's certificate (self-signed or private CA only)

If Nightshift uses a certificate from a public CA, skip this step.
Otherwise copy the certificate (`/opt/nightshift/certs/server.crt` on the Nightshift
server, or your private CA certificate) to the manager as:

```
/var/ossec/integrations/custom-nightshift.ca
```

## 3. Add the integration to ossec.conf

In `/var/ossec/etc/ossec.conf`, inside `<ossec_config>`:

```xml
<integration>
  <name>custom-nightshift</name>
  <hook_url>https://soc.example.local/api/ingest/wazuh</hook_url>
  <api_key>YOUR_INGEST_TOKEN</api_key>
  <level>3</level>
  <alert_format>json</alert_format>
</integration>
```

`<level>` is the lowest Wazuh rule level forwarded. Which alerts Nightshift then
investigates with AI is set separately in Nightshift (LLM Settings > thresholds).

## 4. Restart the manager

```bash
systemctl restart wazuh-manager        # or: docker restart <manager-container>
```

New alerts appear in Nightshift's Live Alerts within seconds, and the Wazuh card under
Integrations shows **Receiving**.

## Troubleshooting

Delivery errors are logged by the script in `/var/ossec/logs/integrations.log`:

| Message | Meaning |
|---|---|
| `HTTP 401` | Wrong or old token: copy the current token into `<api_key>` and restart. |
| `HTTP 429` | Too many alerts at once: raise `<level>` to forward fewer. |
| `CERTIFICATE_VERIFY_FAILED` | Add Nightshift's certificate as `custom-nightshift.ca` (step 2). |
| `Connection refused` / timeout | The manager cannot reach Nightshift: check the URL, DNS and firewall (HTTPS port). |

Wazuh's API (port 55000) is optional: if you also enter its address and credentials
under **Integrations > Wazuh**, Nightshift shows the manager's health.
