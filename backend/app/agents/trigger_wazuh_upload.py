import asyncio
import argparse
import json
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app.agents.agent_investigator import agent_investigator

async def trigger_test(agent_id, file_path):
    print(f"\n--- TRIGGERING WAZUH UPLOAD TEST ---")
    print(f"Target Agent: {agent_id}")
    print(f"Target File:  {file_path}\n")

    observables = {
        "network": [],
        "files": [file_path]
    }
    
    raw_data = {
        "agent": {"id": agent_id, "name": "TEST_MACHINE"},
        "rule": {"description": "Manual WazuhUpload Test Trigger"}
    }

    print("[Step 1/3] Initiating Agent 2 Investigation Pipeline...")
    results = await agent_investigator.run("MANUAL-TEST-WAZUH", observables, raw_data)
    
    print("\n--- TEST RESULTS ---")
    print(json.dumps(results, indent=4))
    
    with open("wazuh_test_result.json", "w") as f:
        json.dump(results, f, indent=4)
    print(f"\n[Done] Results saved to wazuh_test_result.json")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent_id", required=True, help="The numeric ID of the Wazuh Agent")
    parser.add_argument("--file_path", required=True, help="Full path to the file on the agent's PC")
    args = parser.parse_args()
    
    asyncio.run(trigger_test(args.agent_id, args.file_path))
