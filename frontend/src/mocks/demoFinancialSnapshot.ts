import type { FinancialSnapshot } from "@/types/financial";

/** Invented, synthetic record for the Stage 1 demo. Not returned by Nessie or any bank. */
export const demoFinancialSnapshot: FinancialSnapshot = Object.freeze({
  snapshotId: "plutus-demo-alex-2026-11",
  customer: { displayName: "Alex", persona: "Early-career renter" },
  currency: "USD",
  source: "synthetic_demo",
  startDate: "2026-11-07",
  startingBalanceCents: 180000,
  savingsGoal: { label: "Emergency fund", targetCents: 300000, savedToDateCents: 80000, plannedMonthlyContributionCents: 60000 },
  cashFlows: [
    { id: "rent-nov", date: "2026-11-11", amountCents: -115000, categoryId: "housing", type: "bill", label: "Rent", provenance: "scheduled" },
    { id: "pay-1", date: "2026-11-14", amountCents: 160000, categoryId: null, type: "income", label: "Paycheck", provenance: "assumed" },
    { id: "utility-nov", date: "2026-11-17", amountCents: -18000, categoryId: "utilities", type: "bill", label: "Utilities", provenance: "scheduled" },
    { id: "fun-committed", date: "2026-11-21", amountCents: -3000, categoryId: "fun", type: "expense", label: "Reserved ticket", provenance: "committed" },
    { id: "pay-2", date: "2026-11-28", amountCents: 160000, categoryId: null, type: "income", label: "Paycheck", provenance: "assumed" },
  ],
}) as FinancialSnapshot;
