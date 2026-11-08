"""
Transform step: raw Nessie JSON -> clean, analysis-ready outputs.

Reads   pipeline/data/raw/*.json            (written by extract.py)
Writes  pipeline/data/clean/transactions.json      full cleaned history
        pipeline/data/clean/monthly_summary.json   spending/income by month + category
        pipeline/data/clean/recurring.json         detected paychecks, subscriptions, bills
        calculation_engine/private_data/upcoming.json
                                            future schedule in the engine's FinancialData format

Run from the repo root:
    python pipeline/transform.py
    python pipeline/transform.py --as-of 2026-11-07   # testing only; the engine requires today's UTC date
"""
import argparse
import calendar
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from statistics import median

import pandas as pd

RAW = "pipeline/data/raw"
CLEAN = "pipeline/data/clean"
UPCOMING_FILE = "calculation_engine/private_data/upcoming.json"
HORIZON_DAYS = 45
CURRENCY = "USD"

# Merchant categories arrive inconsistently (string or list, any casing).
CATEGORY_MAP = {
    "food": "Food", "restaurant": "Food", "restaurants": "Food", "dining": "Food",
    "groceries": "Groceries", "grocery": "Groceries",
    "transport": "Transport", "gas": "Transport", "fuel": "Transport",
    "shopping": "Shopping", "retail": "Shopping",
    "subscriptions": "Subscriptions", "subscription": "Subscriptions",
    "entertainment": "Subscriptions", "streaming": "Subscriptions",
}

# Bills only carry a nickname, so categorize by keyword.
BILL_KEYWORDS = [
    ("rent", "Housing"), ("mortgage", "Housing"),
    ("electric", "Utilities"), ("water", "Utilities"), ("phone", "Utilities"),
    ("internet", "Utilities"), ("insurance", "Insurance"),
]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def load(name):
    path = os.path.join(RAW, f"{name}.json")
    if not os.path.exists(path):
        print(f"  (missing {path}, treating as empty)")
        return []
    with open(path) as f:
        return json.load(f)


def money(value):
    """Two-decimal string, the format the calculation engine requires."""
    return format(Decimal(str(value)).quantize(Decimal("0.01")), "f")


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-") or "item"


def add_months(d, months):
    """Same day next month(s), clamped to month end (e.g. Jan 31 -> Feb 28)."""
    month_index = d.month - 1 + months
    year, month = d.year + month_index // 12, month_index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def clean_category(raw):
    if isinstance(raw, list):
        raw = raw[0] if raw else None
    if not raw:
        return "Other"
    return CATEGORY_MAP.get(str(raw).strip().lower(), str(raw).strip().title())


def bill_category(nickname):
    name = str(nickname).lower()
    for keyword, category in BILL_KEYWORDS:
        if keyword in name:
            return category
    return "Bills"


def base_row(r, *, id_, date_, amount, source, merchant, category):
    return {
        "id": id_,
        "account_id": r.get("_source_account_id"),
        "account_type": r.get("_source_account_type"),
        "date": date_,
        "amount": float(amount),
        "source": source,
        "merchant": merchant,
        "category": category,
        "description": r.get("description") or r.get("nickname") or "",
        "status": r.get("status", "unknown"),
    }


# --------------------------------------------------------------------------- #
# 1. Normalize each source into one shape
# --------------------------------------------------------------------------- #
def norm_deposits(rows):
    return [base_row(r, id_=r["_id"], date_=r["transaction_date"],
                     amount=abs(r["amount"]), source="deposit",
                     merchant=r.get("description") or "Deposit", category="Income")
            for r in rows]


def norm_withdrawals(rows):
    return [base_row(r, id_=r["_id"], date_=r["transaction_date"],
                     amount=-abs(r["amount"]), source="withdrawal",
                     merchant=r.get("description") or "Withdrawal", category="Cash")
            for r in rows]


def norm_purchases(rows, merchants):
    out = []
    for r in rows:
        m = merchants.get(r.get("merchant_id"), {})
        row = base_row(r, id_=r["_id"], date_=r["purchase_date"],      # NOT transaction_date
                       amount=-abs(r["amount"]), source="purchase",
                       merchant=m.get("name", "Unknown merchant"),
                       category=clean_category(m.get("category")))
        row["merchant_id"] = r.get("merchant_id")
        out.append(row)
    return out


def norm_transfers(rows):
    # Nessie quirk: transfers use "id" (not "_id") and carry no direction,
    # so they are treated as leaving the account they were fetched from.
    return [base_row(r, id_=r.get("id") or r.get("_id"), date_=r["transaction_date"],
                     amount=-abs(r["amount"]), source="transfer",
                     merchant=r.get("description") or "Transfer", category="Transfer")
            for r in rows]


def norm_bills(rows):
    # Only completed bills are history. "recurring" bills are the future schedule.
    return [base_row(r, id_=r["_id"], date_=r["payment_date"],
                     amount=-abs(r["payment_amount"]), source="bill",
                     merchant=r.get("payee") or r.get("nickname") or "Bill",
                     category=bill_category(r.get("nickname", "")))
            for r in rows if r.get("status") == "completed"]


