// Synthetic test fixtures produced by the existing Python engine; no customer records.
export const financialPayload = {
  "data": {
    "customer_id": "synthetic_demo",
    "currency": "USD",
    "as_of_date": "2026-11-07",
    "current_balance": "800.00",
    "snapshot_basis": "opening",
    "source_notes": [
      "Synthetic backend test schedule"
    ],
    "upcoming_transactions": [
      {
        "id": "backend-bill",
        "date": "2026-11-08",
        "description": "Backend-only expense",
        "amount": "-900.00",
        "type": "expense",
        "source_status": "estimated"
      },
      {
        "id": "backend-pay",
        "date": "2026-11-08",
        "description": "Backend-only income",
        "amount": "1000.00",
        "type": "income",
        "source_status": "confirmed"
      }
    ]
  }
};

export const simulationPayload = {
  "data": {
    "starting_balance": "800.00",
    "ending_balance": "500.00",
    "minimum_balance": "-500.00",
    "minimum_balance_date": "2026-11-08",
    "shortfall_occurs": true,
    "transaction_timeline": [
      {
        "id": "__purchase",
        "date": "2026-11-07",
        "description": "Hypothetical purchase",
        "amount": "-400.00",
        "type": "expense",
        "source_status": "confirmed",
        "balance": "400.00"
      },
      {
        "id": "backend-bill",
        "date": "2026-11-08",
        "description": "Backend-only expense",
        "amount": "-900.00",
        "type": "expense",
        "source_status": "estimated",
        "balance": "-500.00"
      },
      {
        "id": "backend-pay",
        "date": "2026-11-08",
        "description": "Backend-only income",
        "amount": "1000.00",
        "type": "income",
        "source_status": "confirmed",
        "balance": "500.00"
      }
    ],
    "customer_id": "synthetic_demo",
    "currency": "USD",
    "as_of_date": "2026-11-07",
    "horizon_end": "2026-11-08",
    "assumptions": {
      "snapshot": "Opening balance on as_of_date; upcoming events are not yet applied.",
      "same_day_order": "Expenses before income, then transaction ID; posting times unknown.",
      "coverage": "Only supplied events are projected; completeness cannot be verified.",
      "estimated_transaction_ids": [
        "backend-bill"
      ],
      "missing_information": [
        "intraday posting times",
        "verification of future schedule completeness"
      ],
      "currency_precision": "Two decimal places; no fees, interest, or events inferred.",
      "source_notes": [
        "Synthetic backend test schedule"
      ]
    }
  }
};

export const comparisonPayload = {
  "data": {
    "customer_id": "synthetic_demo",
    "currency": "USD",
    "horizon_end": "2026-11-09",
    "scenarios": [
      {
        "starting_balance": "800.00",
        "ending_balance": "500.00",
        "minimum_balance": "-500.00",
        "minimum_balance_date": "2026-11-08",
        "shortfall_occurs": true,
        "transaction_timeline": [
          {
            "id": "__purchase",
            "date": "2026-11-07",
            "description": "Hypothetical purchase",
            "amount": "-400.00",
            "type": "expense",
            "source_status": "confirmed",
            "balance": "400.00"
          },
          {
            "id": "backend-bill",
            "date": "2026-11-08",
            "description": "Backend-only expense",
            "amount": "-900.00",
            "type": "expense",
            "source_status": "estimated",
            "balance": "-500.00"
          },
          {
            "id": "backend-pay",
            "date": "2026-11-08",
            "description": "Backend-only income",
            "amount": "1000.00",
            "type": "income",
            "source_status": "confirmed",
            "balance": "500.00"
          }
        ],
        "customer_id": "synthetic_demo",
        "currency": "USD",
        "as_of_date": "2026-11-07",
        "horizon_end": "2026-11-09",
        "assumptions": {
          "snapshot": "Opening balance on as_of_date; upcoming events are not yet applied.",
          "same_day_order": "Expenses before income, then transaction ID; posting times unknown.",
          "coverage": "Only supplied events are projected; completeness cannot be verified.",
          "estimated_transaction_ids": [
            "backend-bill"
          ],
          "missing_information": [
            "intraday posting times",
            "verification of future schedule completeness"
          ],
          "currency_precision": "Two decimal places; no fees, interest, or events inferred.",
          "source_notes": [
            "Synthetic backend test schedule"
          ],
          "scenario_changes": {
            "purchase_amount": "400.00",
            "purchase_date": "2026-11-07",
            "name": "Buy now",
            "delayed_income": [],
            "unexpected_expenses": []
          }
        },
        "name": "Buy now"
      },
      {
        "starting_balance": "800.00",
        "ending_balance": "500.00",
        "minimum_balance": "-100.00",
        "minimum_balance_date": "2026-11-08",
        "shortfall_occurs": true,
        "transaction_timeline": [
          {
            "id": "backend-bill",
            "date": "2026-11-08",
            "description": "Backend-only expense",
            "amount": "-900.00",
            "type": "expense",
            "source_status": "estimated",
            "balance": "-100.00"
          },
          {
            "id": "backend-pay",
            "date": "2026-11-08",
            "description": "Backend-only income",
            "amount": "1000.00",
            "type": "income",
            "source_status": "confirmed",
            "balance": "900.00"
          },
          {
            "id": "__purchase",
            "date": "2026-11-09",
            "description": "Hypothetical purchase",
            "amount": "-400.00",
            "type": "expense",
            "source_status": "confirmed",
            "balance": "500.00"
          }
        ],
        "customer_id": "synthetic_demo",
        "currency": "USD",
        "as_of_date": "2026-11-07",
        "horizon_end": "2026-11-09",
        "assumptions": {
          "snapshot": "Opening balance on as_of_date; upcoming events are not yet applied.",
          "same_day_order": "Expenses before income, then transaction ID; posting times unknown.",
          "coverage": "Only supplied events are projected; completeness cannot be verified.",
          "estimated_transaction_ids": [
            "backend-bill"
          ],
          "missing_information": [
            "intraday posting times",
            "verification of future schedule completeness"
          ],
          "currency_precision": "Two decimal places; no fees, interest, or events inferred.",
          "source_notes": [
            "Synthetic backend test schedule"
          ],
          "scenario_changes": {
            "purchase_amount": "400.00",
            "purchase_date": "2026-11-09",
            "name": "Buy later",
            "delayed_income": [],
            "unexpected_expenses": []
          }
        },
        "name": "Buy later"
      },
      {
        "starting_balance": "800.00",
        "ending_balance": "900.00",
        "minimum_balance": "-100.00",
        "minimum_balance_date": "2026-11-08",
        "shortfall_occurs": true,
        "transaction_timeline": [
          {
            "id": "__purchase",
            "date": "2026-11-07",
            "description": "Hypothetical purchase",
            "amount": "0.00",
            "type": "expense",
            "source_status": "confirmed",
            "balance": "800.00"
          },
          {
            "id": "backend-bill",
            "date": "2026-11-08",
            "description": "Backend-only expense",
            "amount": "-900.00",
            "type": "expense",
            "source_status": "estimated",
            "balance": "-100.00"
          },
          {
            "id": "backend-pay",
            "date": "2026-11-08",
            "description": "Backend-only income",
            "amount": "1000.00",
            "type": "income",
            "source_status": "confirmed",
            "balance": "900.00"
          }
        ],
        "customer_id": "synthetic_demo",
        "currency": "USD",
        "as_of_date": "2026-11-07",
        "horizon_end": "2026-11-09",
        "assumptions": {
          "snapshot": "Opening balance on as_of_date; upcoming events are not yet applied.",
          "same_day_order": "Expenses before income, then transaction ID; posting times unknown.",
          "coverage": "Only supplied events are projected; completeness cannot be verified.",
          "estimated_transaction_ids": [
            "backend-bill"
          ],
          "missing_information": [
            "intraday posting times",
            "verification of future schedule completeness"
          ],
          "currency_precision": "Two decimal places; no fees, interest, or events inferred.",
          "source_notes": [
            "Synthetic backend test schedule"
          ],
          "scenario_changes": {
            "purchase_amount": "0.00",
            "purchase_date": "2026-11-07",
            "name": "Skip purchase",
            "delayed_income": [],
            "unexpected_expenses": []
          }
        },
        "name": "Skip purchase"
      }
    ]
  }
};

