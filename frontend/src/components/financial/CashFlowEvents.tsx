import { ArrowDownRight, ArrowUpRight, ShoppingBag } from "lucide-react";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatSignedMoney } from "@/lib/formatMoney";
import type { AppliedEvent } from "@/types/financial";
import { ProvenanceTag } from "./ProvenanceTag";

export function CashFlowEvents({ events, balances }: { events: AppliedEvent[]; balances?: Map<string, number> }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No cash flows in this period.</p>;
  return (
    <ul className="divide-y divide-border">
      {events.map((e) => {
        const Icon = e.type === "income" ? ArrowUpRight : e.type === "purchase" ? ShoppingBag : ArrowDownRight;
        return (
          <li key={e.id} className="flex items-center gap-3 py-4">
            <span className={e.amountCents > 0 ? "rounded-md bg-primary-soft p-1.5 text-primary" : "rounded-md bg-secondary p-1.5 text-muted-foreground"}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{e.label}</span>
                <ProvenanceTag value={e.provenance} />
              </div>
              <div className="text-xs text-muted-foreground">{formatDateOnly(e.date, "EEE, MMM d")}</div>
            </div>
            <div className="text-right">
              <div className={e.amountCents > 0 ? "font-mono text-sm tabular text-primary" : "font-mono text-sm tabular text-foreground"}>
                {formatSignedMoney(e.amountCents)}
              </div>
              {balances?.has(e.date) && (
                <div className="text-xs tabular text-muted-foreground">Day ends at {formatSignedMoney(balances.get(e.date) ?? 0).replace("+", "")}</div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
