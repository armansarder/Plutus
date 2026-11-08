import { rawRemaining, summarizePlan } from "@/lib/budgetMath";
import { formatMoney } from "@/lib/formatMoney";
import type { BudgetCategory, BudgetPlan } from "@/types/financial";

export function CategoryBar({ category, purchaseCents = 0 }: { category: BudgetCategory; purchaseCents?: number }) {
  const scale = Math.max(1, category.allocatedCents, category.spentCents + category.committedCents + purchaseCents);
  return <div className="budget-bar" data-category={category.categoryId} aria-hidden>
    <span className="budget-spent" style={{ width: `${category.spentCents / scale * 100}%` }} />
    <span className="budget-committed" style={{ width: `${category.committedCents / scale * 100}%` }} />
    <span className="budget-purchase" style={{ width: `${purchaseCents / scale * 100}%` }} />
  </div>;
}

export function BudgetOverview({ plan }: { plan: BudgetPlan }) {
  const summary = summarizePlan(plan);
  return <section className="space-y-5" aria-label="Monthly money plan">
    <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="font-display text-2xl font-semibold">November 2026</h2><p className="text-sm font-semibold text-primary">{summary.unallocated === null ? "Income needs review" : `${formatMoney(summary.unallocated)} not assigned yet`}</p></div>
    {(summary.deficit ?? 0) > 0 && <p role="alert" className="rounded-md bg-caution-soft p-3 text-sm text-caution-foreground">Plan needs adjustment: {formatMoney(summary.deficit ?? 0)} beyond monthly funding and known commitments.</p>}
    <div className="grid gap-4 sm:grid-cols-2">{plan.categories.map((c) => <details key={c.categoryId} className="panel p-5" data-category={c.categoryId}>
      <summary className="cursor-pointer list-none"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="category-dot" aria-hidden /><h3 className="text-base font-semibold">{c.label}</h3></div><p className="mt-1 text-xs text-muted-foreground">{c.kind === "discretionary" ? "Flexible" : c.kind === "savings" ? "Savings" : "Essential"}</p></div><div className="text-right"><p className="text-xl font-semibold">{formatMoney(c.kind === "savings" ? c.allocatedCents : Math.max(0, rawRemaining(c)))}</p><p className="text-xs text-muted-foreground">{c.kind === "savings" ? "planned" : "left"}</p></div></div><div className="my-4"><CategoryBar category={c} /></div><div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>Budget {formatMoney(c.allocatedCents)}</span><span>{c.kind === "savings" ? "Not yet transferred" : `${formatMoney(c.spentCents + c.committedCents)} used or reserved`}</span></div>{rawRemaining(c) < 0 && <p className="mt-2 text-sm text-caution-foreground">{formatMoney(-rawRemaining(c))} over plan</p>}<p className="mt-3 text-xs text-primary">Details</p></summary>
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm text-muted-foreground"><dt>Already spent</dt><dd className="text-right">{formatMoney(c.spentCents)}</dd><dt>Reserved for upcoming costs</dt><dd className="text-right">{formatMoney(c.committedCents)}</dd></dl><p className="mt-3 text-xs text-muted-foreground">{c.kind === "savings" ? "Protected toward your goal. A planned amount does not change checking cash." : "Money left excludes both past spending and upcoming commitments."}</p>
    </details>)}</div>
    <dl className="grid grid-cols-2 gap-4 border-y border-border py-4 text-sm sm:grid-cols-4"><div><dt className="text-muted-foreground">Monthly take-home estimate</dt><dd className="mt-1 font-mono font-semibold">{plan.estimatedNetIncomeCents === null ? "Needs review" : formatMoney(plan.estimatedNetIncomeCents)}</dd></div><div><dt className="text-muted-foreground">Essential allocations</dt><dd className="mt-1 font-mono font-semibold">{formatMoney(summary.essentials)}</dd></div><div><dt className="text-muted-foreground">Flexible allocations</dt><dd className="mt-1 font-mono font-semibold">{formatMoney(summary.discretionary)}</dd></div><div><dt className="text-muted-foreground">Total including savings</dt><dd className="mt-1 font-mono font-semibold">{formatMoney(summary.allocations)}</dd></div></dl>
  </section>;
}