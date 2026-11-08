import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import { cn } from "@/lib/utils";
import type { ScenarioResult } from "@/types/financial";
import { SCENARIO_META } from "./scenarioMeta";

export function ScenarioCompareCards({ results, selectedId, onSelect }: {
  results: ScenarioResult[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Scenarios" className="grid gap-3 md:grid-cols-3">
      {[...results].sort((a, b) => ["buy-now", "buy-later", "baseline"].indexOf(a.id) - ["buy-now", "buy-later", "baseline"].indexOf(b.id)).map((r) => {
        const meta = SCENARIO_META[r.id];
        const selected = r.id === selectedId;
        const negative = r.lowestBalanceCents < 0;
        return (
          <Button variant="outline" key={r.id} type="button" role="radio" aria-checked={selected} onClick={() => onSelect(r.id)}
            className={cn("h-auto min-w-0 flex-col items-stretch whitespace-normal p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "ring-2 ring-ring" : "hover:border-input")}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground" style={{ backgroundColor: meta?.color }}>{meta?.badge}</span>
              <span className="text-sm font-semibold text-foreground">{meta?.shortName ?? r.name}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{r.appliedEvents.find((e) => e.type === "purchase") ? `${formatMoney(-(r.appliedEvents.find((e) => e.type === "purchase")?.amountCents ?? 0))} on ${formatDateOnly(r.appliedEvents.find((e) => e.type === "purchase")?.date ?? r.lowestBalanceDate)}` : "No hypothetical purchase"}</p>
            <div className="mt-3 text-sm font-semibold text-primary">{r.assessment}</div>
            <div className="mt-1 text-xs text-muted-foreground">{r.overBudgetByCents > 0 ? `${formatMoney(r.overBudgetByCents)} over budget` : r.categoryRemainingAfterCents === null ? "Monthly plan unavailable" : `${formatMoney(Math.max(0, r.categoryRemainingAfterCents))} category budget left`}</div>
            <div className="mt-2 text-xs text-muted-foreground">Savings: {r.savingsProtection === "intact" ? "intact" : r.savingsProtection === "unknown" ? "not confirmed" : "allocation change needed"}</div>
            <div className="mt-3 text-xs text-muted-foreground">Lowest projected cash</div>
            <div className={cn("font-mono text-2xl font-semibold tabular", negative ? "text-destructive" : "text-foreground")}>
              {formatMoney(r.lowestBalanceCents)}
            </div>
            <div className="text-xs text-muted-foreground">on {formatDateOnly(r.lowestBalanceDate, "EEE, MMM d")}</div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{r.reasons[0]}</p>
            <div className={cn("mt-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
              negative ? "bg-destructive-soft text-destructive" : "bg-primary-soft text-accent-foreground")}>
              {negative ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
              {r.firstNegativeDate ? `Below $0 from ${formatDateOnly(r.firstNegativeDate)}` : "Stays above $0"}
            </div>
          </Button>
        );
      })}
    </div>
  );
}
