import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CustomerFinancialData } from "@/components/app/CustomerFinancialData";
import { PageHeading } from "@/components/app/PageHeading";
import { useDecision } from "@/components/app/DecisionContext";
import { BackendSource } from "@/components/financial/BackendRecords";
import { EngineSummary, EngineTimeline, EngineComparisonChart } from "@/components/financial/EngineResults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, isDateOnly } from "@/lib/dateOnly";
import { parseDollarsToCents, MAX_PURCHASE_CENTS, formatMoney } from "@/lib/formatMoney";
import { formatDateOnly } from "@/lib/dateOnly";
import { engineAdapter, forecastStart, moneyString, centsValue } from "@/services/engine";
import type { SituationSnapshot } from "@/services/situation";
import type { EnginePurchase } from "@/types/engine";

export function BackendSimulator() {
  return <CustomerFinancialData>{snapshot => <PurchaseCalculator key={`${snapshot.snapshotId}:${snapshot.startingBalanceCents}`} snapshot={snapshot} />}</CustomerFinancialData>;
}
function PurchaseCalculator({ snapshot }: { snapshot: SituationSnapshot }) {
  const start = forecastStart(snapshot), end = addDays(start, 29);
  const nextPay = snapshot.cashFlows.filter(e => e.type === "income" && e.date >= start).sort((a, b) => a.date.localeCompare(b.date))[0];
  const proposedLater = nextPay ? addDays(nextPay.date, 1) : addDays(start, 7);
  const [amount, setAmount] = useState("400");
  const [date, setDate] = useState(start);
  const [later, setLater] = useState(proposedLater <= end ? proposedLater : end);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("Buy now");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const { setEngineDecision } = useDecision();
  const mutation = useMutation({ mutationFn: async (input: { purchase: EnginePurchase; later: string }) => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const purchase = await engineAdapter.simulate(snapshot, input.purchase, controller.signal);
    const comparison = await engineAdapter.compare(snapshot, [
      { ...input.purchase, name: "Buy now" },
      { purchase_amount: input.purchase.purchase_amount, purchase_date: input.later, name: "Buy later" },
      { purchase_amount: "0.00", purchase_date: input.purchase.purchase_date, name: "Skip purchase" },
    ], controller.signal);
    const now = comparison.scenarios.find(s => s.name === "Buy now")!;
    if (JSON.stringify(now.transaction_timeline) !== JSON.stringify(purchase.transaction_timeline) || now.minimum_balance !== purchase.minimum_balance) throw new Error("Snapshot changed");
    setEngineDecision({ snapshotId: snapshot.snapshotId, comparison });
    return { purchase, comparison, input };
  } });
  function submit() {
    const cents = parseDollarsToCents(amount);
    if (cents === null || cents <= 0 || cents > MAX_PURCHASE_CENTS) { setError("Enter a purchase amount from $0.01 to $100,000."); return; }
    if (!isDateOnly(date) || date < start || date > end || !isDateOnly(later) || later <= date || later > end) { setError("Choose dates in the next 30 days, with the alternative after the purchase."); return; }
    setError(""); setSelected("Buy now"); mutation.mutate({ purchase: { purchase_amount: moneyString(cents), purchase_date: date }, later });
  }
  const comparison = !mutation.isError && !mutation.isPending ? mutation.data?.comparison : undefined;
  const result = comparison?.scenarios.find(s => s.name === selected);
  return <div><PageHeading eyebrow={`${snapshot.customer.displayName} · Try a decision`} title="What if you bought it?" description="Compare buying now, buying later or skipping a purchase using your backend records." /><BackendSource snapshot={snapshot} />
    <p className="mb-6 rounded-md bg-caution-soft p-4 text-sm">Budget affordability cannot yet be determined. Category budgets and protected savings are unavailable. A positive checking balance alone does not mean a purchase is affordable.</p>
    <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]"><form className="panel space-y-4 p-5" noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
      <h2 className="font-display text-lg font-semibold">What are you thinking of buying?</h2><p className="text-xs text-muted-foreground">Simulation only. No money moves.</p>
      <div><Label htmlFor="backend-amount">Purchase amount (USD)</Label><Input id="backend-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div><Label htmlFor="backend-date">Purchase date</Label><Input id="backend-date" type="date" min={start} max={end} value={date} onChange={e => setDate(e.target.value)} /></div>
      <div><Label htmlFor="backend-later">Or buy later on</Label><Input id="backend-later" type="date" min={start} max={end} value={later} onChange={e => setLater(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Comparing…" : "Compare choices"}</Button>
    </form><div aria-live="polite" aria-busy={mutation.isPending}>
      {mutation.isPending && <p role="status">Calculating your purchase and alternatives…</p>}
      {mutation.isError && <div role="alert"><p>We couldn't calculate these choices. Check the dates or refresh Current Situation if your records changed. No demo results were substituted.</p><Button className="mt-3" onClick={submit}>Try again</Button></div>}
      {!mutation.data && !mutation.isPending && !mutation.isError && <p className="panel p-6 text-muted-foreground">Enter a purchase to see its effect on your cash.</p>}
      {comparison && result && <><p className="mb-4 text-sm text-muted-foreground">Last completed comparison: {formatMoney(centsValue(mutation.data!.input.purchase.purchase_amount))} purchase on {formatDateOnly(mutation.data!.input.purchase.purchase_date)}, or later on {formatDateOnly(mutation.data!.input.later)}. Edit the form and compare again to update these results.</p><div className="mb-4 flex flex-wrap gap-2">{comparison.scenarios.map(s => <Button key={s.name} variant={s.name === selected ? "default" : "outline"} onClick={() => setSelected(s.name)}>{s.name}</Button>)}</div><h2 className="mb-3 font-display text-2xl">{selected}</h2><EngineSummary result={result} /><EngineComparisonChart comparison={comparison} selected={selected} /><EngineTimeline result={result} /><Button asChild className="mt-6"><Link to="/cash-flow">See cash flow</Link></Button></>}
    </div></div></div>;
}
