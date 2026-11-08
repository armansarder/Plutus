import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { PageHeading } from "@/components/app/PageHeading";
import { useDecision } from "@/components/app/DecisionContext";
import { BudgetEditor } from "@/components/financial/BudgetEditor";
import { PurchaseScenarioForm } from "@/components/simulator/PurchaseScenarioForm";
import { ScenarioCompareCards } from "@/components/simulator/ScenarioCompareCards";
import { ScenarioCompareTable } from "@/components/simulator/ScenarioCompareTable";
import { validateScenarioForm, type ScenarioFormErrors, type ScenarioFormValues, type ValidScenarioForm } from "@/components/simulator/validateScenarioForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import { snapshotQueryOptions } from "@/services/financial";
import { budgetQueryOptions } from "@/services/budgets";
import { simulationAdapter } from "@/services/simulation";
import { HORIZON_DAYS, type FinancialSnapshot, type ScenarioComparison, type CompareScenariosRequest } from "@/types/financial";
import { DATA_MODE } from "@/services/config";
import { BackendSimulator } from "@/components/simulator/BackendSimulator";
export const Route = createFileRoute("/simulator")({
  validateSearch: z.object({ preset: z.enum(["laptop"]).optional() }),
  loader: async ({ context }) => { if (DATA_MODE === "remote") return; const snap = await context.queryClient.ensureQueryData(snapshotQueryOptions); await context.queryClient.ensureQueryData(budgetQueryOptions(snap.startDate.slice(0, 7))); },
  head: () => ({ meta: [{ title: "Decision simulator — Plutus" }, { name: "description", content: "Compare a hypothetical purchase against your monthly plan, protected savings and cash timing." }, { property: "og:title", content: "Decision simulator — Plutus" }, { property: "og:description", content: "Buy now, wait, or skip it? Explore your choices with synthetic data." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: Simulator,
});
function defaults(snap: FinancialSnapshot, request: CompareScenariosRequest | null): ScenarioFormValues {
  const now = request?.scenarios.find(s => s.id === "buy-now");
  const later = request?.scenarios.find(s => s.id === "buy-later");
  const pay = snap.cashFlows.find(f => f.type === "income" && f.date >= snap.startDate);
  return { label: now?.name ?? "Concert tickets", amount: String((now?.purchaseAmountCents ?? 12000) / 100), categoryId: now?.categoryId ?? "fun", purchaseDate: now?.purchaseDate ?? snap.startDate, altDate: later?.purchaseDate ?? (pay ? addDays(pay.date, 1) : addDays(snap.startDate, 7)), buffer: String((request?.bufferCents ?? 20000) / 100) };
}
function Simulator() {
  return DATA_MODE === "remote" ? <BackendSimulator /> : <DemoSimulator />;
}
function DemoSimulator() {
  const { data: snap } = useSuspenseQuery(snapshotQueryOptions);
  const { data: plan } = useSuspenseQuery(budgetQueryOptions(snap.startDate.slice(0, 7)));
  const { request, setRequest } = useDecision();
  const [values, setValues] = useState(() => defaults(snap, request));
  const [errors, setErrors] = useState<ScenarioFormErrors>({});
  const [selectedId, setSelectedId] = useState("buy-now");
  const [applied, setApplied] = useState<ValidScenarioForm | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mutation = useMutation<ScenarioComparison, Error, ValidScenarioForm>({ mutationFn: v => {
    abortRef.current?.abort(); const ctrl = new AbortController(); abortRef.current = ctrl;
    const next: CompareScenariosRequest = { snapshotId: snap.snapshotId, startDate: snap.startDate, horizonDays: HORIZON_DAYS, bufferCents: v.bufferCents, scenarios: [
      { id: "baseline", name: "Current plan", purchaseAmountCents: 0, purchaseDate: null, categoryId: v.categoryId },
      { id: "buy-now", name: v.label, purchaseAmountCents: v.amountCents, purchaseDate: v.purchaseDate, categoryId: v.categoryId },
      { id: "buy-later", name: v.label, purchaseAmountCents: v.amountCents, purchaseDate: v.altDate, categoryId: v.categoryId },
    ] };
    return simulationAdapter.compareScenarios(next, ctrl.signal).then(data => { setRequest(next); return data; });
  }, onSuccess: (_data, v) => setApplied(v) });
  const run = (v: ScenarioFormValues) => { const res = validateScenarioForm(v, snap.startDate, addDays(snap.startDate, HORIZON_DAYS - 1)); if (!res.ok) { setErrors(res.errors); return; } setErrors({}); mutation.mutate(res.value); };
  // Initial demo comparison and cleanup; explicit edits require Compare choices.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(values); return () => abortRef.current?.abort(); }, []);
  // Recalculate the last submitted purchase when the user approves a plan change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (applied) mutation.mutate(applied); }, [plan]);
  const data = mutation.data;
  const selected = data?.results.find(r => r.id === selectedId);
  return <div><PageHeading eyebrow="Try a decision" title="What if you bought it?" description="Check your plan before you decide. Compare buying now, waiting, or keeping things as they are." />
    <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]"><PurchaseScenarioForm values={values} errors={errors} onChange={setValues} onSubmit={() => run(values)} onReset={() => { const d = defaults(snap, null); setValues(d); setSelectedId("buy-now"); run(d); }} pending={mutation.isPending} minDate={snap.startDate} maxDate={addDays(snap.startDate, HORIZON_DAYS - 1)} categories={plan?.categories ?? []} />
      <div className="min-w-0 space-y-6" aria-live="polite" aria-busy={mutation.isPending}>{mutation.isError && mutation.error.name !== "AbortError" && <p role="alert" className="flex gap-2 text-destructive"><AlertCircle />We couldn't compare these choices. Please try again.</p>}{!data ? <Skeleton className="h-80" /> : <><ScenarioCompareCards results={data.results} selectedId={selectedId} onSelect={setSelectedId} />{selected && <section className="border-y border-border py-6"><h2 className="font-display text-2xl font-semibold">{selected.assessment}</h2><div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">{selected.reasons.map(reason => <p key={reason}>{reason}</p>)}</div>{selected.overBudgetByCents > 0 && plan && selected.budgetMonth === plan.month && <div className="mt-5"><BudgetEditor plan={plan} proposedCategoryId={selected.overBudgetByCents <= Math.max(0, selected.unallocatedCents ?? 0) ? selected.category?.categoryId : undefined} proposedIncreaseCents={selected.overBudgetByCents <= Math.max(0, selected.unallocatedCents ?? 0) ? selected.overBudgetByCents : 0}>{selected.overBudgetByCents <= Math.max(0, selected.unallocatedCents ?? 0) ? `Review moving ${formatMoney(selected.overBudgetByCents)} from unallocated` : "Review my plan"}</BudgetEditor></div>}<details className="mt-5 text-sm"><summary className="cursor-pointer text-primary">Assumptions and things we don't know</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">{[...selected.warnings, ...selected.assumptions].map((a, i) => <li key={i}>{a}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">Fixed calculations from synthetic data, not a bank or AI model.</p></details></section>}<Button asChild><Link to="/cash-flow">See the next 30 days <ArrowRight className="h-4 w-4" /></Link></Button><details><summary className="cursor-pointer text-sm text-primary">Compare all the numbers</summary><div className="mt-4"><ScenarioCompareTable results={data.results} /></div></details></>}</div>
    </div><aside className="mt-10 border-t border-border pt-5 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Future feature</span> · Plutus will eventually explore how investing could fit into your monthly plan. No investing guidance is available in this demo.</aside>
  </div>;
}
