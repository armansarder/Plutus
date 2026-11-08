import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useDecision } from "@/components/app/DecisionContext";
import { formatMoney } from "@/lib/formatMoney";
import type { AgentResponse } from "@/types/agent";

const SAVINGS_LABEL = { intact: "Savings plan stays intact", requires_reallocation: "Savings would need reallocation", unknown: "Savings impact unknown" } as const;

/** Structured affordability answer — every number comes from a real simulation run. */
export function AffordabilityCard({ response }: { response: AgentResponse }) {
  const { setRequest } = useDecision();
  const a = response.affordability;
  if (!a) return null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Purchase</dt><dd className="mt-0.5 font-mono tabular text-foreground">{formatMoney(a.purchaseAmountCents)} · {a.purchaseLabel}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Fun budget left</dt><dd className="mt-0.5 font-mono tabular text-foreground">{a.categoryRemainingCents === null ? "Unknown" : formatMoney(a.categoryRemainingCents)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Assessment</dt><dd className="mt-0.5 font-medium text-foreground">{a.assessment}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Lowest projected cash</dt><dd className="mt-0.5 font-mono tabular text-foreground">{formatMoney(a.lowestBalanceCents)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Savings impact</dt><dd className="mt-0.5 text-foreground">{SAVINGS_LABEL[a.savingsImpact]}</dd></div>
      </dl>
      {a.alternatives.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 border-t border-border pt-3 pl-5 text-xs text-muted-foreground">
          {a.alternatives.map((alt) => <li key={alt}>{alt}</li>)}
        </ul>
      )}
      {response.simulatorRequest && (
        <Button asChild size="sm" className="mt-4" onClick={() => setRequest(response.simulatorRequest!)}>
          <Link to="/simulator">Compare these options <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      )}
    </div>
  );
}
