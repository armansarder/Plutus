import { CashFlowChart, ChartLegend, type ChartSeries } from "./CashFlowChart";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import { centsValue } from "@/services/engine";
import type { EngineComparison, EngineForecast, EngineSimulation } from "@/types/engine";

export function EngineTimeline({ result }: { result: EngineSimulation | EngineForecast }) {
  return <section className="mt-8"><h2 className="font-display text-2xl font-semibold">Important dates</h2>
    <p className="my-3 text-sm text-muted-foreground">Balances after each event, with expenses before same-day income. Hypothetical purchases are simulated, not actual transactions.</p>
    <ul className="divide-y divide-border">{result.transaction_timeline.map(e => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm"><span>{e.description} · {formatDateOnly(e.date)} · {e.id.startsWith("__") ? "Hypothetical" : e.source_status === "estimated" ? "Estimated" : "Confirmed"}</span><span className="font-mono">{formatMoney(centsValue(e.amount))} · Balance {formatMoney(centsValue(e.balance))}</span></li>)}</ul>
    {!result.transaction_timeline.length && <p>No supplied events in this period.</p>}
    <details className="mt-5 text-sm"><summary className="cursor-pointer text-primary">Forecast assumptions</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">{[result.assumptions.snapshot, result.assumptions.same_day_order, result.assumptions.coverage, result.assumptions.currency_precision, ...result.assumptions.missing_information, ...result.assumptions.source_notes].map((text, i) => <li key={i}>{text}</li>)}</ul></details>
  </section>;
}

export function EngineSummary({ result }: { result: EngineSimulation | EngineForecast }) {
  return <div className="panel p-5"><p className="font-semibold">{result.shortfall_occurs ? "A cash shortfall is projected." : "No cash shortfall in the supplied events."}</p><dl className="mt-4 grid gap-4 sm:grid-cols-3">
    <div><dt className="text-sm text-muted-foreground">Starting balance</dt><dd className="font-mono">{formatMoney(centsValue(result.starting_balance))}</dd></div>
    <div><dt className="text-sm text-muted-foreground">Lowest event balance</dt><dd className="font-mono">{formatMoney(centsValue(result.minimum_balance))}</dd><dd className="text-xs">{formatDateOnly(result.minimum_balance_date)}</dd></div>
    <div><dt className="text-sm text-muted-foreground">Ending balance</dt><dd className="font-mono">{formatMoney(centsValue(result.ending_balance))}</dd></div>
  </dl></div>;
}

const colors = ["var(--scenario-now)", "var(--scenario-later)", "var(--brand)"];
export function EngineComparisonChart({ comparison, selected }: { comparison: EngineComparison; selected: string }) {
  // Carry forward server balances for plotting only. No amounts are added or forecasts calculated here.
  const dates = [...new Set(comparison.scenarios.flatMap(s => [s.as_of_date, s.horizon_end, ...s.transaction_timeline.map(e => e.date)]))].sort();
  const series: ChartSeries[] = comparison.scenarios.map((s, i) => {
    let balance = centsValue(s.starting_balance);
    const closing = new Map(s.transaction_timeline.map(e => [e.date, centsValue(e.balance)]));
    return { color: colors[i % colors.length]!, shortName: s.name, result: { id: s.name, lowestBalanceDate: s.minimum_balance_date, lowestBalanceCents: centsValue(s.minimum_balance), dailyBalances: dates.map(date => { balance = closing.get(date) ?? balance; return { date, endOfDayBalanceCents: balance }; }) } };
  });
  return <section className="mt-7 border-y border-border py-6"><h2 className="font-display text-2xl">Compare your choices</h2><p className="my-3 text-sm text-muted-foreground">{formatDateOnly(dates[0]!)} – {formatDateOnly(comparison.horizon_end)} · Event-day closing balances; dots show event-level minimums. The comparison covers all supplied events, not just 30 days.</p><CashFlowChart series={series} events={[]} selectedId={selected} /><ChartLegend series={series} /></section>;
}
