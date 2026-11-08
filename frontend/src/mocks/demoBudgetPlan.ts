import type { BudgetPlan } from "@/types/financial";

export const demoBudgetPlan: BudgetPlan = {
  month: "2026-11", currency: "USD", estimatedNetIncomeCents: 320000, approvedByUser: false, provenance: "synthetic_preset", obligationsComplete: true,
  categories: [
    { categoryId: "housing", label: "Rent / Housing", kind: "essential", allocatedCents: 115000, spentCents: 0, committedCents: 115000 },
    { categoryId: "groceries", label: "Food & Groceries", kind: "essential", allocatedCents: 42000, spentCents: 18000, committedCents: 8000 },
    { categoryId: "transport", label: "Transportation", kind: "essential", allocatedCents: 24000, spentCents: 7000, committedCents: 7000 },
    { categoryId: "utilities", label: "Utilities", kind: "essential", allocatedCents: 18000, spentCents: 0, committedCents: 18000 },
    { categoryId: "fun", label: "Fun & Entertainment", kind: "discretionary", allocatedCents: 25000, spentCents: 18000, committedCents: 3000 },
    { categoryId: "subscriptions", label: "Subscriptions", kind: "discretionary", allocatedCents: 7000, spentCents: 2000, committedCents: 5000 },
    { categoryId: "other", label: "Other / Personal", kind: "discretionary", allocatedCents: 19000, spentCents: 4000, committedCents: 0 },
    { categoryId: "savings", label: "Protected savings", kind: "savings", allocatedCents: 60000, spentCents: 0, committedCents: 0 },
  ],
  assumptions: ["Income is an illustrative recurring estimate, not checking cash.", "Food ($80), transport ($70), and subscriptions ($50) are undated earmarks; they are not included in the dated cash forecast.", "December's plan and bills are not available; the 30-day forecast is incomplete beyond November.", "Savings is an allocation, not a completed transfer."], warnings: [],
};