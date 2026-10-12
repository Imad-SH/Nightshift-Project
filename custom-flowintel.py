#!/var/ossec/framework/python/bin/python3
import sys
import json
import requests

# Args: alert_file, api_key, hook_url
alert_file = sys.argv[1]
api_key = sys.argv[2]
hook_url = sys.argv[3]

with open(alert_file) as f:
    alert_json = json.load(f)

# Extract core info
rule_id = alert_json.get('rule', {}).get('id', 'N/A')
description = alert_json.get('rule', {}).get('description', 'Wazuh Alert')
agent_name = alert_json.get('agent', {}).get('name', 'Unknown')
rule_level = alert_json.get('rule', {}).get('level', 0)

# FlowIntel v3.1.0 REQUIRES a JSON body for 'POST /api/case/create'
payload = {
    'title': f'Wazuh Alert - Rule {rule_id}',
    'description': f'Agent: {agent_name}\nDescription: {description}\nLevel: {rule_level}',
    'is_private': False,
    'status': 'open'
}

# The API requires X-API-KEY and 'application/json' Content-Type
headers = {
    'X-API-KEY': api_key,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
}

try:
    # Use 'json=' to send the payload in the request body as confirmed by manual tests
    response = requests.post(hook_url, json=payload, headers=headers, timeout=15)
    
    if response.status_code not in [200, 201]:
        # Log error details to stderr for Wazuh manager to capture
        sys.stderr.write(f"❌ HTTP Error: {response.status_code} - {response.text}\n")
        sys.exit(1)
        
    # Success
    sys.exit(0)
except Exception as e:
    sys.stderr.write(f"❌ Exception: {str(e)}\n")
    sys.exit(1)
