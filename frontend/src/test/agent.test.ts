import { describe, expect, it } from "vitest";
import { parseQuestion, SyntheticAgentAdapter } from "@/mocks/syntheticAgentAdapter";
import { agentResponseSchema } from "@/types/agent";

describe("parseQuestion", () => {
  it("extracts amounts and labels", () => {
    expect(parseQuestion("Can I afford a $500 laptop?")).toEqual({ amountCents: 50000, label: "Laptop" });
    expect(parseQuestion("Can I buy $300 in concert tickets?")).toEqual({ amountCents: 30000, label: "Concert tickets" });
  });
  it("returns null without an amount or for silly amounts", () => {
    expect(parseQuestion("How can I save more?")).toBeNull();
    expect(parseQuestion("Can I afford a $0 laptop?")).toBeNull();
    expect(parseQuestion("Can I afford a $200000 laptop?")).toBeNull();
  });
});

describe("SyntheticAgentAdapter", () => {
  const agent = new SyntheticAgentAdapter();

  it("answers affordability questions with real simulation results", async () => {
    const res = await agent.ask("Can I afford a $500 laptop?");
    expect(agentResponseSchema.safeParse(res).success).toBe(true);
    expect(res.source).toBe("synthetic_demo");
    expect(res.affordability?.purchaseAmountCents).toBe(50000);
    // $500 laptop: lowest projected cash is $150 on Nov 11 (650 - 500)
    expect(res.affordability?.lowestBalanceCents).toBe(15000);
    expect(res.simulatorRequest?.scenarios).toHaveLength(3);
  });
  it("stress-tests with four real scenarios and counts tested outcomes", async () => {
    const res = await agent.ask("Can I afford a $120 concert ticket?");
    expect(res.stressTest?.scenarios).toHaveLength(4);
    expect(res.stressTest?.summary).toMatch(/^[0-4] of 4 scenarios stayed within your selected reserve\.$/);
    // $120 buy-now leaves $530 lowest — within the $200 reserve
    expect(res.stressTest?.scenarios.find((s) => s.id === "original")?.outcome).toBe("within_reserve");
    // a paycheck 5 days late (Nov 19) still covers rent: lowest cash is $350, within reserve
    const late = res.stressTest?.scenarios.find((s) => s.id === "late-paycheck");
    expect(late?.outcome).toBe("within_reserve");
    expect(late?.lowestBalanceCents).toBe(35000);
  });
  it("flags an over-budget purchase as stretching the plan", async () => {
    const res = await agent.ask("Can I afford a $120 concert ticket?");
    expect(res.affordability?.assessment).toBe("Stretches your plan");
    expect(res.affordability?.savingsImpact).toBe("intact");
  });
  it("gives guidance without fabricating numbers when no amount is present", async () => {
    const res = await agent.ask("How can I save more this month?");
    expect(res.affordability).toBeNull();
    expect(res.stressTest).toBeNull();
    expect(res.simulatorRequest).toBeNull();
  });
});
