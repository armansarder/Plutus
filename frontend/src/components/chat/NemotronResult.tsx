import { useState } from "react";
import type { NemotronResponse } from "@/types/nemotron";
import { formatMoney } from "@/lib/formatMoney";
import { formatDateOnly } from "@/lib/dateOnly";
import { centsValue } from "@/services/engine";
import { CashFlowChart, type ChartSeries } from "@/components/financial/CashFlowChart";
import { EngineSummary } from "@/components/financial/EngineResults";
import { Button } from "@/components/ui/button";

const LABELS = { baseline: "Without purchase", purchase: "Selected purchase", delayed_income: "Income three days late", unexpected_expense: "Extra $200 expense", buy_later: "Buy later" };
const REASONS = { model_disabled: "Model use was turned off.", model_unavailable: "Nemotron was unavailable or not configured.", model_protocol_failed: "The model investigation did not pass backend validation." };
export function NemotronResult({ response }: { response: NemotronResponse }) {
  const [selected, setSelected] = useState<keyof typeof LABELS>("purchase");
  const [graphOpen, setGraphOpen] = useState(false);
  const summary = response.summary.replace("both stress tests", `${response.stress_tests_total} applicable stress test${response.stress_tests_total === 1 ? "" : "s"}`);
  const scenario = response.scenarios.find(s => s.name === selected)!;
  const series: ChartSeries[] = response.scenarios.filter(s => s.applicable).map((s, i) => ({
    shortName: LABELS[s.name], color: ["var(--brand)", "var(--scenario-now)", "var(--scenario-later)", "var(--color-destructive)", "var(--color-primary)"][i]!,
    result: { id: s.name, lowestBalanceCents: centsValue(s.forecast.minimum_balance), lowestBalanceDate: s.forecast.minimum_balance_date, dailyBalances: s.forecast.daily_balances.map(d => ({ date: d.date, endOfDayBalanceCents: centsValue(d.ending_balance) })) },
  }));
  return <div className="mt-3 space-y-4 rounded-lg border border-border bg-card p-4">
    <p className="font-semibold">{response.mode === "nemotron" ? "Nemotron investigation · Backend-validated result" : "Deterministic fallback · Not a completed Nemotron investigation"}</p>
    {response.fallback_reason && <p className="text-sm text-muted-foreground">{REASONS[response.fallback_reason]} The backend calculation engine completed the analysis.</p>}
    <p className="text-sm">{summary}</p>
    {response.passport.recommendation === "consider_waiting" && response.scenarios.find(s => s.name === "purchase")?.maintains_reserve && <p className="text-sm">The selected purchase preserves the reserve under ordinary conditions but is stress-sensitive. A later ordinary purchase date is not automatically stress-safe.</p>}
    <p className="rounded-md bg-caution-soft p-3 text-sm">Budget affordability cannot yet be determined. Category budgets and protected savings are unavailable. Reserve-preserving cash flow does not establish that a purchase fits your budget.</p>
    <p className="text-sm font-semibold">{response.stress_tests_passed} of {response.stress_tests_total} applicable stress tests maintained your selected reserve.</p>
    <p className="text-xs text-muted-foreground">Tested cases, not a probability. Income is delayed three days; the expense test adds a hypothetical $200. These are assumptions, not actual account events.</p>
    <ul className="grid gap-3 sm:grid-cols-2">{response.scenarios.map(s => <li key={s.name} className="rounded-md border border-border p-3 text-sm"><strong>{LABELS[s.name]}</strong><p>{!s.applicable ? "Not applicable: no eligible income. Excluded from the stress-test count." : s.maintains_reserve ? "Maintains selected reserve" : "Below selected reserve"}</p><p>Lowest event balance: {formatMoney(centsValue(s.forecast.minimum_balance))} on {formatDateOnly(s.forecast.minimum_balance_date)}</p>{s.purchase_date && <p>Purchase date: {formatDateOnly(s.purchase_date)}</p>}</li>)}</ul>
    <div className="flex flex-wrap gap-2">{response.scenarios.map(s => <Button key={s.name} size="sm" variant={selected === s.name ? "default" : "outline"} onClick={() => setSelected(s.name)}>{LABELS[s.name]}</Button>)}</div>
    <EngineSummary result={scenario.forecast} />
    <details onToggle={event => setGraphOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm text-primary">Compare projected balances</summary><p className="my-3 text-xs text-muted-foreground">Daily closes; minimum markers reflect expenses before same-day income. Nonapplicable tests are excluded from the graph.</p>{graphOpen && <CashFlowChart series={series} events={[]} selectedId={selected} />}</details>
    <dl className="space-y-2 text-sm"><div><dt className="font-semibold">Reserve-preserving spending capacity on the selected date</dt><dd>{formatMoney(centsValue(response.safe_to_spend_on_purchase_date))} · Cash-flow capacity only; budget affordability is unknown.</dd></div><div><dt className="font-semibold">Ordinary purchase dates that preserve your reserve</dt><dd>{response.safe_purchase_dates.length ? response.safe_purchase_dates.map(d => formatDateOnly(d)).join(", ") : "No reserve-preserving dates found."}</dd></div></dl>
    <p className="text-xs text-muted-foreground">These dates apply to the ordinary purchase scenario; they have not all been tested against every stress case.</p>
    <details><summary className="cursor-pointer text-sm text-primary">Source and assumptions</summary><p className="mt-3 text-xs">{response.provenance.source === "nessie_sandbox" ? "Nessie sandbox data" : response.provenance.synthetic ? "Synthetic backend data" : "Configured backend source"} · {response.provenance.source} · Snapshot {formatDateOnly(response.provenance.snapshot_as_of)} · Generated {response.provenance.generated_at}. Schedule completeness is not verified.</p><p className="mt-2 text-xs">Snapshot fingerprint: {response.provenance.snapshot_id}. This identifies the snapshot; it is not a signature.</p><ul className="mt-3 list-disc space-y-2 pl-4 text-xs text-muted-foreground">{response.passport.assumptions.map((text, i) => <li key={i}>{text}</li>)}</ul><p className="mt-3 text-xs">No payment executed. No external message sent. {response.trust_shield.model_data_shared ? "A model operation was attempted; provider receipt is not confirmed by this flag." : "No model operation was attempted."}</p></details>
  </div>;
}
