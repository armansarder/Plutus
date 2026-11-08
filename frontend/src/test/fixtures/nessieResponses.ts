// Synthetic Nessie wire fixtures; forecast computed by the unchanged Python engine.
export const nessieFinancial = {
  "source": "nessie_sandbox",
  "data": {
    "customer_id": "nessie_test_customer",
    "currency": "USD",
    "as_of_date": "2026-11-07",
    "current_balance": "1250.25",
    "upcoming_transactions": [
      {
        "id": "bill_one",
        "date": "2026-11-09",
        "description": "Source-dated bill",
        "amount": "-110.00",
        "type": "expense",
        "source_status": "estimated"
      }
    ],
    "historical_transactions": [],
    "snapshot_basis": "intraday",
    "source_notes": [
      "Nessie sandbox test records; history is not replayed.",
      "Only supplied future bill dates are projected; future income is unknown."
    ]
  }
};

export const nessieForecast = {
  "data": {
    "starting_balance": "1250.25",
    "ending_balance": "1140.25",
    "minimum_balance": "1140.25",
    "minimum_balance_date": "2026-11-09",
    "shortfall_occurs": false,
    "transaction_timeline": [
      {
        "id": "bill_one",
        "date": "2026-11-09",
        "description": "Source-dated bill",
        "amount": "-110.00",
        "type": "expense",
        "source_status": "estimated",
        "balance": "1140.25"
      }
    ],
    "customer_id": "nessie_test_customer",
    "currency": "USD",
    "start_date": "2026-11-08",
    "end_date": "2026-12-07",
    "daily_balances": [
      {
        "date": "2026-11-08",
        "ending_balance": "1250.25"
      },
      {
        "date": "2026-11-09",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-10",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-11",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-12",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-13",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-14",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-15",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-16",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-17",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-18",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-19",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-20",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-21",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-22",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-23",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-24",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-25",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-26",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-27",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-28",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-29",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-11-30",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-12-01",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-12-02",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-12-03",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-12-04",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-12-05",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-12-06",
        "ending_balance": "1140.25"
      },
      {
        "date": "2026-12-07",
        "ending_balance": "1140.25"
      }
    ],
    "negative_balance_days": [],
    "minimum_daily_ending_balance": "1140.25",
    "minimum_daily_ending_balance_date": "2026-11-09",
    "assumptions": {
      "snapshot": "Intraday balance on as_of_date; same-day future events are unsupported.",
      "same_day_order": "Expenses before income, then transaction ID; posting times unknown.",
      "coverage": "Only supplied events are projected; completeness cannot be verified.",
      "estimated_transaction_ids": [
        "bill_one"
      ],
      "missing_information": [
        "intraday posting times",
        "verification of future schedule completeness"
      ],
      "currency_precision": "Two decimal places; no fees, interest, or events inferred.",
      "source_notes": [
        "Nessie sandbox test records; history is not replayed.",
        "Only supplied future bill dates are projected; future income is unknown."
      ]
    }
  }
};
