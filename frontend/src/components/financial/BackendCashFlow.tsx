import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CustomerFinancialData } from "@/components/app/CustomerFinancialData";
import { PageHeading } from "@/components/app/PageHeading";
import { useDecision } from "@/components/app/DecisionContext";
import { BackendSource } from "./BackendRecords";
import { CashFlowChart } from "./CashFlowChart";
import { EngineComparisonChart, EngineSummary, EngineTimeline } from "./EngineResults";
import { Button } from "@/components/ui/button";
import { centsValue, engineAdapter } from "@/services/engine";
import type { SituationSnapshot } from "@/services/situation";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";

export function BackendCashFlow() {
  return <CustomerFinancialData>{snapshot => <Forecast key={`${snapshot.snapshotId}:${snapshot.startingBalanceCents}`} snapshot={snapshot} />}</CustomerFinancialData>;
}
function Forecast({ snapshot }: { snapshot: SituationSnapshot }) {
  const [view, setView] = useState<"forecast" | "decision" | "history">("forecast");
  const [selected, setSelected] = useState("Buy now");
  const { engineDecision } = useDecision();
  const comparison = engineDecision?.snapshotId === snapshot.snapshotId && engineDecision.comparison.customer_id === snapshot.customer.displayName && engineDecision.comparison.scenarios.every(s => centsValue(s.starting_balance) === snapshot.startingBalanceCents) ? engineDecision.comparison : null;
  const result = comparison?.scenarios.find(s => s.name === selected);
  const query = useQuery({ queryKey: ["engine-forecast", snapshot], queryFn: ({ signal }) => engineAdapter.forecast(snapshot, signal), retry: false, staleTime: 30000 });
  const forecast = !query.isError ? query.data : undefined;
  return <div><PageHeading eyebrow={`${snapshot.customer.displayName} · Cash flow`} title="A look at what's next." description="Projected balances from your backend records, with expenses before same-day income." /><BackendSource snapshot={snapshot} />
    <p className="mb-6 rounded-md bg-caution-soft p-4 text-sm">Budget affordability cannot yet be determined. Category budgets and protected savings are unavailable. Only supplied events are projected; schedule completeness is not verified.</p>
    <div role="tablist" aria-label="Cash flow view" className="mb-7 flex flex-wrap gap-2">
      <Button role="tab" aria-selected={view === "forecast"} variant={view === "forecast" ? "default" : "outline"} onClick={() => setView("forecast")}>Next 30 days</Button>
      <Button role="tab" aria-selected={view === "decision"} variant={view === "decision" ? "default" : "outline"} onClick={() => setView("decision")} disabled={!comparison}>Last purchase comparison</Button>
      <Button role="tab" aria-selected={view === "history"} variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}>History</Button>
    </div>
    {view === "history" ? <BackendHistory snapshot={snapshot} /> : view === "decision" && comparison && result ? <>
      <div className="mb-4 flex flex-wrap gap-2">{comparison.scenarios.map(s => <Button key={s.name} onClick={() => setSelected(s.name)} variant={selected === s.name ? "default" : "outline"}>{s.name}</Button>)}</div>
      <p className="mb-4 text-sm text-muted-foreground">Last submitted simulation, kept only for this session. Re-run the Simulator after records change.</p><EngineSummary result={result} /><EngineComparisonChart comparison={comparison} selected={selected} /><EngineTimeline result={result} />
    </> : <>
      {query.isPending && <p role="status">Loading your backend cash forecast…</p>}
      {query.isError && <div role="alert"><p>We couldn't load your forecast. No demo results were substituted.</p><Button className="mt-3" onClick={() => void query.refetch()}>Try again</Button></div>}
      {forecast && <><EngineSummary result={forecast} /><section className="mt-8 border-y border-border py-6"><h2 className="font-display text-2xl">Your next 30 days</h2><p className="my-3 text-sm text-muted-foreground">{formatDateOnly(forecast.start_date)} – {formatDateOnly(forecast.end_date)} · Daily closing balances. The minimum marker reflects event order and may be lower than the day's closing balance.</p><CashFlowChart series={[{ shortName: "Backend forecast", color: "var(--brand)", result: { id: "forecast", lowestBalanceDate: forecast.minimum_balance_date, lowestBalanceCents: centsValue(forecast.minimum_balance), dailyBalances: forecast.daily_balances.map(d => ({ date: d.date, endOfDayBalanceCents: centsValue(d.ending_balance) })) } }]} events={[]} /></section><EngineTimeline result={forecast} /></>}
    </>}
  </div>;
}
function BackendHistory({ snapshot }: { snapshot: SituationSnapshot }) {
  const query = useQuery({ queryKey: ["engine-history", snapshot.snapshotId, snapshot.customer.displayName], queryFn: ({ signal }) => engineAdapter.history(snapshot, signal), retry: false, staleTime: 30000 });
  if (query.isPending) return <p role="status">Loading historical records…</p>;
  if (query.isError) return <div role="alert"><h2 className="font-display text-2xl">History is unavailable.</h2><p className="my-3">The backend could not supply historical records. Your forecast is still available in Next 30 days. No demo history has been substituted.</p><Button onClick={() => void query.refetch()}>Try again</Button></div>;
  const history = query.data;
  return <section><h2 className="font-display text-2xl">Your history</h2><p className="my-3 text-sm text-muted-foreground">Historical activity is already reflected in your current balance and is never added to the forecast. Net income is not a protected savings allocation.</p>
    {!history.months.length && <p>No historical records were supplied.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Month</th><th className="p-3">Income</th><th className="p-3">Spending</th><th className="p-3">Net</th></tr></thead><tbody>{history.months.map(m => <tr key={m.month} className="border-t border-border"><td className="p-3">{m.month}</td><td className="p-3 font-mono">{formatMoney(centsValue(m.income))}</td><td className="p-3 font-mono">{formatMoney(centsValue(m.spending))}</td><td className="p-3 font-mono">{formatMoney(centsValue(m.net))}</td></tr>)}</tbody></table></div>
    <h3 className="mt-6 text-lg font-semibold">Historical transactions</h3><ul className="divide-y divide-border">{history.transactions.map(t => <li key={t.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{formatDateOnly(t.date)} · {t.merchant || t.description} · {t.category}{t.is_transfer ? " · Transfer (excluded from spending and income)" : !t.is_income && !t.is_spending ? " · Not counted as posted income/spending" : ""}</span><span className="font-mono">{formatMoney(centsValue(t.amount))}</span></li>)}</ul>{history.notes.map((note, i) => <p key={i} className="mt-3 text-sm text-muted-foreground">{note}</p>)}
  </section>;
}
