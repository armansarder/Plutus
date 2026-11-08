// Synthetic Nessie-shaped test records, calculated by the unchanged Python compare engine.
export const futureLabComparisons = {
  "400.00": {
    "data": {
      "customer_id": "nessie_test_customer",
      "currency": "USD",
      "horizon_end": "2026-11-15",
      "scenarios": [
        {
          "starting_balance": "1250.25",
          "ending_balance": "740.25",
          "minimum_balance": "740.25",
          "minimum_balance_date": "2026-11-09",
          "shortfall_occurs": false,
          "transaction_timeline": [
            {
              "id": "__purchase",
              "date": "2026-11-08",
              "description": "Hypothetical purchase",
              "amount": "-400.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "850.25"
            },
            {
              "id": "bill_one",
              "date": "2026-11-09",
              "description": "Source-dated bill",
              "amount": "-110.00",
              "type": "expense",
              "source_status": "estimated",
              "balance": "740.25"
            }
          ],
          "customer_id": "nessie_test_customer",
          "currency": "USD",
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "400.00",
              "purchase_date": "2026-11-08",
              "name": "Buy now",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Buy now"
        },
        {
          "starting_balance": "1250.25",
          "ending_balance": "740.25",
          "minimum_balance": "740.25",
          "minimum_balance_date": "2026-11-15",
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
            },
            {
              "id": "__purchase",
              "date": "2026-11-15",
              "description": "Hypothetical purchase",
              "amount": "-400.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "740.25"
            }
          ],
          "customer_id": "nessie_test_customer",
          "currency": "USD",
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "400.00",
              "purchase_date": "2026-11-15",
              "name": "Buy later",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Buy later"
        },
        {
          "starting_balance": "1250.25",
          "ending_balance": "1140.25",
          "minimum_balance": "1140.25",
          "minimum_balance_date": "2026-11-09",
          "shortfall_occurs": false,
          "transaction_timeline": [
            {
              "id": "__purchase",
              "date": "2026-11-08",
              "description": "Hypothetical purchase",
              "amount": "0.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "1250.25"
            },
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
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "0.00",
              "purchase_date": "2026-11-08",
              "name": "Skip purchase",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Skip purchase"
        }
      ]
    }
  },
  "100.00": {
    "data": {
      "customer_id": "nessie_test_customer",
      "currency": "USD",
      "horizon_end": "2026-11-15",
      "scenarios": [
        {
          "starting_balance": "1250.25",
          "ending_balance": "1040.25",
          "minimum_balance": "1040.25",
          "minimum_balance_date": "2026-11-09",
          "shortfall_occurs": false,
          "transaction_timeline": [
            {
              "id": "__purchase",
              "date": "2026-11-08",
              "description": "Hypothetical purchase",
              "amount": "-100.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "1150.25"
            },
            {
              "id": "bill_one",
              "date": "2026-11-09",
              "description": "Source-dated bill",
              "amount": "-110.00",
              "type": "expense",
              "source_status": "estimated",
              "balance": "1040.25"
            }
          ],
          "customer_id": "nessie_test_customer",
          "currency": "USD",
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "100.00",
              "purchase_date": "2026-11-08",
              "name": "Buy now",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Buy now"
        },
        {
          "starting_balance": "1250.25",
          "ending_balance": "1040.25",
          "minimum_balance": "1040.25",
          "minimum_balance_date": "2026-11-15",
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
            },
            {
              "id": "__purchase",
              "date": "2026-11-15",
              "description": "Hypothetical purchase",
              "amount": "-100.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "1040.25"
            }
          ],
          "customer_id": "nessie_test_customer",
          "currency": "USD",
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "100.00",
              "purchase_date": "2026-11-15",
              "name": "Buy later",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Buy later"
        },
        {
          "starting_balance": "1250.25",
          "ending_balance": "1140.25",
          "minimum_balance": "1140.25",
          "minimum_balance_date": "2026-11-09",
          "shortfall_occurs": false,
          "transaction_timeline": [
            {
              "id": "__purchase",
              "date": "2026-11-08",
              "description": "Hypothetical purchase",
              "amount": "0.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "1250.25"
            },
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
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "0.00",
              "purchase_date": "2026-11-08",
              "name": "Skip purchase",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Skip purchase"
        }
      ]
    }
  },
  "300.00": {
    "data": {
      "customer_id": "nessie_test_customer",
      "currency": "USD",
      "horizon_end": "2026-11-15",
      "scenarios": [
        {
          "starting_balance": "1250.25",
          "ending_balance": "840.25",
          "minimum_balance": "840.25",
          "minimum_balance_date": "2026-11-09",
          "shortfall_occurs": false,
          "transaction_timeline": [
            {
              "id": "__purchase",
              "date": "2026-11-08",
              "description": "Hypothetical purchase",
              "amount": "-300.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "950.25"
            },
            {
              "id": "bill_one",
              "date": "2026-11-09",
              "description": "Source-dated bill",
              "amount": "-110.00",
              "type": "expense",
              "source_status": "estimated",
              "balance": "840.25"
            }
          ],
          "customer_id": "nessie_test_customer",
          "currency": "USD",
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "300.00",
              "purchase_date": "2026-11-08",
              "name": "Buy now",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Buy now"
        },
        {
          "starting_balance": "1250.25",
          "ending_balance": "840.25",
          "minimum_balance": "840.25",
          "minimum_balance_date": "2026-11-15",
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
            },
            {
              "id": "__purchase",
              "date": "2026-11-15",
              "description": "Hypothetical purchase",
              "amount": "-300.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "840.25"
            }
          ],
          "customer_id": "nessie_test_customer",
          "currency": "USD",
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "300.00",
              "purchase_date": "2026-11-15",
              "name": "Buy later",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Buy later"
        },
        {
          "starting_balance": "1250.25",
          "ending_balance": "1140.25",
          "minimum_balance": "1140.25",
          "minimum_balance_date": "2026-11-09",
          "shortfall_occurs": false,
          "transaction_timeline": [
            {
              "id": "__purchase",
              "date": "2026-11-08",
              "description": "Hypothetical purchase",
              "amount": "0.00",
              "type": "expense",
              "source_status": "confirmed",
              "balance": "1250.25"
            },
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
          "as_of_date": "2026-11-07",
          "horizon_end": "2026-11-15",
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
            ],
            "scenario_changes": {
              "purchase_amount": "0.00",
              "purchase_date": "2026-11-08",
              "name": "Skip purchase",
              "delayed_income": [],
              "unexpected_expenses": []
            }
          },
          "name": "Skip purchase"
        }
      ]
    }
  }
};
