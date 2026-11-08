import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
BASE = os.getenv("NESSIE_BASE_URL")
ids = json.load(open("pipeline/data/seed_ids.json"))
checking = ids["checking_id"]


def show(label, r):
    print(f"\n=== {label} -> {r.status_code} ===")
    try:
        print(json.dumps(r.json(), indent=2))
    except ValueError:
        print(r.text)


# Balance before
show("Balance BEFORE", requests.get(f"{BASE}/accounts/{checking}", params={"key": KEY}))

# Post ONE deposit dated in the past
show("POST deposit", requests.post(
    f"{BASE}/accounts/{checking}/deposits",
    params={"key": KEY},
    json={
        "medium": "balance",
        "transaction_date": "2026-09-05",
        "status": "completed",
        "amount": 600,
        "description": "Payroll deposit",
    },
))

# Read it back
show("GET deposits", requests.get(f"{BASE}/accounts/{checking}/deposits", params={"key": KEY}))

# Balance after
show("Balance AFTER", requests.get(f"{BASE}/accounts/{checking}", params={"key": KEY}))