export const forecastPayload = {
  "data": {
    "starting_balance": "800.00",
    "ending_balance": "900.00",
    "minimum_balance": "-100.00",
    "minimum_balance_date": "2026-11-08",
    "shortfall_occurs": true,
    "transaction_timeline": [
      {
        "id": "backend-bill",
        "date": "2026-11-08",
        "description": "Backend-only expense",
        "amount": "-900.00",
        "type": "expense",
        "source_status": "estimated",
        "balance": "-100.00"
      },
      {
        "id": "backend-pay",
        "date": "2026-11-08",
        "description": "Backend-only income",
        "amount": "1000.00",
        "type": "income",
        "source_status": "confirmed",
        "balance": "900.00"
      }
    ],
    "customer_id": "synthetic_demo",
    "currency": "USD",
    "start_date": "2026-11-07",
    "end_date": "2026-12-06",
    "daily_balances": [
      {
        "date": "2026-11-07",
        "ending_balance": "800.00"
      },
      {
        "date": "2026-11-08",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-09",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-10",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-11",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-12",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-13",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-14",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-15",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-16",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-17",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-18",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-19",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-20",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-21",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-22",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-23",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-24",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-25",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-26",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-27",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-28",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-29",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-11-30",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-12-01",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-12-02",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-12-03",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-12-04",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-12-05",
        "ending_balance": "900.00"
      },
      {
        "date": "2026-12-06",
        "ending_balance": "900.00"
      }
    ],
    "negative_balance_days": [],
    "minimum_daily_ending_balance": "800.00",
    "minimum_daily_ending_balance_date": "2026-11-07",
    "assumptions": {
      "snapshot": "Opening balance on as_of_date; upcoming events are not yet applied.",
      "same_day_order": "Expenses before income, then transaction ID; posting times unknown.",
      "coverage": "Only supplied events are projected; completeness cannot be verified.",
      "estimated_transaction_ids": [
        "backend-bill"
      ],
      "missing_information": [
        "intraday posting times",
        "verification of future schedule completeness"
      ],
      "currency_precision": "Two decimal places; no fees, interest, or events inferred.",
      "source_notes": [
        "Synthetic backend test schedule"
      ]
    }
  }
};

export const historyPayload = {
  "data": {
    "customer_id": "synthetic_demo",
    "currency": "USD",
    "as_of_date": "2026-11-07",
    "months": [
      {
        "month": "2026-10",
        "spending": "42.00",
        "income": "100.00",
        "net": "58.00",
        "by_category": [
          {
            "category": "Other",
            "amount": "42.00"
          }
        ],
        "transaction_count": 2
      }
    ],
    "transactions": [],
    "notes": [
      "Historical transactions are already reflected in the current balance."
    ]
  }
};
