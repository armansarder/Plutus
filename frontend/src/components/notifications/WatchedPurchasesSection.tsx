import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/formatMoney";
import { formatDateOnly } from "@/lib/dateOnly";
import { fetchWatchlist, removeFromWatchlist, type WatchlistItem } from "@/services/notifications";

export function WatchedPurchasesSection() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
    refetchInterval: 2500, // Short polling for automatic live updates across laptops
  });

  const deleteMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  return (
    <section aria-labelledby="watchlist-heading" className="panel p-6 mt-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Eye className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 id="watchlist-heading" className="text-base font-semibold text-foreground">
              Watched Purchases
            </h2>
            <p className="text-xs text-muted-foreground">
              Items monitored by Plutus's simulation engine. When cash flow changes, you will be notified if your reserve rule is met.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          Auto-updating
        </Badge>
      </div>

      {isLoading ? (
        <div className="py-6 text-sm text-muted-foreground animate-pulse">Loading watched purchases…</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
          <Clock className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p>No purchases are currently on your watchlist.</p>
          <p className="text-xs">
            Ask Plutus in <strong>Talk to Plutus</strong> ("Can I afford a laptop?") and click <strong>Watch This Purchase</strong> to start monitoring.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{item.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatMoney(item.amount_cents)} · Reserve: {formatMoney(item.reserve_cents)}
                  </span>
                  {item.ready ? (
                    <Badge variant="default" className="bg-accent text-accent-foreground text-xs">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Ready · Meets Reserve &amp; Savings
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-caution-soft text-caution-foreground text-xs border-caution">
                      <AlertCircle className="mr-1 h-3 w-3" /> {item.verdict === "erodes_savings" ? "Savings Target at Risk" : item.verdict === "stress_sensitive" ? "Stress-Sensitive" : "Reserve at Risk"}
                    </Badge>
                  )}
                  {item.notified && (
                    <Badge variant="secondary" className="text-xs">
                      SMS Delivered
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  As of {formatDateOnly(item.purchase_date)} · {item.horizon_days}-day forecast
                  {item.minimum_balance && ` · Min cash: $${item.minimum_balance}`}
                  {Boolean(item.savings_target_cents) && ` · Target savings: ${formatMoney(item.savings_target_cents!)}`}
                </p>
                {item.reasons && item.reasons.length > 0 && (
                  <p className="text-xs text-muted-foreground/80 italic">
                    {item.reasons[0]}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(item.id)}
                  aria-label={`Remove ${item.label} from watchlist`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