# --------------------------------------------------------------------------- #
# 2. Transfer matching + flags
# --------------------------------------------------------------------------- #
def match_transfers(df):
    """Pair each outgoing transfer with an incoming 'transfer' deposit (same date + amount)."""
    df["is_transfer"] = df["source"].eq("transfer")
    df["transfer_pair_id"] = None
    incoming = df[(df["source"] == "deposit")
                  & df["description"].str.contains("transfer", case=False, na=False)]
    used = set()
    pairs = 0
    for idx, t in df[df["source"] == "transfer"].iterrows():
        match = incoming[(incoming["date"] == t["date"])
                         & (incoming["amount"] == -t["amount"])
                         & (incoming["account_id"] != t["account_id"])
                         & (~incoming.index.isin(used))]
        if not match.empty:
            m_idx = match.index[0]
            used.add(m_idx)
            df.loc[[idx, m_idx], "transfer_pair_id"] = t["id"]
            df.loc[m_idx, ["is_transfer", "category"]] = [True, "Transfer"]
            pairs += 1
    # Any leftover deposit that says "transfer" is still internal money movement.
    leftover = incoming.index.difference(list(used))
    df.loc[leftover, ["is_transfer", "category"]] = [True, "Transfer"]
    return df, pairs


def add_flags(df):
    counted = df["status"].isin(["completed", "pending", "executed"])
    df["is_spending"] = counted & (df["amount"] < 0) & ~df["is_transfer"]
    df["is_income"] = counted & (df["amount"] > 0) & ~df["is_transfer"]
    df["month"] = df["date"].dt.strftime("%Y-%m")
    return df


# --------------------------------------------------------------------------- #
# 3. Monthly summary
# --------------------------------------------------------------------------- #
def monthly_summary(df):
    summary = {}
    for month, g in df.groupby("month"):
        spend = g[g["is_spending"]]
        summary[month] = {
            "spending": round(-spend["amount"].sum(), 2),
            "income": round(g[g["is_income"]]["amount"].sum(), 2),
            "by_category": {cat: round(-amt, 2) for cat, amt in
                            spend.groupby("category")["amount"].sum()
                                 .sort_values().items()},
            "transaction_count": int(len(g)),
        }
    return summary


# --------------------------------------------------------------------------- #
# 4. Recurring detection
# --------------------------------------------------------------------------- #
def detect_paychecks(df, checking_id):
    """Income deposits that repeat on a steady weekly/biweekly/monthly rhythm."""
    found = []
    income = df[df["is_income"] & (df["account_id"] == checking_id)]
    for desc, g in income.groupby("description"):
        dates = sorted(g["date"].dt.date)
        if len(dates) < 3:
            continue
        gap = median((b - a).days for a, b in zip(dates, dates[1:]))
        period = next((p for p in (7, 14, 30) if abs(gap - p) <= 3), None)
        if period is None:
            continue
        found.append({
            "kind": "paycheck", "name": desc, "amount": round(g["amount"].median(), 2),
            "every_days": period if period != 30 else None,
            "every_months": 1 if period == 30 else None,
            "last_date": dates[-1].isoformat(), "occurrences": len(dates),
        })
    return found


def detect_subscriptions(df, checking_id):
    """Same merchant, same amount, roughly monthly -> subscription."""
    found = []
    buys = df[df["is_spending"] & (df["source"] == "purchase")
              & (df["account_id"] == checking_id)]
    for merchant, g in buys.groupby("merchant"):
        if len(g) < 2 or g["amount"].nunique() != 1:
            continue
        dates = sorted(g["date"].dt.date)
        gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
        if all(27 <= gap <= 33 for gap in gaps):
            found.append({
                "kind": "subscription", "name": merchant,
                "amount": round(g["amount"].iloc[0], 2), "every_months": 1,
                "last_date": dates[-1].isoformat(), "occurrences": len(dates),
            })
    return found


def scheduled_bills(raw_bills, checking_id):
    """Nessie bills with status 'recurring' are the known future obligations."""
    found = []
    for b in raw_bills:
        if b.get("status") != "recurring" or b.get("_source_account_id") != checking_id:
            continue
        next_date = b.get("upcoming_payment_date") or b.get("payment_date")
        found.append({
            "kind": "bill", "name": b.get("nickname") or b.get("payee"),
            "payee": b.get("payee"), "amount": -abs(b["payment_amount"]),
            "every_months": 1, "next_date": next_date,
            "recurring_day": b.get("recurring_date"),
        })
    return found


