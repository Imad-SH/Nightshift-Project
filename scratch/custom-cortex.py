#!/usr/bin/env python3

import sys
import json
import urllib.request
import ssl

def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    alert_file = sys.argv[1]
    with open(alert_file, 'r') as f:
        alert_json = json.load(f)
    
    # Integration block passes hook_url as the 3rd argument
    hook_url = sys.argv[3] if len(sys.argv) > 3 else "http://cortex-backend:8000/api/webhook/wazuh"

    # Forward using native urllib (no dependencies required)
    try:
        req = urllib.request.Request(hook_url)
        req.add_header('Content-Type', 'application/json')
        
        # Bypass SSL verification for local network calls (similar to verify=False)
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        data = json.dumps(alert_json).encode('utf-8')
        
        with urllib.request.urlopen(req, data=data, context=ctx, timeout=5) as response:
            status = response.getcode()
            with open("/var/ossec/logs/integrations.log", "a") as log:
                log.write(f"[{alert_json.get('id')}] Status: {status} - Rule: {alert_json.get('rule', {}).get('id')}\n")
                
    except Exception as e:
        with open("/var/ossec/logs/integrations.log", "a") as log:
            log.write(f"ERROR forwarding alert {alert_json.get('id')}: {str(e)}\n")

if __name__ == "__main__":
    main()
