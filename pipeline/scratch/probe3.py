import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
BASE = os.getenv("NESSIE_BASE_URL")
ids = json.load(open("pipeline/data/seed_ids.json"))
checking = ids["checking_id"]
STARBUCKS = "f137aac1-2b34-4c9f-8f90-689d17f1a2fa"


def show(label, r):
    print(f"\n=== {label} -> {r.status_code} ===")
    try:
        print(json.dumps(r.json(), indent=2))
    except ValueError:
        print(r.text)
    return r


# 1. Purchase: try likely date-field names until one is accepted.
#    Rejected attempts create nothing; the first success is a real $6 coffee on 9/8.
for date_field in ["purchase_date", "date"]:
    body = {
        "merchant_id": STARBUCKS,
        "medium": "balance",
        "amount": 6,
        "status": "completed",
        "description": "Coffee",
        date_field: "2026-09-08",
    }
    r = show(f"Purchase with '{date_field}'",
             requests.post(f"{BASE}/accounts/{checking}/purchases",
                           params={"key": KEY}, json=body))
    if r.status_code == 201:
        print(f"\n>>> Purchase date field is: {date_field}")
        break
else:
    print("\n>>> No date field accepted. Purchases may always be dated today.")

# 2. Transfer: only the required fields. This is a real $100 move to savings on 9/20.
show("Transfer (required fields only)",
     requests.post(f"{BASE}/accounts/{checking}/transfers", params={"key": KEY}, json={
         "transaction_date": "2026-09-20",
         "status": "completed",
         "amount": 100,
         "description": "Transfer to savings",
     }))

# 3. Read both back to see the stored shape
show("GET purchases", requests.get(f"{BASE}/accounts/{checking}/purchases", params={"key": KEY}))
show("GET transfers", requests.get(f"{BASE}/accounts/{checking}/transfers", params={"key": KEY}))