# --------------------------------------------------------------------------- #
# 5. Future schedule in the calculation engine's FinancialData format
# --------------------------------------------------------------------------- #
def project(pattern, as_of, horizon):
    """Yield future dates (strictly after as_of, up to horizon) for one pattern."""
    if pattern["kind"] == "bill":
        d = date.fromisoformat(pattern["next_date"])
        while d <= as_of:                       # stale schedule -> roll forward
            d = add_months(d, 1)
        while d <= horizon:
            yield d
            d = add_months(d, 1)
        return
    last = date.fromisoformat(pattern["last_date"])
    step = (lambda d: d + timedelta(days=pattern["every_days"])) if pattern.get("every_days") \
        else (lambda d: add_months(d, pattern["every_months"]))
    d = step(last)
    while d <= horizon:
        if d > as_of:
            yield d
        d = step(d)


def build_upcoming(patterns, customer_id, checking_balance, as_of):
    horizon = as_of + timedelta(days=HORIZON_DAYS)
    events = []
    for p in patterns:
        prefix = {"bill": "bill", "paycheck": "pay", "subscription": "sub"}[p["kind"]]
        for i, d in enumerate(project(p, as_of, horizon)):
            amount = Decimal(str(p["amount"]))
            if amount == 0:
                continue
            # Nessie-scheduled bill dates are confirmed; everything we predict is estimated.
            confirmed = p["kind"] == "bill" and i == 0
            events.append({
                "id": f"{prefix}-{slug(p['name'])}-{d.isoformat()}",
                "date": d.isoformat(),
                "description": str(p["name"])[:200],
                "amount": money(amount),
                "type": "income" if amount > 0 else "expense",
                "source_status": "confirmed" if confirmed else "estimated",
            })
    events.sort(key=lambda e: (e["date"], e["id"]))
    return {
        "customer_id": customer_id,
        "currency": CURRENCY,
        "as_of_date": as_of.isoformat(),
        "current_balance": money(checking_balance),
        "upcoming_transactions": events,
        "historical_transactions": [],
        "snapshot_basis": "intraday",
        "source_notes": [
            f"Schedule generated by pipeline/transform.py for {as_of.isoformat()} (UTC).",
            "Bills from Nessie recurring schedule; later months extrapolated.",
            "Paychecks and subscriptions predicted from transaction history.",
        ],
    }


def validate_with_engine(payload):
    """Check the schedule against the engine's own strict contract, if available."""
    sys.path.insert(0, os.getcwd())
    try:
        from calculation_engine.models import FinancialData
    except ImportError as exc:
        return f"skipped (could not import engine models: {exc})"
    FinancialData.model_validate(payload)
    return "passed FinancialData contract"


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str, allow_nan=False)
    print(f"  wrote {path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="YYYY-MM-DD (testing only). Default: today in UTC.")
    args = parser.parse_args()
    as_of = (date.fromisoformat(args.as_of) if args.as_of
             else datetime.now(timezone.utc).date())

    customer = load("customer")
    accounts = load("accounts")
    checking = next(a for a in accounts if a["type"] == "Checking")
    merchants = {m["_id"]: m for m in load("merchants")}
    raw_bills = load("bills")

    # 1. normalize + stack
    rows = (norm_deposits(load("deposits")) + norm_withdrawals(load("withdrawals"))
            + norm_purchases(load("purchases"), merchants) + norm_transfers(load("transfers"))
            + norm_bills(raw_bills))
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d")
    before = len(df)
    df = df[df["status"] != "cancelled"].drop_duplicates(subset="id")
    df = df.sort_values(["date", "id"]).reset_index(drop=True)

    # 2. transfers + flags
    df, pairs = match_transfers(df)
    df = add_flags(df)

    # 3. summaries + recurring patterns
    summary = monthly_summary(df)
    patterns = (detect_paychecks(df, checking["_id"])
                + detect_subscriptions(df, checking["_id"])
                + scheduled_bills(raw_bills, checking["_id"]))
    upcoming = build_upcoming(patterns, customer["_id"], checking["balance"], as_of)
    validation = validate_with_engine(upcoming)

    # 4. save
    out = df.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out = out.astype(object).where(out.notna(), None)   # NaN -> null (valid JSON)
    print("\nWriting outputs...")
    save(f"{CLEAN}/transactions.json", out.to_dict(orient="records"))
    save(f"{CLEAN}/monthly_summary.json", summary)
    save(f"{CLEAN}/recurring.json", patterns)
    save(UPCOMING_FILE, upcoming)

    # 5. report
    print(f"\nCleaning log: {before} raw rows -> {len(df)} clean rows, "
          f"{pairs} transfer pair(s) matched")
    print("\nMonth      Spending    Income")
    for month, s in summary.items():
        print(f"{month}   {s['spending']:>9.2f} {s['income']:>9.2f}")
    print("\nRecurring patterns:")
    for p in patterns:
        print(f"  {p['kind']:<13} {p['name']:<25} {p['amount']:>8.2f}")
    print(f"\nUpcoming schedule as of {as_of} (UTC), next {HORIZON_DAYS} days:")
    for e in upcoming["upcoming_transactions"]:
        print(f"  {e['date']}  {e['amount']:>8}  {e['description']:<20} {e['source_status']}")
    print(f"\nEngine contract check: {validation}")


if __name__ == "__main__":
    main()