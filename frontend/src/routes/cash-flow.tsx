import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, TrendingDown, CalendarClock, House } from "lucide-react";
import { PageHeading } from "@/components/app/PageHeading";
import { useDecision } from "@/components/app/DecisionContext";
import { MetricCard } from "@/components/financial/MetricCard";
import { CashFlowChart, ChartLegend, type ChartMarker } from "@/components/financial/CashFlowChart";
import { CashFlowEvents } from "@/components/financial/CashFlowEvents";
import { YearSoFar } from "@/components/financial/YearSoFar";
import { toSeries, SCENARIO_META } from "@/components/simulator/scenarioMeta";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { snapshotQueryOptions } from "@/services/financial";
import { budgetQueryOptions } from "@/services/budgets";
import { baselineQueryOptions, simulationAdapter } from "@/services/simulation";
import { yearHistoryQueryOptions } from "@/services/history";
import { formatMoney, formatSignedMoney } from "@/lib/formatMoney";
import { formatDateOnly } from "@/lib/dateOnly";
import { DATA_MODE } from "@/services/config";
import { BackendCashFlow } from "@/components/financial/BackendCashFlow";

export const Route = createFileRoute("/cash-flow")({
  loader: async ({ context }) => {
    if (DATA_MODE === "remote") return;
    const snap = await context.queryClient.ensureQueryData(snapshotQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(baselineQueryOptions(snap.snapshotId, snap.startDate)),
      context.queryClient.ensureQueryData(budgetQueryOptions(snap.startDate.slice(0, 7))),
      context.queryClient.ensureQueryData(yearHistoryQueryOptions(Number(snap.startDate.slice(0, 4)))),
    ]);
  },
  head: () => ({ meta: [
    { title: "Cash flow — Plutus" },
    { name: "description", content: "Review available cash-flow records and important dates." },
    { property: "og:title", content: "Cash flow — Plutus" },
    { property: "og:description", content: "See when money comes in, when bills arrive and where things get tight." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: CashFlow,
});

function CashFlow() {
  return DATA_MODE === "remote" ? <BackendCashFlow /> : <DemoCashFlow />;
}
function DemoCashFlow() {
  const { data: snap } = useSuspenseQuery(snapshotQueryOptions);
  const { data: plan } = useSuspenseQuery(budgetQueryOptions(snap.startDate.slice(0, 7)));
  const { data: history } = useSuspenseQuery(yearHistoryQueryOptions(Number(snap.startDate.slice(0, 4))));
  const { request } = useDecision();
  const { data } = useSuspenseQuery({
    queryKey: ["decision-cash-flow", snap.snapshotId, request, plan],
    queryFn: ({ signal }) => request ? simulationAdapter.compareScenarios(request, signal) : baselineQueryOptions(snap.snapshotId, snap.startDate).queryFn({ signal }),
    staleTime: Infinity,
  });
  const [view, setView] = useState<"next30" | "year">("next30");
  const [visible, setVisible] = useState(["baseline", "buy-now", "buy-later"]);
  const [selectedId, setSelectedId] = useState("baseline");
  const [marker, setMarker] = useState<ChartMarker | null>(null);
  const selected = data.results.find((r) => r.id === selectedId) ?? data.results[0];
  if (!selected) return <p role="alert">No cash forecast is available.</p>;

  const bufferCents = request?.bufferCents ?? 20000;
  const payday = selected.appliedEvents.find((e) => e.amountCents > 0);
  const biggest = [...selected.appliedEvents].filter((e) => e.type !== "purchase" && e.amountCents < 0).sort((a, b) => a.amountCents - b.amountCents)[0];
  const series = toSeries(data.results.filter((r) => visible.includes(r.id)));
  const balanceByDate = new Map(selected.dailyBalances.map((d) => [d.date, d.endOfDayBalanceCents]));

  const markers: ChartMarker[] = selected.appliedEvents.map((e) => {
    const dayEnd = balanceByDate.get(e.date) ?? 0;
    const tone: ChartMarker["tone"] = e.amountCents > 0 ? "income" : dayEnd < bufferCents ? "concern" : "payment";
    const detail = e.amountCents > 0
      ? `You're expecting ${formatMoney(e.amountCents)} on this date.`
      : dayEnd < bufferCents
        ? `${e.label} (${formatMoney(-e.amountCents)}) arrives when cash is low — the day ends at ${formatSignedMoney(dayEnd).replace("+", "")}.`
        : `${e.label} is planned for ${formatMoney(-e.amountCents)}. The day ends at ${formatSignedMoney(dayEnd).replace("+", "")}.`;
    return { date: e.date, tone, label: e.label, detail };
  });

  return (
    <div>
      <PageHeading eyebrow="Cash flow" title="A look at what's next." description="Paydays, bills, and the moments in between. These are estimates, not a promise of money to come." />

      <div className="mb-8 inline-flex rounded-lg bg-secondary p-1" role="tablist" aria-label="Cash flow view">
        {([["next30", "Next 30 days"], ["year", "Year so far"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={cn("rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {view === "year" ? (
        <section aria-label="Year so far">
          <h2 className="mb-5 font-display text-2xl font-semibold">Your year so far</h2>
          <YearSoFar history={history} />
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard icon={TrendingDown} label="Lowest projected cash" value={formatMoney(selected.lowestBalanceCents)} hint={formatDateOnly(selected.lowestBalanceDate)} tone={selected.liquidityConcern ? "caution" : "default"} />
            <MetricCard icon={CalendarClock} label="Next expected paycheck" value={payday ? formatMoney(payday.amountCents) : "Unknown"} hint={payday ? `${formatDateOnly(payday.date)} · assumed income` : undefined} />
            <MetricCard icon={House} label="Largest upcoming expense" value={biggest ? formatMoney(-biggest.amountCents) : "Unknown"} hint={biggest ? `${biggest.label} · ${formatDateOnly(biggest.date)}` : undefined} />
          </section>

          <section className="mt-8 border-y border-border py-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold">Your next 30 days</h2>
              <div className="flex flex-wrap gap-4">
                {data.results.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={visible.includes(r.id)} onCheckedChange={(checked) => setVisible((prev) => checked ? [...prev, r.id] : prev.filter((id) => id !== r.id))} />
                    {SCENARIO_META[r.id]?.shortName ?? r.name}
                  </label>
                ))}
              </div>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">{formatDateOnly(data.startDate)} – {formatDateOnly(data.endDate)} · end-of-day estimates · {request ? "Simulated future" : "Expected activity"}</p>
            {series.length ? (
              <div className="bg-card">
                <CashFlowChart series={series} events={selected.appliedEvents} bufferCents={bufferCents} selectedId={selected.id} height={340} markers={markers} onMarkerClick={setMarker} />
              </div>
            ) : <p className="py-20 text-center text-muted-foreground">No scenarios selected.</p>}
            <ChartLegend series={series} />
            <div aria-live="polite">
              {marker && (
                <p className="mt-4 rounded-md bg-primary-soft p-4 text-sm text-foreground">
                  <strong>{formatDateOnly(marker.date, "EEE, MMM d")} — {marker.label}.</strong> {marker.detail}
                </p>
              )}
            </div>
            <p className="mt-5 rounded-md bg-caution-soft p-4 text-sm text-caution-foreground">December's plan and bills are missing. This forecast is incomplete beyond November; a positive balance alone doesn't mean a purchase fits your plan.</p>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">Important dates</h2>
              <div className="flex flex-wrap gap-2">
                {data.results.map((r) => (
                  <Button key={r.id} size="sm" variant={selected.id === r.id ? "default" : "outline"} onClick={() => setSelectedId(r.id)}>{SCENARIO_META[r.id]?.shortName ?? r.name}</Button>
                ))}
              </div>
            </div>
            <CashFlowEvents events={selected.appliedEvents} balances={balanceByDate} />
            <details className="mt-5 text-sm">
              <summary className="cursor-pointer text-primary">Forecast assumptions</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">{selected.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </details>
          </section>
          <Button asChild variant="outline" className="mt-8">
            <Link to="/simulator">{request ? "Change my decision" : "Compare a purchase"}<ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </>
      )}
    </div>
  );
}
