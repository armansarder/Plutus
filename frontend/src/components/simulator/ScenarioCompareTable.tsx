import { formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import type { ScenarioResult } from "@/types/financial";
import { SCENARIO_META } from "./scenarioMeta";

export function ScenarioCompareTable({ results }: { results: ScenarioResult[] }) {
  const rows: [string, (r: ScenarioResult) => string][] = [
    ["Plan assessment", (r) => r.assessment],
    ["Category remainder", (r) => r.categoryRemainingAfterCents === null ? "Unknown" : formatMoney(r.categoryRemainingAfterCents)],
    ["Savings", (r) => r.savingsProtection],
    ["Budget month", (r) => r.budgetMonth],
    ["Starting balance", (r) => formatMoney(r.startingBalanceCents)],
    ["Lowest balance", (r) => formatMoney(r.lowestBalanceCents)],
    ["Lowest on", (r) => formatDateOnly(r.lowestBalanceDate)],
    ["First below $0", (r) => (r.firstNegativeDate ? formatDateOnly(r.firstNegativeDate) : "None")],
    ["Days below $0", (r) => String(r.daysBelowZero)],
    ["Days below buffer", (r) => String(r.daysBelowBuffer)],
    ["Ending balance", (r) => formatMoney(r.endingBalanceCents)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Side-by-side scenario comparison</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-medium">Metric</th>
            {results.map((r) => <th key={r.id} scope="col" className="py-2 pr-4 text-right font-medium">{SCENARIO_META[r.id]?.shortName ?? r.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-2 pr-4 text-left font-normal text-muted-foreground">{label}</th>
              {results.map((r) => <td key={r.id} className="py-2 pr-4 text-right font-mono tabular text-foreground">{fn(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
