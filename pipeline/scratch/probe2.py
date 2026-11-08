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


# Empty bodies -> Pydantic lists the required fields
show("Purchase {}", requests.post(f"{BASE}/accounts/{checking}/purchases",
                                  params={"key": KEY}, json={}))
show("Transfer {}", requests.post(f"{BASE}/accounts/{checking}/transfers",
                                  params={"key": KEY}, json={}))