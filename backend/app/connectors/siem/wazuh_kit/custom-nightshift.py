#!/var/ossec/framework/python/bin/python3
"""
Nightshift integration for the Wazuh manager.

Wazuh's integrator runs it for every alert matching the <integration> block in
ossec.conf, with the arguments: <alert file> <api_key> <hook_url>.
It forwards the alert as JSON to Nightshift, authenticated with the ingest
token configured as <api_key>.

TLS: the server certificate is verified against the system CAs. If Nightshift
uses a certificate from a private CA (or the installer's self-signed one),
copy that CA certificate to /var/ossec/integrations/custom-nightshift.ca.
"""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(HERE, "..", "logs", "integrations.log")
CA_FILE = os.path.join(HERE, "custom-nightshift.ca")
TIMEOUT_SECONDS = 10


def log(message):
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"{datetime.now():%Y/%m/%d %H:%M:%S} custom-nightshift: {message}\n")
    except OSError:
        pass


def main(argv):
    if len(argv) < 4:
        log("usage: custom-nightshift <alert_file> <api_key> <hook_url>")
        return 1
    alert_file, token, hook_url = argv[1], argv[2], argv[3]

    with open(alert_file) as f:
        alert = json.load(f)

    request = urllib.request.Request(
        hook_url,
        data=json.dumps(alert).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    context = ssl.create_default_context(cafile=CA_FILE if os.path.exists(CA_FILE) else None)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS, context=context) as response:
            if response.status >= 300:
                log(f"alert {alert.get('id')}: HTTP {response.status}")
    except urllib.error.HTTPError as e:
        log(f"alert {alert.get('id')}: HTTP {e.code} {e.reason}")
        return 1
    except Exception as e:  # network, TLS
        log(f"alert {alert.get('id')}: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
