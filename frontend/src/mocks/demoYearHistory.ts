import type { YearHistory } from "@/types/history";

/**
 * Invented, internally consistent year-to-date history for the demo (Jan–Oct 2026).
 * Monthly savings contributions sum to $800, matching the emergency fund's
 * savedToDateCents in demoFinancialSnapshot. Not Nessie or bank data.
 */
export const demoYearHistory: YearHistory = Object.freeze({
  source: "synthetic_demo",
  generated: true,
  year: 2026,
  months: [
    { month: "2026-01", incomeCents: 320000, spendingCents: 278000, savingsCents: 5000, milestone: null,
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 41000 }, { categoryId: "transport", spentCents: 23000 }, { categoryId: "utilities", spentCents: 19000 }, { categoryId: "fun", spentCents: 26000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 47000 }] },
    { month: "2026-02", incomeCents: 320000, spendingCents: 264000, savingsCents: 7500, milestone: null,
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 39000 }, { categoryId: "transport", spentCents: 22000 }, { categoryId: "utilities", spentCents: 18000 }, { categoryId: "fun", spentCents: 21000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 42000 }] },
    { month: "2026-03", incomeCents: 320000, spendingCents: 271000, savingsCents: 7500, milestone: "Stayed within the grocery budget",
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 40000 }, { categoryId: "transport", spentCents: 24000 }, { categoryId: "utilities", spentCents: 18000 }, { categoryId: "fun", spentCents: 24000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 43000 }] },
    { month: "2026-04", incomeCents: 320000, spendingCents: 259000, savingsCents: 10000, milestone: null,
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 38000 }, { categoryId: "transport", spentCents: 22000 }, { categoryId: "utilities", spentCents: 17000 }, { categoryId: "fun", spentCents: 19000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 41000 }] },
    { month: "2026-05", incomeCents: 320000, spendingCents: 283000, savingsCents: 7500, milestone: null,
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 43000 }, { categoryId: "transport", spentCents: 25000 }, { categoryId: "utilities", spentCents: 18000 }, { categoryId: "fun", spentCents: 28000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 47000 }] },
    { month: "2026-06", incomeCents: 335000, spendingCents: 272000, savingsCents: 10000, milestone: null,
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 41000 }, { categoryId: "transport", spentCents: 23000 }, { categoryId: "utilities", spentCents: 19000 }, { categoryId: "fun", spentCents: 22000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 45000 }] },
    { month: "2026-07", incomeCents: 320000, spendingCents: 268000, savingsCents: 7500, milestone: "Reached $500 in the emergency fund",
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 40000 }, { categoryId: "transport", spentCents: 24000 }, { categoryId: "utilities", spentCents: 20000 }, { categoryId: "fun", spentCents: 20000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 42000 }] },
    { month: "2026-08", incomeCents: 320000, spendingCents: 291000, savingsCents: 10000, milestone: null,
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 44000 }, { categoryId: "transport", spentCents: 26000 }, { categoryId: "utilities", spentCents: 21000 }, { categoryId: "fun", spentCents: 30000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 48000 }] },
    { month: "2026-09", incomeCents: 320000, spendingCents: 262000, savingsCents: 7500, milestone: null,
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 39000 }, { categoryId: "transport", spentCents: 22000 }, { categoryId: "utilities", spentCents: 18000 }, { categoryId: "fun", spentCents: 21000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 40000 }] },
    { month: "2026-10", incomeCents: 320000, spendingCents: 255000, savingsCents: 7500, milestone: "Spent less than in September",
      byCategory: [{ categoryId: "housing", spentCents: 115000 }, { categoryId: "groceries", spentCents: 38000 }, { categoryId: "transport", spentCents: 21000 }, { categoryId: "utilities", spentCents: 17000 }, { categoryId: "fun", spentCents: 18000 }, { categoryId: "subscriptions", spentCents: 7000 }, { categoryId: "other", spentCents: 39000 }] },
  ],
}) as YearHistory;
