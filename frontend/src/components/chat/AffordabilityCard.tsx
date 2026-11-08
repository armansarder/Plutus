import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useDecision } from "@/components/app/DecisionContext";
import { formatMoney } from "@/lib/formatMoney";
import type { AgentResponse } from "@/types/agent";
import { DevilsAdvocate } from "./DevilsAdvocate";

const SAVINGS_LABEL = { intact: "Savings plan stays intact", requires_reallocation: "Savings would need reallocation", unknown: "Savings impact unknown" } as const;

/** Structured affordability answer — every number comes from a real simulation run. */
export function AffordabilityCard({ response }: { response: AgentResponse }) {
  const { setRequest } = useDecision();
  const a = response.affordability;
  if (!a) return null;
  const failed = response.stressTest?.scenarios.some(s => s.outcome !== "within_reserve");
  const headline = a.lowestBalanceCents < 0 ? "I wouldn't buy this right now." : a.assessment === "Cash-flow concern" ? "I'd wait before buying this." : failed || a.assessment === "Stretches your plan" || a.savingsImpact === "requires_reallocation" ? "I'd be cautious about buying this." : a.assessment === "More information needed" || a.categoryRemainingCents === null || a.savingsImpact === "unknown" ? "I don't have enough information to recommend this yet." : "This fits the demo plan in the scenarios we tested.";
  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-xl font-semibold leading-snug">{headline}</h2>
      <h3 className="mt-4 font-semibold">Why Plutus says this</h3>
      <p className="mt-2">At its lowest, your projected balance could fall to {formatMoney(a.lowestBalanceCents)}. {failed ? "Some what-if tests put your cash cushion at risk." : "Check the tested assumptions before committing."} {a.savingsImpact === "unknown" || a.categoryRemainingCents === null ? "We cannot confirm your category budget or protected savings." : SAVINGS_LABEL[a.savingsImpact] + "."}</p>
      <p className="mt-2 text-xs text-muted-foreground">Alex's synthetic demo records, not your connected account.</p>
      <details className="mt-4"><summary className="cursor-pointer font-semibold text-primary">Explore the details</summary>
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
      <DevilsAdvocate response={response} />
      </details>
      <h3 className="mt-4 font-semibold">What you can do instead</h3>
      <p className="mt-2 text-sm">Compare the purchase, waiting, and skipping it to see the calculated tradeoffs.</p>
      {response.simulatorRequest && (
        <Button asChild size="sm" className="mt-4" onClick={() => setRequest(response.simulatorRequest!)}>
          <Link to="/simulator">Compare these options <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      )}
    </div>
  );
}
