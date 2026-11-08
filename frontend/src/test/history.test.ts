import { describe, expect, it } from "vitest";
import { demoYearHistory } from "@/mocks/demoYearHistory";
import { demoFinancialSnapshot } from "@/mocks/demoFinancialSnapshot";
import { SyntheticHistoryAdapter } from "@/services/history";
import { yearHistorySchema } from "@/types/history";

describe("year history fixture", () => {
  it("validates against the history contract", () => {
    expect(yearHistorySchema.safeParse(demoYearHistory).success).toBe(true);
  });
  it("is explicitly labeled as generated demo data", () => {
    expect(demoYearHistory.generated).toBe(true);
    expect(demoYearHistory.source).toBe("synthetic_demo");
  });
  it("savings contributions sum to the snapshot's $800 saved to date", () => {
    const total = demoYearHistory.months.reduce((s, m) => s + m.savingsCents, 0);
    expect(total).toBe(demoFinancialSnapshot.savingsGoal?.savedToDateCents);
  });
  it("covers only past months (Jan–Oct 2026)", () => {
    expect(demoYearHistory.months.map((m) => m.month)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });
});

describe("SyntheticHistoryAdapter", () => {
  it("returns a copy, not the fixture", async () => {
    const h = await new SyntheticHistoryAdapter().getYearHistory(2026);
    h.months.pop();
    expect(demoYearHistory.months).toHaveLength(10);
  });
  it("returns an empty, valid history for unknown years", async () => {
    const h = await new SyntheticHistoryAdapter().getYearHistory(2025);
    expect(h.months).toHaveLength(0);
    expect(h.year).toBe(2025);
  });
});
