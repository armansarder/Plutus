import type { ChartSeries } from "@/components/financial/CashFlowChart";
import type { ScenarioResult } from "@/types/financial";

export const SCENARIO_META: Record<string, { shortName: string; color: string; dash?: string; badge: string }> = {
  baseline: { shortName: "Skip it", color: "var(--color-scenario-baseline)", dash: "2 4", badge: "A" },
  "buy-now": { shortName: "Buy now", color: "var(--color-scenario-now)", badge: "B" },
  "buy-later": { shortName: "Buy later", color: "var(--color-scenario-later)", dash: "8 4", badge: "C" },
};

export function toSeries(results: ScenarioResult[]): ChartSeries[] {
  return results.map((r) => ({ result: r, ...(SCENARIO_META[r.id] ?? { shortName: r.name, color: "var(--color-foreground)" }) }));
}
