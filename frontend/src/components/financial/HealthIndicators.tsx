import { CheckCircle2, CircleAlert, CircleHelp, type LucideIcon } from "lucide-react";
import { healthIndicators, type IndicatorLevel } from "@/lib/health";
import { cn } from "@/lib/utils";
import type { BudgetPlan, ScenarioResult } from "@/types/financial";

const LEVEL_ICON: Record<IndicatorLevel, LucideIcon> = { good: CheckCircle2, caution: CircleAlert, attention: CircleAlert, unknown: CircleHelp };
const LEVEL_CLS: Record<IndicatorLevel, string> = {
  good: "text-accent-foreground",
  caution: "text-caution-foreground",
  attention: "text-destructive",
  unknown: "text-muted-foreground",
};

/** Three plain-language plan indicators with explicit calculations — not a score. */
export function HealthIndicators({ plan, baseline }: { plan: BudgetPlan | null; baseline: ScenarioResult | null }) {
  const indicators = healthIndicators(plan, baseline);
  return (
    <section aria-label="Plan at a glance" className="mt-9">
      <h2 className="mb-4 font-display text-2xl font-semibold">Your plan at a glance</h2>
      <ul className="grid gap-4 sm:grid-cols-3">
        {indicators.map((ind) => {
          const Icon = LEVEL_ICON[ind.level];
          return (
            <li key={ind.id} className="panel p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{ind.label}</p>
                <Icon className={cn("h-4 w-4", LEVEL_CLS[ind.level])} aria-hidden />
              </div>
              <p className={cn("mt-3 text-lg font-semibold", LEVEL_CLS[ind.level])}>{ind.value}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{ind.explanation}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
