import os, json, requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
BASE = os.getenv("NESSIE_BASE_URL")
IDS_FILE = "pipeline/data/seed_ids.json"

def post(path, body):
    r = requests.post(f"{BASE}{path}", params={"key": KEY}, json=body)
    data = r.json()
    print(f"POST {path} -> {r.status_code}")
    print(json.dumps(data, indent=2))
    r.raise_for_status()
    return data

def get_id(resp):
    # Nessie usually wraps the new object; handle both shapes
    obj = resp.get("objectCreated", resp)
    return obj["_id"]

ids = {}

# 1. Customer
cust = post("/customers", {
    "first_name": "Alex",
    "last_name": "Rivera",
    "address": {"street_number": "800", "street_name": "W Campbell Rd",
                "city": "Richardson", "state": "TX", "zip": "75080"}
})
ids["customer_id"] = get_id(cust)

# 2. Accounts
checking = post(f"/customers/{ids['customer_id']}/accounts", {
    "type": "Checking", "nickname": "Alex Checking", "rewards": 0, "balance": 450
})
ids["checking_id"] = get_id(checking)

savings = post(f"/customers/{ids['customer_id']}/accounts", {
    "type": "Savings", "nickname": "Alex Savings", "rewards": 0, "balance": 800
})
ids["savings_id"] = get_id(savings)

# Save IDs so every other script knows who Alex is
with open(IDS_FILE, "w") as f:
    json.dump(ids, f, indent=2)
print("Saved:", ids)