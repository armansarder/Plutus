import { ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/formatMoney";
import { cn } from "@/lib/utils";
import type { AgentResponse, StressScenario } from "@/types/agent";

const OUTCOME_CLS: Record<StressScenario["outcome"], string> = {
  within_reserve: "bg-accent text-accent-foreground",
  below_reserve: "bg-caution-soft text-caution-foreground",
  negative: "bg-destructive-soft text-destructive",
};
const OUTCOME_LABEL: Record<StressScenario["outcome"], string> = {
  within_reserve: "Within reserve",
  below_reserve: "Below reserve",
  negative: "Goes negative",
};

/** Devil's advocate stress tests — each card is a real simulation run, not a probability. */
export function DevilsAdvocate({ response }: { response: AgentResponse }) {
  const stress = response.stressTest;
  if (!stress) return null;
  return (
    <details className="mt-3 rounded-lg border border-border bg-card p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        We checked a few possibilities.
        <span className="font-normal text-muted-foreground">{stress.summary}</span>
      </summary>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {stress.scenarios.map((s) => (
          <li key={s.id} className="rounded-md border border-border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{s.label}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", OUTCOME_CLS[s.outcome])}>{OUTCOME_LABEL[s.outcome]}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Lowest cash: <span className="font-mono tabular text-foreground">{formatMoney(s.lowestBalanceCents)}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{s.budgetImpact} · {s.savingsImpact}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.explanation}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Tested outcomes from the simulation engine — not a statistical probability of safety.</p>
    </details>
  );
}
