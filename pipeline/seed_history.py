import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
BASE = os.getenv("NESSIE_BASE_URL")
IDS_FILE = "pipeline/data/seed_ids.json"
FLAG_FILE = "pipeline/data/.history_seeded"

if os.path.exists(FLAG_FILE):
    raise SystemExit("History already seeded. Delete pipeline/data/.history_seeded to force (creates duplicates!).")

ids = json.load(open(IDS_FILE))
CHECKING = ids["checking_id"]
SAVINGS = ids["savings_id"]
created = {"merchants": 0, "deposits": 0, "withdrawals": 0,
           "purchases": 0, "transfers": 0, "bills": 0}


# ---------- helpers ----------
def post(path, body, kind):
    r = requests.post(f"{BASE}{path}", params={"key": KEY}, json=body)
    if r.status_code != 201:
        print(f"FAILED {path} -> {r.status_code}: {r.text}")
        r.raise_for_status()
    created[kind] += 1
    return r.json()["objectCreated"]


def get(path):
    r = requests.get(f"{BASE}{path}", params={"key": KEY})
    r.raise_for_status()
    return r.json()


# ---------- 1. merchants (reuse if they already exist) ----------
MERCHANTS = {
    "Starbucks": "Food",
    "Chipotle": "Food",
    "Whataburger": "Food",
    "H-E-B": "Groceries",
    "Shell": "Transport",
    "Amazon": "Shopping",
    "Netflix": "Subscriptions",
    "Spotify": "Subscriptions",
}

existing = {m.get("name"): m["_id"] for m in get("/merchants")}
merchant_ids = {}
for name, category in MERCHANTS.items():
    if name in existing:
        merchant_ids[name] = existing[name]
    else:
        m = post("/merchants", {
            "name": name,
            "category": category,
            "address": {"street_number": "100", "street_name": "Main St",
                        "city": "Richardson", "state": "TX", "zip": "75080"},
            "geocode": {"lat": 32.95, "lng": -96.73},
        }, "merchants")
        merchant_ids[name] = m["_id"]

# ---------- 2. paychecks (9/5 already exists) ----------
for d in ["2026-09-19", "2026-10-03", "2026-10-17", "2026-10-31"]:
    post(f"/accounts/{CHECKING}/deposits", {
        "medium": "balance", "transaction_date": d, "status": "completed",
        "amount": 600, "description": "Payroll deposit",
    }, "deposits")

# ---------- 3. purchases (9/8 Starbucks already exists) ----------
PURCHASES = [
    # September
    ("Chipotle", "2026-09-10", 12, "Lunch"),
    ("H-E-B", "2026-09-14", 65, "Groceries"),
    ("Shell", "2026-09-15", 35, "Gas"),
    ("Starbucks", "2026-09-16", 6, "Coffee"),
    ("Netflix", "2026-09-09", 15, "Netflix subscription"),
    ("Spotify", "2026-09-22", 11, "Spotify subscription"),
    ("Chipotle", "2026-09-24", 13, "Dinner"),
    ("H-E-B", "2026-09-28", 70, "Groceries"),
    # October (the spike)
    ("H-E-B", "2026-10-04", 80, "Groceries"),
    ("Chipotle", "2026-10-06", 14, "Lunch"),
    ("Starbucks", "2026-10-08", 7, "Coffee"),
    ("Netflix", "2026-10-09", 15, "Netflix subscription"),
    ("Chipotle", "2026-10-11", 15, "Dinner"),
    ("Whataburger", "2026-10-12", 11, "Late night food"),
    ("Shell", "2026-10-13", 38, "Gas"),
    ("Amazon", "2026-10-15", 45, "Headphones"),
    ("H-E-B", "2026-10-18", 90, "Groceries"),
    ("Chipotle", "2026-10-19", 14, "Lunch"),
    ("Spotify", "2026-10-22", 11, "Spotify subscription"),
    ("Starbucks", "2026-10-22", 6, "Coffee"),
    ("Whataburger", "2026-10-25", 12, "Late night food"),
    ("H-E-B", "2026-10-30", 75, "Groceries"),
    # November (so far)
    ("Shell", "2026-11-02", 36, "Gas"),
    ("Starbucks", "2026-11-03", 6, "Coffee"),
    ("Chipotle", "2026-11-04", 13, "Lunch"),
    ("H-E-B", "2026-11-06", 60, "Groceries"),
]
for merchant, d, amount, desc in PURCHASES:
    post(f"/accounts/{CHECKING}/purchases", {
        "merchant_id": merchant_ids[merchant], "medium": "balance",
        "purchase_date": d, "amount": amount, "status": "completed",
        "description": desc,
    }, "purchases")

# ---------- 4. ATM withdrawal (9/12 already exists) ----------
post(f"/accounts/{CHECKING}/withdrawals", {
    "medium": "balance", "transaction_date": "2026-10-25", "status": "completed",
    "amount": 60, "description": "ATM withdrawal",
}, "withdrawals")

# ---------- 5. transfers to savings (9/20 already exists) ----------
# Nessie stores no direction on transfers, so also record the savings side
# as a deposit. The pipeline later matches these pairs and excludes both from spending.
post(f"/accounts/{CHECKING}/transfers", {
    "transaction_date": "2026-10-20", "status": "completed",
    "amount": 100, "description": "Transfer to savings",
}, "transfers")
for d in ["2026-09-20", "2026-10-20"]:
    post(f"/accounts/{SAVINGS}/deposits", {
        "medium": "balance", "transaction_date": d, "status": "completed",
        "amount": 100, "description": "Transfer from checking",
    }, "deposits")

# ---------- 6. bills ----------
# Past payments: status "completed".
PAID_BILLS = [
    ("Campus Apartments", "Rent", ["2026-09-01", "2026-10-01", "2026-11-01"], 900),
    ("TXU Energy", "Electric bill", ["2026-09-10"], 78),
    ("TXU Energy", "Electric bill", ["2026-10-10"], 92),
    ("T-Mobile", "Phone bill", ["2026-09-12", "2026-10-12"], 45),
    ("GEICO", "Car insurance", ["2026-09-13", "2026-10-13"], 180),
]
for payee, nickname, dates, amount in PAID_BILLS:
    for d in dates:
        post(f"/accounts/{CHECKING}/bills", {
            "status": "completed", "payee": payee, "nickname": nickname,
            "payment_date": d, "recurring_date": int(d[-2:]),
            "payment_amount": amount,
        }, "bills")

# Future schedule: status "recurring", payment_date = next due date.
RECURRING_BILLS = [
    ("Campus Apartments", "Rent", "2026-12-01", 1, 900),
    ("TXU Energy", "Electric bill", "2026-11-10", 10, 80),
    ("T-Mobile", "Phone bill", "2026-11-12", 12, 45),
    ("GEICO", "Car insurance", "2026-11-13", 13, 180),
]
for payee, nickname, next_date, day, amount in RECURRING_BILLS:
    post(f"/accounts/{CHECKING}/bills", {
        "status": "recurring", "payee": payee, "nickname": nickname,
        "payment_date": next_date, "recurring_date": day,
        "payment_amount": amount,
    }, "bills")

# ---------- save ----------
ids["merchants"] = merchant_ids
with open(IDS_FILE, "w") as f:
    json.dump(ids, f, indent=2)
open(FLAG_FILE, "w").write("done")

print("\nSeeded:", json.dumps(created, indent=2))