import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, ShieldCheck } from "lucide-react";
import { CustomerFinancialData } from "@/components/app/CustomerFinancialData";
import { PageHeading } from "@/components/app/PageHeading";
import { BackendSource } from "@/components/financial/BackendRecords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NemotronResult } from "./NemotronResult";
import { nemotronAdapter } from "@/services/nemotron";
import { forecastStart, moneyString } from "@/services/engine";
import { parseDollarsToCents } from "@/lib/formatMoney";
import { addDays, isDateOnly } from "@/lib/dateOnly";
import type { SituationSnapshot } from "@/services/situation";
import type { NemotronRequest, NemotronResponse } from "@/types/nemotron";

type Turn = { id: string; question: string; input: NemotronRequest; state: "pending" | "completed" | "failed" | "cancelled"; response?: NemotronResponse };
export function BackendTalk() {
  return <CustomerFinancialData>{snapshot => <Conversation key={`${snapshot.snapshotId}:${snapshot.startingBalanceCents}`} snapshot={snapshot} />}</CustomerFinancialData>;
}
function Conversation({ snapshot }: { snapshot: SituationSnapshot }) {
  const queryClient = useQueryClient();
  const key = useMemo(() => ["nemotron-conversation", snapshot.snapshotId, snapshot.startingBalanceCents], [snapshot.snapshotId, snapshot.startingBalanceCents]);
  const { data: turns } = useQuery<Turn[]>({ queryKey: key, queryFn: async () => [], initialData: [], enabled: false, staleTime: Infinity });
  const [question, setQuestion] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(forecastStart(snapshot));
  const [reserve, setReserve] = useState("200");
  const [horizon, setHorizon] = useState("30");
  const [allowModel, setAllowModel] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef<{ controller: AbortController; id: string } | null>(null);
  const serial = useRef(0);
  const update = (fn: (old: Turn[]) => Turn[]) => queryClient.setQueryData<Turn[]>(key, old => fn(old ?? []).slice(-10));
  useEffect(() => () => {
    const current = active.current;
    if (current) {
      current.controller.abort();
      active.current = null;
      queryClient.setQueryData<Turn[]>(key, old => old?.map(t => t.id === current.id ? { ...t, state: "cancelled" } : t));
    }
  }, [key, queryClient]);
  async function run(input: NemotronRequest, id?: string) {
    if (active.current) return;
    const current = { controller: new AbortController(), id: id ?? `${Date.now()}-${++serial.current}` };
    active.current = current; setPending(true); setError("");
    if (id) update(old => old.map(t => t.id === id ? { ...t, state: "pending" } : t));
    else update(old => [...old, { id: current.id, question: input.message, input, state: "pending" }]);
    try {
      const response = await nemotronAdapter.run(snapshot, input, current.controller.signal);
      if (!current.controller.signal.aborted) update(old => old.map(t => t.id === current.id ? { ...t, state: "completed", response } : t));
    } catch {
      if (!current.controller.signal.aborted) update(old => old.map(t => t.id === current.id ? { ...t, state: "failed" } : t));
    } finally {
      if (active.current === current) { active.current = null; setPending(false); }
    }
  }
  function submit() {
    if (active.current) return;
    const cents = parseDollarsToCents(amount), reserveCents = parseDollarsToCents(reserve), days = Number(horizon);
    if (!question.trim()) { setError("Add a question about this purchase."); return; }
    if (cents === null || cents <= 0 || cents > 100_000_000 || reserveCents === null || reserveCents > 100_000_000) { setError("Enter a purchase from $0.01 to $1,000,000 and a reserve from $0 to $1,000,000."); return; }
    if (!Number.isInteger(days) || days < 1 || days > 90 || !isDateOnly(date) || date < forecastStart(snapshot) || date > addDays(forecastStart(snapshot), days - 1)) { setError("Choose a horizon of 1–90 days and a purchase date inside that window."); return; }
    void run({ message: question.trim(), purchase_amount: moneyString(cents), purchase_date: date, reserve: moneyString(reserveCents), horizon_days: days, allow_model: allowModel, channel: "web" });
    setQuestion("");
  }
  function clear() { active.current?.controller.abort(); active.current = null; setPending(false); queryClient.setQueryData(key, []); }
  return <div><PageHeading eyebrow={`${snapshot.customer.displayName} · Talk to Plutus`} title="Explore a purchase with Plutus." description="Ask about purchase cash flow, timing, a late paycheck or an unexpected expense." /><BackendSource snapshot={snapshot} />
    <div className="mb-6 grid gap-3 sm:grid-cols-2"><div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"><Calculator className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Your confirmed fields drive the result</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">This view compares purchase amount, date and reserve. For specialist conversations, use Council & specialists.</p></div></div><div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Stress assumptions stay explicit</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Tests an extra $200 expense and, when eligible income exists, a three-day delay. Budget and savings advice is unavailable.</p></div></div></div>
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7"><p className="text-xs text-muted-foreground">Last 10 analyses kept in memory. Refreshing clears the conversation.</p><Button variant="ghost" size="sm" onClick={clear}>Clear conversation</Button></div>
      {!turns.length && <div className="mx-auto max-w-xl px-5 py-10 text-center"><span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Calculator className="h-6 w-6" /></span><h2 className="font-display text-2xl font-semibold">Compare before you commit.</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">See the purchase, a later date, and adverse scenarios side by side. Confirm the details below to begin.</p></div>}
      <div className="space-y-7 px-5 sm:px-7" aria-live="polite" aria-busy={pending}>{turns.map(turn => <article className="py-5" key={turn.id}>
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">{turn.question}</p>
        <p className="mt-2 text-xs text-muted-foreground">Confirmed fields: ${turn.input.purchase_amount} purchase · ${turn.input.reserve} reserve · {turn.input.purchase_date} · {turn.input.horizon_days} days</p>
        {turn.state === "pending" && <p role="status" className="mt-3 text-sm">Investigating your purchase and stress scenarios… This can take up to a minute.</p>}
        {(turn.state === "failed" || turn.state === "cancelled") && <div role="alert" className="mt-3 rounded-lg bg-secondary p-4 text-sm"><p>{turn.state === "cancelled" ? "Analysis cancelled when you left the page." : "The agent could not complete this request. It may be unavailable, or your financial snapshot may have changed. Check the fields or refresh Current Situation. No sample response was substituted."}</p><Button className="mt-3" variant="outline" disabled={pending} onClick={() => void run(turn.input, turn.id)}>Try again</Button></div>}
        {turn.response && turn.state === "completed" && <NemotronResult response={turn.response} />}
      </article>)}</div>
      <form className="space-y-5 border-t border-border bg-secondary/30 px-5 py-6 sm:px-7" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
        <div><Label className="mb-2 block" htmlFor="agent-question">Your question</Label><Textarea className="min-h-24 rounded-xl bg-card p-4" id="agent-question" maxLength={2000} autoComplete="off" placeholder="What if my paycheck arrives late after this purchase?" value={question} onChange={event => setQuestion(event.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="agent-amount">Purchase amount (USD)</Label><Input id="agent-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} /></div><div><Label htmlFor="agent-reserve">Cash reserve to preserve (USD)</Label><Input id="agent-reserve" inputMode="decimal" autoComplete="off" value={reserve} onChange={event => setReserve(event.target.value)} /></div><div><Label htmlFor="agent-date">Purchase date</Label><Input id="agent-date" type="date" min={forecastStart(snapshot)} max={addDays(forecastStart(snapshot), Math.max(1, Math.min(90, Number(horizon) || 30)) - 1)} value={date} onChange={event => setDate(event.target.value)} /></div><div><Label htmlFor="agent-horizon">Forecast horizon (days)</Label><Input id="agent-horizon" type="number" min={1} max={90} step={1} value={horizon} onChange={event => setHorizon(event.target.value)} /></div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowModel} onChange={event => setAllowModel(event.target.checked)} />Ask Nemotron to investigate (shares reduced purchase figures with the model)</label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={pending}>{pending ? "Investigating…" : "Send question and analyze purchase"}</Button>
      </form>
    </div></div>;
}
