import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
BASE = os.getenv("NESSIE_BASE_URL")
ids = json.load(open("pipeline/data/seed_ids.json"))
checking, savings = ids["checking_id"], ids["savings_id"]


def show(label, r):
    print(f"\n=== {label} -> {r.status_code} ===")
    try:
        print(json.dumps(r.json(), indent=2))
    except ValueError:
        print(r.text)
    return r


def post(path, body):
    return requests.post(f"{BASE}{path}", params={"key": KEY}, json=body)


# 1. Merchant (documented, and needed for the purchase test)
r = show("POST merchant", post("/merchants", {
    "name": "Starbucks",
    "category": "Food",
    "address": {"street_number": "1", "street_name": "Main St",
                "city": "Richardson", "state": "TX", "zip": "75080"},
    "geocode": {"lat": 32.98, "lng": -96.75},
}))
merchant_id = r.json().get("objectCreated", {}).get("_id") if r.ok else None

# 2. Purchase (undocumented: does it work?)
show("POST purchase", post(f"/accounts/{checking}/purchases", {
    "merchant_id": merchant_id,
    "medium": "balance",
    "transaction_date": "2026-09-08",
    "status": "completed",
    "amount": 6,
    "description": "Coffee",
}))

# 3. Transfer (undocumented: does it work?)
show("POST transfer", post(f"/accounts/{checking}/transfers", {
    "medium": "balance",
    "payee_id": savings,
    "transaction_date": "2026-09-20",
    "status": "completed",
    "amount": 100,
    "description": "Transfer to savings",
}))

# 4. Withdrawal (docs show {} so test deposit-style fields)
show("POST withdrawal", post(f"/accounts/{checking}/withdrawals", {
    "medium": "balance",
    "transaction_date": "2026-09-12",
    "status": "completed",
    "amount": 40,
    "description": "ATM withdrawal",
}))