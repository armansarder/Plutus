import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  Zap,
  RotateCcw,
  ShoppingBag,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Eye,
  MessageSquare,
} from "lucide-react";
import { PageHeading } from "@/components/app/PageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/formatMoney";
import { formatDateOnly } from "@/lib/dateOnly";
import {
  fetchNotificationState,
  fetchWatchlist,
  fetchNotificationHistory,
  operatorSpend,
  operatorAdvancePayday,
  operatorReset,
} from "@/services/notifications";

export const Route = createFileRoute("/operator")({
  head: () => ({
    meta: [
      { title: "Demo Operator Console — Plutus" },
      { name: "description", content: "Restricted private demo operator interface for HackUTD 2026 judges demonstration." },
    ],
  }),
  component: DemoOperatorPage,
});

const DEFAULT_SECRET = "1dd29b031084d4ae4d55b5bb0379e8e905f4ae14dcab60a248b631c863f76eff";

function DemoOperatorPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(DEFAULT_SECRET);
  const [authorized, setAuthorized] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Poll state, watchlist, and alert history every 2 seconds
  const { data: state, isError: stateError } = useQuery({
    queryKey: ["notification-state"],
    queryFn: fetchNotificationState,
    refetchInterval: 2000,
  });

  const { data: watchlist = [] } = useQuery({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
    refetchInterval: 2000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["notification-history"],
    queryFn: fetchNotificationHistory,
    refetchInterval: 2000,
  });

  const showFeedback = (type: "success" | "error", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 6000);
  };

  const spendMutation = useMutation({
    mutationFn: () => operatorSpend(6000, token),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries();
      const events = data?.results?.events ?? [];
      const notifText = events.length > 0 ? "SMS alert triggered to enrolled phone!" : "No SMS triggered (disabled or duplicate suppressed).";
      showFeedback("success", `Added $60.00 grocery spending. Total: $${(data.newSpentCents / 100).toFixed(2)}. ${notifText}`);
    },
    onError: (err: Error) => {
      showFeedback("error", `Spend action failed: ${err.message}. Check your operator token.`);
    },
  });

  const paydayMutation = useMutation({
    mutationFn: () => operatorAdvancePayday(token),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries();
      const events = data?.results?.events ?? [];
      const notifText = events.length > 0 ? "Purchase opportunity SMS triggered to enrolled phone!" : "No new purchase SMS sent.";
      showFeedback("success", `Payday advanced to ${data?.advance?.asOf}. Balance is now $${data?.advance?.balance}. ${notifText}`);
    },
    onError: (err: Error) => {
      showFeedback("error", `Advance payday failed: ${err.message}. Check your operator token.`);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => operatorReset(token),
    onSuccess: () => {
      queryClient.invalidateQueries();
      showFeedback("success", "Demo state reset successfully. Balances restored to initial demo baseline.");
    },
    onError: (err: Error) => {
      showFeedback("error", `Reset failed: ${err.message}. Check your operator token.`);
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeading
          eyebrow="HackUTD 2026 · Demo Operator"
          title="Private Demo Operator Interface"
          description="Control simulated financial events from Laptop B to demonstrate real-time notifications on Laptop A and judges' enrolled phones."
        />
        <Badge variant="outline" className="border-caution text-caution-foreground bg-caution-soft px-3 py-1">
          <Radio className="mr-1.5 h-3.5 w-3.5 animate-pulse text-destructive" /> Private Demo Mode Active
        </Badge>
      </div>

      {/* Operator Authorization Session */}
      <section className="panel p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Operator Authentication Session</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Actions modifying authoritative financial state require authentication with the backend operator secret.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-96">
            <Label htmlFor="op-token" className="sr-only">
              Operator Secret Token
            </Label>
            <Input
              id="op-token"
              type="password"
              placeholder="Operator secret token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAuthorized(Boolean(token));
              showFeedback("success", "Operator session token updated.");
            }}
          >
            Update Session
          </Button>
        </div>
      </section>

      {/* Live System State */}
      <section className="panel p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-base font-semibold">Authoritative Financial State (Alex Rivera)</h2>
          <span className="text-xs text-muted-foreground">Version: {state?.version ?? "..."} · Polling every 2s</span>
        </div>

        {stateError ? (
          <p className="text-sm text-destructive">Failed to fetch backend financial state. Ensure backend is running.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-border p-3.5">
              <span className="text-xs text-muted-foreground">As-of Date</span>
              <p className="font-mono text-base font-semibold text-foreground mt-0.5">{state?.asOf ?? "Loading…"}</p>
            </div>
            <div className="rounded-lg border border-border p-3.5">
              <span className="text-xs text-muted-foreground">Checking Balance</span>
              <p className="font-mono text-base font-semibold text-foreground mt-0.5">
                {state ? `$${state.balance}` : "Loading…"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3.5">
              <span className="text-xs text-muted-foreground">Grocery Spending</span>
              <p className="font-mono text-base font-semibold text-foreground mt-0.5">
                {state ? `$${(state.budget.spentCents / 100).toFixed(2)} / $${(state.budget.allocatedCents / 100).toFixed(2)}` : "Loading…"}
              </p>
              <span className="text-xs text-muted-foreground">
                {state ? `${state.budget.percent}% (${state.budget.above ? "Above 85% Warning" : "Below Warning"})` : ""}
              </span>
            </div>
            <div className="rounded-lg border border-border p-3.5">
              <span className="text-xs text-muted-foreground">Watched Items</span>
              <p className="font-mono text-base font-semibold text-foreground mt-0.5">{watchlist.length} items</p>
            </div>
          </div>
        )}

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`p-3.5 rounded-md text-xs font-medium flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-accent text-accent-foreground border border-accent"
                : "bg-destructive-soft text-destructive border border-destructive"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}
      </section>

      {/* Operator Trigger Controls */}
      <section className="panel p-6 space-y-6">
        <div className="border-b border-border pb-3">
          <h2 className="text-base font-semibold">Live Demo Controls (Laptop B Triggers)</h2>
          <p className="text-xs text-muted-foreground">
            Execute these actions to demonstrate the live transitions on Laptop A and judge's iMessage.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Action 1: Feature A Grocery Spend */}
          <div className="rounded-xl border border-border p-5 space-y-3 bg-card/60 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <ShoppingBag className="h-5 w-5" />
                <h3 className="text-sm font-semibold">Demo A: Grocery Spend ($60)</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Adds a $60 purchase. Takes spending from $380 (76%) to $440 (88%), crossing the 85% warning threshold.
                Triggers Feature A iMessage.
              </p>
            </div>
            <Button
              onClick={() => spendMutation.mutate()}
              disabled={spendMutation.isPending || !authorized}
              className="w-full"
            >
              <Zap className="mr-1.5 h-4 w-4" />
              {spendMutation.isPending ? "Adding Spend…" : "Simulate $60 Spend"}
            </Button>
          </div>

          {/* Action 2: Feature B Payday Advance */}
          <div className="rounded-xl border border-border p-5 space-y-3 bg-card/60 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <DollarSign className="h-5 w-5" />
                <h3 className="text-sm font-semibold">Demo B: Advance Payday</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Simulates receiving Alex's $1,300 paycheck on Nov 15. The $600 Laptop on the watchlist transitions from
                reserve at risk to meeting the $200 reserve rule. Triggers Feature B iMessage.
              </p>
            </div>
            <Button
              onClick={() => paydayMutation.mutate()}
              disabled={paydayMutation.isPending || !authorized}
              className="w-full"
            >
              <Zap className="mr-1.5 h-4 w-4" />
              {paydayMutation.isPending ? "Advancing Payday…" : "Advance Payday ($1,300)"}
            </Button>
          </div>

          {/* Action 3: Reset Demo */}
          <div className="rounded-xl border border-border p-5 space-y-3 bg-card/60 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RotateCcw className="h-5 w-5" />
                <h3 className="text-sm font-semibold">Repeatable Reset</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Restores Alex's initial balance ($900), groceries spent ($380), and resets watchlist notifications for the
                next demonstration without erasing user phone preferences.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || !authorized}
              className="w-full"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {resetMutation.isPending ? "Resetting…" : "Reset Demo Baseline"}
            </Button>
          </div>
        </div>
      </section>

      {/* Watched Purchases Status */}
      <section className="panel p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Live Watched Items Status</h2>
        </div>
        {watchlist.length === 0 ? (
          <p className="text-xs text-muted-foreground">No purchases currently watched on the backend.</p>
        ) : (
          <ul className="space-y-2">
            {watchlist.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground mr-2">{item.label}</span>
                  <span className="font-mono text-muted-foreground">
                    {formatMoney(item.amount_cents)} · Reserve: {formatMoney(item.reserve_cents)}
                  </span>
                  <span className="ml-2 text-muted-foreground">As-of: {formatDateOnly(item.purchase_date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.ready ? (
                    <Badge variant="default" className="bg-accent text-accent-foreground text-xs">
                      Ready · Meets Reserve
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-caution-soft text-caution-foreground">
                      Reserve at Risk
                    </Badge>
                  )}
                  {item.notified ? (
                    <Badge variant="secondary" className="text-xs">
                      SMS Delivered
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Not Notified
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Outbound Notification History Log */}
      <section className="panel p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Outbound Notification Log (Deduplicated)</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No notifications have been recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-border p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground uppercase">{alert.kind}</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {alert.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{alert.text}</p>
                <p className="text-[10px] text-muted-foreground/60">{alert.created_at}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

