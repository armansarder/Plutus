import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, CalendarClock, CheckCircle2, PiggyBank, Wallet } from "lucide-react";
import { PageHeading } from "@/components/app/PageHeading";
import { useDecision } from "@/components/app/DecisionContext";
import { Button } from "@/components/ui/button";
import { deriveAlerts, type AlertStatus, type PlutusAlert } from "@/lib/alerts";
import { cn } from "@/lib/utils";
import { snapshotQueryOptions } from "@/services/financial";
import { budgetQueryOptions } from "@/services/budgets";
import { baselineQueryOptions } from "@/services/simulation";
import { addDays } from "@/lib/dateOnly";
import { HORIZON_DAYS, type FinancialSnapshot } from "@/types/financial";
import { DATA_MODE } from "@/services/config";
import { BackendCustomerPage } from "@/components/app/BackendCustomerPage";

export const Route = createFileRoute("/alerts")({
  loader: async ({ context }) => {
    if (DATA_MODE === "remote") return;
    const snap = await context.queryClient.ensureQueryData(snapshotQueryOptions);
    await Promise.all([
      context.queryClient.ensureQueryData(budgetQueryOptions(snap.startDate.slice(0, 7))),
      context.queryClient.ensureQueryData(baselineQueryOptions(snap.snapshotId, snap.startDate)),
    ]);
  },
  head: () => ({ meta: [
    { title: "Alerts — Plutus" },
    { name: "description", content: "Gentle heads-ups derived from your available plan and cash forecast — before small things become problems." },
    { property: "og:title", content: "Alerts — Plutus" },
    { property: "og:description", content: "Budget, savings and upcoming-bill alerts based on your plan, not just your balance." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Alerts,
});

const STATUS_LABEL: Record<AlertStatus, string> = {
  looking_good: "Looking good",
  worth_checking: "Worth checking",
  needs_attention: "Needs attention",
};
const STATUS_CLS: Record<AlertStatus, string> = {
  looking_good: "bg-accent text-accent-foreground",
  worth_checking: "bg-caution-soft text-caution-foreground",
  needs_attention: "bg-destructive-soft text-destructive",
};
const KIND_ICON = { budget: Wallet, savings: PiggyBank, upcoming_expense: CalendarClock, progress: CheckCircle2 } as const;

function AlertCard({ alert, snap }: { alert: PlutusAlert; snap: FinancialSnapshot }) {
  const { setRequest } = useDecision();
  const Icon = KIND_ICON[alert.kind];
  const explore = () => {
    if (alert.actionTo !== "/simulator") return;
    const categoryId = (alert.categoryId ?? "fun") as "fun";
    const payday = snap.cashFlows.find((e) => e.type === "income" && e.date >= snap.startDate);
    const later = payday ? addDays(payday.date, 1) : addDays(snap.startDate, 7);
    setRequest({
      snapshotId: snap.snapshotId, startDate: snap.startDate, horizonDays: HORIZON_DAYS, bufferCents: 20000,
      scenarios: [
        { id: "baseline", name: "Current plan", purchaseAmountCents: 0, purchaseDate: null, categoryId },
        { id: "buy-now", name: "Concert tickets", purchaseAmountCents: 12000, purchaseDate: snap.startDate, categoryId },
        { id: "buy-later", name: "Concert tickets", purchaseAmountCents: 12000, purchaseDate: later, categoryId },
      ],
    });
  };
  return (
    <li className="panel flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
      <span className="rounded-md bg-secondary p-2.5 text-muted-foreground"><Icon className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{alert.title}</h2>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_CLS[alert.status])}>{STATUS_LABEL[alert.status]}</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{alert.explanation}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to={alert.actionTo} onClick={explore}>{alert.actionLabel} <ArrowRight className="h-4 w-4" /></Link>
      </Button>
    </li>
  );
}

function Alerts() {
  return DATA_MODE === "remote" ? <BackendCustomerPage page="alerts" /> : <DemoAlerts />;
}
function DemoAlerts() {
  const { data: snap } = useSuspenseQuery(snapshotQueryOptions);
  const { data: plan } = useSuspenseQuery(budgetQueryOptions(snap.startDate.slice(0, 7)));
  const { data: baseline } = useSuspenseQuery(baselineQueryOptions(snap.snapshotId, snap.startDate));
  const alerts = deriveAlerts(plan, snap, baseline.results[0] ?? null);
  const attention = alerts.filter((a) => a.status !== "looking_good");

  return (
    <div>
      <PageHeading eyebrow="Alerts" title="A gentle heads-up." description="These come from your plan and cash forecast — not just your balance. Nothing here is random." />
      <p className="mb-6 text-sm text-muted-foreground">Demo alerts · Based on synthetic data</p>
      {alerts.length === 0 ? (
        <p className="panel flex items-center gap-3 p-6 text-sm text-muted-foreground"><Bell className="h-5 w-5" aria-hidden /> Nothing needs your attention right now.</p>
      ) : (
        <>
          {attention.length > 0 && (
            <section aria-label="Needs a look">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Worth a look</h2>
              <ul className="space-y-3">{attention.map((a) => <AlertCard key={a.id} alert={a} snap={snap} />)}</ul>
            </section>
          )}
          {alerts.some((a) => a.status === "looking_good") && (
            <section aria-label="Going well" className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Going well</h2>
              <ul className="space-y-3">{alerts.filter((a) => a.status === "looking_good").map((a) => <AlertCard key={a.id} alert={a} snap={snap} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
