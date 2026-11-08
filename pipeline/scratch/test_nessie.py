import os, requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("NESSIE_API_KEY")
BASE = os.getenv("NESSIE_BASE_URL")

r = requests.get(f"{BASE}/customers", params={"key": KEY})
print(r.status_code, r.json())