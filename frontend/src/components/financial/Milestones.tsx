import { CheckCircle2 } from "lucide-react";
import type { BudgetPlan } from "@/types/financial";
import type { YearHistory } from "@/types/history";

/**
 * Lightweight milestones from actual demo data: history milestones plus plan setup.
 * Rewards understanding and planning — never wealth or spending volume.
 */
export function Milestones({ plan, history }: { plan: BudgetPlan | null; history: YearHistory }) {
  const items: string[] = [];
  if (plan) items.push(`Set up your ${plan.month} monthly plan`);
  for (const m of [...history.months].reverse()) {
    if (m.milestone && items.length < 4) items.push(m.milestone);
  }
  if (!items.length) return null;

  return (
    <section aria-label="Milestones" className="mt-9">
      <details className="panel p-6" open={false}>
        <summary className="cursor-pointer font-display text-xl font-semibold">Small wins so far</summary>
        <ul className="mt-4 space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">From synthetic demo data.</p>
      </details>
    </section>
  );
}
