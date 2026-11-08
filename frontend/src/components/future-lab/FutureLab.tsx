import { useEffect, useRef, useState } from "react";
import { ArrowRight, FlaskConical, GitBranch, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/app/PageHeading";
import { CustomerFinancialData } from "@/components/app/CustomerFinancialData";
import { BackendSource } from "@/components/financial/BackendRecords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DATA_MODE } from "@/services/config";
import { centsValue, forecastStart } from "@/services/engine";
import { balanceAt, compareFutures, eventDates, FUTURES, reserveBreach, validateFutureLab, type FutureLabForm, type FutureLabResult, type FutureName } from "@/services/futureLab";
import { futureLabCouncil, type FutureLabCouncilRequest } from "@/services/futureLabCouncil";
import type { SituationSnapshot } from "@/services/situation";
import { addDays, formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import { FutureLabChart, FUTURE_COLORS } from "./FutureLabChart";

type ComparisonState = { key: string; phase: "waiting" | "loading" | "error" } | { key: string; phase: "ready"; result: FutureLabResult };

export function FutureLab() {
  if (DATA_MODE !== "remote") return <div><PageHeading eyebrow="Financial Multiverse" title="Your Future Lab." description="Three choices. One shared financial snapshot." /><div className="panel p-6"><p className="font-semibold">Connect the backend to explore these futures.</p><p className="mt-3 text-muted-foreground">Future Lab requires the Python comparison engine and is unavailable in Alex demo mode. No mock trajectories are substituted. Your existing demo Simulator remains available.</p></div></div>;
  return <CustomerFinancialData>{snapshot => <ConnectedFutureLab snapshot={snapshot} />}</CustomerFinancialData>;
}

function ConnectedFutureLab({ snapshot }: { snapshot: SituationSnapshot }) {
  // Re-scope the lab when its source snapshot changes; no history is persisted.
  const scope = JSON.stringify([snapshot.snapshotId, snapshot.startingBalanceCents, snapshot.cashFlows, snapshot.backend]);
  return <Workspace key={scope} snapshot={snapshot} />;
}

function Workspace({ snapshot }: { snapshot: SituationSnapshot }) {
  const start = forecastStart(snapshot);
  const [form, setForm] = useState<FutureLabForm>({ amount: "400", purchaseDate: start, comparisonDate: addDays(start, 7), reserve: "200" });
  const [selected, setSelected] = useState<FutureName>("Buy now");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<ComparisonState>({ key: "", phase: "waiting" });
  const generation = useRef(0);
  const validated = validateFutureLab(form, snapshot);
  const requestKey = JSON.stringify([form, retry]);
  const input = validated.input;
  useEffect(() => {
    const current = ++generation.current;
    if (!input) return;
    const controller = new AbortController();
    setState({ key: requestKey, phase: "waiting" });
    const timer = setTimeout(() => {
      setState({ key: requestKey, phase: "loading" });
      compareFutures(snapshot, input, controller.signal).then(result => {
        if (!controller.signal.aborted && generation.current === current) setState({ key: requestKey, phase: "ready", result });
      }).catch(() => {
        if (!controller.signal.aborted && generation.current === current) setState({ key: requestKey, phase: "error" });
      });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
    // requestKey captures raw edits (including invalid inputs); abort immediately, debounce network work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, snapshot]);

  // Hide old outcomes as soon as fields change, before the next effect or response.
  const result = state.key === requestKey && state.phase === "ready" && input ? state.result : null;
  const failed = state.key === requestKey && state.phase === "error";
  const dates = result ? eventDates(result.comparison) : [];
  const date = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[0] ?? start;
  const scenario = result?.comparison.scenarios.find(s => s.name === selected);
  const breach = scenario && result ? reserveBreach(scenario, result.input.reserve) : null;
  const councilRequest: FutureLabCouncilRequest | null = result && scenario ? { schemaVersion: "future-lab-draft-1", snapshotId: snapshot.snapshotId, selectedFuture: selected, input: result.input, evidence: scenario } : null;
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const set = (key: keyof FutureLabForm) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(old => ({ ...old, [key]: event.target.value }));

  return <div>
    <section className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-primary-soft p-6 sm:p-9">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-8 h-64 w-64 rounded-full border-[24px] border-primary/5" />
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><FlaskConical className="h-4 w-4" />Financial Multiverse · Future Lab</p>
      <h1 className="max-w-xl font-display text-4xl font-semibold text-brand sm:text-5xl">One decision.<br />Three possible futures<span className="text-destructive">.</span></h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">Explore the cash-flow consequences before you choose. Every balance comes from the Python engine using {snapshot.customer.displayName}'s selected backend records.</p>
    </section>
    <BackendSource snapshot={snapshot} />
    <form className="panel mb-7 p-5" noValidate onSubmit={event => { event.preventDefault(); if (input) setRetry(n => n + 1); }}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><Label htmlFor="lab-amount">Purchase amount (USD)</Label><Input id="lab-amount" inputMode="decimal" autoComplete="off" value={form.amount} onChange={set("amount")} /></div>
        <div><Label htmlFor="lab-date">Purchase date</Label><Input id="lab-date" type="date" min={start} max={addDays(start, 89)} value={form.purchaseDate} onChange={set("purchaseDate")} /></div>
        <div><Label htmlFor="lab-later">Comparison date (buy later)</Label><Input id="lab-later" type="date" min={start} max={addDays(start, 89)} value={form.comparisonDate} onChange={set("comparisonDate")} /></div>
        <div><Label htmlFor="lab-reserve">Minimum cash reserve (USD)</Label><Input id="lab-reserve" inputMode="decimal" autoComplete="off" value={form.reserve} onChange={set("reserve")} /></div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Pausing an edit automatically recomputes all three futures. Reserve is a threshold applied to returned balances, not a fee or an engine-generated spending allowance.</p>
      {validated.error && <p role="alert" className="mt-3 text-sm text-destructive">{validated.error}</p>}
    </form>
    <p className="mb-6 flex gap-3 rounded-lg bg-caution-soft p-4 text-sm text-caution-foreground"><ShieldCheck className="h-5 w-5 shrink-0" />Preserving your cash reserve does not establish budget affordability. Category budgets and protected savings may be unavailable. These are hypothetical futures from an incomplete schedule, not promises.</p>
    {!result && input && !failed && <div role="status" className="panel flex min-h-64 items-center justify-center gap-3 p-8 text-muted-foreground"><GitBranch className="h-5 w-5 animate-pulse" />Comparing your three futures… Previous results are hidden while inputs change.</div>}
    {failed && <div role="alert" className="panel p-6"><h2 className="font-display text-2xl">These futures couldn't be calculated.</h2><p className="my-3 text-muted-foreground">Check the dates or refresh Current Situation if the backend snapshot changed. No demo or stale balances were substituted.</p><Button onClick={() => setRetry(n => n + 1)}>Try again</Button></div>}
    {result && scenario && <>
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Choose a financial future">
        {FUTURES.map((name, index) => {
          const future = result.comparison.scenarios.find(s => s.name === name)!;
          const maintains = centsValue(future.minimum_balance) >= centsValue(result.input.reserve);
          return <button key={name} type="button" aria-pressed={selected === name} aria-label={`Explore ${name}`} onClick={() => { setSelected(name); setHandoffMessage(null); }} className={`panel relative overflow-hidden p-6 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === name ? "ring-2 ring-primary" : ""}`}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: FUTURE_COLORS[name] }} />
            <p className="text-xs font-semibold text-muted-foreground">FUTURE 0{index + 1} · Hypothetical</p><h2 className="mt-2 font-display text-2xl font-semibold">{name}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{name === "Skip purchase" ? "No hypothetical purchase. Existing supplied events still affect your cash." : `Apply the same ${formatMoney(centsValue(result.input.purchaseAmount))} purchase on ${formatDateOnly(name === "Buy now" ? result.input.purchaseDate : result.input.comparisonDate)}.`}</p>
            <p className={`mt-4 text-xs font-semibold ${maintains ? "text-primary" : "text-destructive"}`}>{maintains ? "Maintains this cash reserve in supplied events" : "Falls below this cash reserve"}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Lowest event balance</dt><dd className="mt-1 font-mono text-lg">{formatMoney(centsValue(future.minimum_balance))}</dd><dd className="text-xs text-muted-foreground">{formatDateOnly(future.minimum_balance_date)}</dd></div><div><dt className="text-xs text-muted-foreground">Ending balance</dt><dd className="mt-1 font-mono text-lg">{formatMoney(centsValue(future.ending_balance))}</dd></div></dl>
          </button>;
        })}
      </section>
      <section className="panel mt-7 p-4 sm:p-6" aria-label="Financial multiverse timeline">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl font-semibold">Follow the branches.</h2><p className="mt-2 text-xs text-muted-foreground">{formatDateOnly(result.comparison.scenarios[0]!.as_of_date)} – {formatDateOnly(result.comparison.horizon_end)} · All supplied events, not a fixed 30-day horizon.</p></div><span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{selected} selected</span></div>
        <FutureLabChart result={result} selected={selected} date={date} onDate={setSelectedDate} />
        <p className="mt-4 text-xs text-muted-foreground">Lines carry forward backend-returned event-day closing balances. Dots show event-level minima, which can be lower than a same-day close. Daily scenario forecasts and arbitrary horizon trimming are not provided by this API.</p>
        <div className="mt-6 grid items-end gap-4 border-t border-border pt-5 sm:grid-cols-[1fr_180px]"><div><Label htmlFor="lab-scrub">Scrub the event timeline</Label><input id="lab-scrub" aria-valuetext={formatDateOnly(date)} type="range" min={0} max={Math.max(0, dates.length - 1)} step={1} value={Math.max(0, dates.indexOf(date))} onChange={event => setSelectedDate(dates[Number(event.target.value)] ?? date)} className="mt-3 w-full accent-primary" /></div><div><Label htmlFor="lab-inspect">Inspect date</Label><select id="lab-inspect" className="mt-2 w-full rounded-md border border-input bg-background p-2 text-sm" value={date} onChange={event => setSelectedDate(event.target.value)}>{dates.map(day => <option key={day} value={day}>{formatDateOnly(day, "MMM d, yyyy")}</option>)}</select></div></div>
      </section>
      <section className="mt-7 grid gap-5 lg:grid-cols-[1fr_320px]" aria-label="Selected future evidence">
        <div className="panel p-6"><h2 className="font-display text-2xl font-semibold">{selected} · {formatDateOnly(date)}</h2><p className="mt-2 text-sm text-muted-foreground">{date === scenario.as_of_date && snapshot.backend?.basis === "intraday" ? "Snapshot-day point; same-day remaining postings are unknown." : "Balance after the last supplied event on or before this date."}</p>
          <output aria-live="polite" className="mt-3 block font-mono text-3xl" data-testid="inspected-balance">{formatMoney(centsValue(balanceAt(scenario, date)))}</output>
          <ul className="mt-5 divide-y divide-border">{scenario.transaction_timeline.filter(event => event.date === date && !(selected === "Skip purchase" && event.id === "__purchase")).map(event => <li key={event.id} className="py-3 text-sm"><p className="font-semibold">{event.description}</p><p className="mt-1 text-muted-foreground">{event.id === "__purchase" ? "Hypothetical purchase" : event.source_status === "estimated" ? "Estimated source event" : "Confirmed by source"} · {formatMoney(centsValue(event.amount))} · After event: {formatMoney(centsValue(event.balance))}{centsValue(event.balance) < centsValue(result.input.reserve) ? " · Below reserve" : ""}</p></li>)}</ul>
          {!scenario.transaction_timeline.some(event => event.date === date && !(selected === "Skip purchase" && event.id === "__purchase")) && <p className="mt-4 text-sm text-muted-foreground">No supplied events on this selected date. This does not establish that no other spending occurs.</p>}
          {breach ? <div className="mt-5 rounded-md bg-caution-soft p-4 text-sm"><p className="font-semibold">First reserve breach · {formatDateOnly(breach.date)}</p><p className="mt-1">{breach.label}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setSelectedDate(breach.date)}>Inspect reserve breach</Button></div> : <p className="mt-5 text-sm text-primary">No reserve breach in the supplied events. Budget affordability remains undetermined.</p>}
          <Button className="mt-4" variant="outline" size="sm" onClick={() => setSelectedDate(scenario.minimum_balance_date)}>Inspect lowest balance</Button>
        </div>
        <aside className="panel p-6"><GitBranch className="h-6 w-6 text-primary" /><h2 className="mt-3 font-display text-xl font-semibold">Take this future to the Council.</h2><p className="mt-3 text-sm text-muted-foreground">Selected: <strong className="text-foreground">{selected}</strong>. The handoff will include your confirmed purchase fields, reserve and this scenario's backend evidence.</p><Button className="mt-5 w-full" disabled={!futureLabCouncil.available || !councilRequest} aria-describedby="council-unavailable" onClick={() => { if (councilRequest) void futureLabCouncil.send(councilRequest).then(() => setHandoffMessage("Council delivery is unavailable. Nothing was sent.")).catch(() => setHandoffMessage("Council delivery failed. No successful handoff was confirmed.")); }}>Send selected future to Council <ArrowRight className="h-4 w-4" /></Button><p id="council-unavailable" className="mt-3 text-xs text-muted-foreground">{futureLabCouncil.unavailableReason}</p>{handoffMessage && <p role="status" className="mt-3 text-sm">{handoffMessage}</p>}</aside>
      </section>
      <details className="mt-7 border-t border-border pt-5 text-sm"><summary className="cursor-pointer font-semibold text-primary">What these futures include</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">{[scenario.assumptions.snapshot, scenario.assumptions.same_day_order, scenario.assumptions.coverage, ...scenario.assumptions.missing_information, ...scenario.assumptions.source_notes].map((text, i) => <li key={i}>{text}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">Existing history is already reflected in the snapshot. No payments, messages or Council requests have been executed by this page.</p></details>
    </>}
  </div>;
}
