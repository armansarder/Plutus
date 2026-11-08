import os
import json
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
BASE = os.getenv("NESSIE_BASE_URL")
IDS_FILE = "pipeline/data/seed_ids.json"
RAW_DIR = "pipeline/data/raw"

TRANSACTION_TYPES = ["deposits", "withdrawals", "purchases", "transfers", "bills"]

if not KEY or not BASE:
    raise SystemExit("Missing NESSIE_API_KEY or NESSIE_BASE_URL in .env")


def get(path):
    """Single-object endpoints: any error is a real error."""
    r = requests.get(f"{BASE}{path}", params={"key": KEY}, timeout=15)
    r.raise_for_status()
    return r.json()


def get_list(path):
    """List endpoints: a 404 means 'no records', not a real error."""
    r = requests.get(f"{BASE}{path}", params={"key": KEY}, timeout=15)
    if r.status_code == 404:
        print(f"  (404 on {path} -> treating as empty)")
        return []
    r.raise_for_status()
    return r.json()


def save(name, data):
    path = os.path.join(RAW_DIR, f"{name}.json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    count = len(data) if isinstance(data, list) else 1
    print(f"  saved {name:<12} {count:>3} records -> {path}")


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    ids = json.load(open(IDS_FILE))
    customer_id = ids["customer_id"]

    print("Extracting from Nessie...")
    customer = get(f"/customers/{customer_id}")
    accounts = get_list(f"/customers/{customer_id}/accounts")
    save("customer", customer)
    save("accounts", accounts)

    # Pull each transaction type from every account and tag the source account
    for kind in TRANSACTION_TYPES:
        rows = []
        for acct in accounts:
            for rec in get_list(f"/accounts/{acct['_id']}/{kind}"):
                rec["_source_account_id"] = acct["_id"]
                rec["_source_account_type"] = acct["type"]
                rows.append(rec)
        save(kind, rows)

    save("merchants", get_list("/merchants"))

    # Metadata: when and what was extracted
    save("_meta", {
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "customer_id": customer_id,
        "accounts": [a["_id"] for a in accounts],
    })
    print("Done.")


if __name__ == "__main__":
    main()