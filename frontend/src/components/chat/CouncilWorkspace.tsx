import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CouncilGraph } from "./CouncilGraph";
import { CustomerFinancialData } from "@/components/app/CustomerFinancialData";
import { PageHeading } from "@/components/app/PageHeading";
import { BackendSource } from "@/components/financial/BackendRecords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/apiClient";
import { assertCouncilSnapshot, councilAdapter } from "@/services/council";
import { forecastStart, moneyString } from "@/services/engine";
import { parseDollarsToCents } from "@/lib/formatMoney";
import { addDays, isDateOnly } from "@/lib/dateOnly";
import type { SituationSnapshot } from "@/services/situation";
import type { CouncilConversation, CouncilMessage, CouncilRole, CouncilRun } from "@/types/council";
import { NemotronResult } from "./NemotronResult";

const ROLES: CouncilRole[] = ["council", "budget", "risk", "simulator"];
const LABELS = {council: "Council Leader", budget: "Budget Agent", risk: "Risk Agent", simulator: "Simulator Agent"};
const DESCRIPTIONS = {council: "Independent perspectives, shared evidence, one balanced comparison.", budget: "Explore affordability and how a choice uses available cash.", risk: "Challenge timing and reserve assumptions with explicit stress tests.", simulator: "Compare projected timelines using the existing financial engine."};
const MODES = {nemotron_council: "Live Nemotron council", nemotron_specialist: "Live Nemotron specialist", partial: "Partial result · Some model actions did not complete", deterministic_only: "Deterministic only · No specialist model reviews", no_analysis: "Clarification or unsupported calculation"};
type State = Partial<Record<CouncilRole, CouncilConversation>>;
type Active = {controller: AbortController; conversation: string; input: CouncilMessage};
export function CouncilWorkspace() {
  return <CustomerFinancialData>{snapshot => <Workspace key={snapshot.snapshotId + snapshot.startingBalanceCents} snapshot={snapshot} />}</CustomerFinancialData>;
}
function Workspace({snapshot}: {snapshot: SituationSnapshot}) {
  const queryClient = useQueryClient();
  const key = useMemo(() => ["council-conversations", snapshot.snapshotId, snapshot.startingBalanceCents], [snapshot.snapshotId, snapshot.startingBalanceCents]);
  const {data: chats} = useQuery<State>({queryKey: key, queryFn: async () => ({}), initialData: {}, enabled: false, staleTime: Infinity});
  const status = useQuery({queryKey: ["council-status"], queryFn: ({signal}) => councilAdapter.status(signal), retry: false, staleTime: 30000});
  const [role, setRole] = useState<CouncilRole>("council");
  const [question, setQuestion] = useState("");
  const [purchase, setPurchase] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(forecastStart(snapshot));
  const [reserve, setReserve] = useState("200");
  const [days, setDays] = useState("30");
  const [allowModel, setAllowModel] = useState(true);
  const [opening, setOpening] = useState(false);
  const [pending, setPending] = useState<CouncilRole | null>(null);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Active | null>(null);
  const [handoff, setHandoff] = useState<{reference: string; source: string} | null>(null);
  const active = useRef<Active | null>(null);
  const openingRef = useRef(false);
  const mounted = useRef(true);
  const chat = chats[role];
  const save = (value: CouncilConversation) => queryClient.setQueryData<State>(key, old => ({...old, [value.role]: value}));
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;
    const current = active.current; if (current) {current.controller.abort(); void councilAdapter.cancel(current.conversation, current.input.request_key).catch(() => {});}
  };}, []);
  async function open(target: CouncilRole) {
    if (openingRef.current) return;
    openingRef.current = true; setOpening(true); setError("");
    try {
      const existing = queryClient.getQueryData<State>(key)?.[target];
      const result = existing ? await councilAdapter.read(existing.id) : await councilAdapter.create(target);
      if (result.messages.length) assertCouncilSnapshot(result.messages.at(-1)!.result, snapshot);
      if (mounted.current) save(result);
    } catch {if (mounted.current) setError("Could not open this chat. Check the council flag, backend connection or session expiry. Reset an expired chat to start again.");}
    finally {openingRef.current = false; if (mounted.current) setOpening(false);}
  }
  useEffect(() => {if (status.data?.enabled) void open(role);}, [role, status.data?.enabled]);
  async function send(input: CouncilMessage, conversation: string) {
    if (active.current) return;
    const current = {controller: new AbortController(), conversation, input};
    active.current = current; setPending(role); setError(""); setFailed(null);
    try {
      const result = await councilAdapter.send(conversation, input, current.controller.signal);
      assertCouncilSnapshot(result, snapshot);
      // Server history is authoritative, including cached idempotent results.
      const view = await councilAdapter.read(conversation, current.controller.signal);
      if (mounted.current) {save(view); setQuestion(""); setHandoff(null);
        if (view.messages.at(-1)?.result.status === "needs_clarification") setPurchase(true);}
    } catch {
      if (mounted.current) {setFailed(current); setError(current.controller.signal.aborted
        ? "Display request cancelled. The server was asked to stop. Reload chat to inspect completed work."
        : "Request failed or the snapshot changed. Retry uses the same request key; reload chat to inspect a pending result. Start a new chat after source changes.");}
    } finally {if (active.current === current) active.current = null; if (mounted.current) setPending(null);}
  }
  function submit() {
    if (!chat || !question.trim() || active.current) {setError("Open a chat and enter your question first."); return;}
    let analysis: CouncilMessage["analysis"];
    if (purchase) {
      const cents = parseDollarsToCents(amount), buffer = parseDollarsToCents(reserve), horizon = Number(days);
      if (cents === null || cents <= 0 || cents > 100_000_000 || buffer === null || buffer > 100_000_000 || !Number.isInteger(horizon) || horizon < 1 || horizon > 90 || !isDateOnly(date) || date < forecastStart(snapshot) || date > addDays(forecastStart(snapshot), horizon - 1)) {
        setError("Confirm a valid purchase amount, reserve, 1–90 day horizon, and date inside the forecast window."); return;
      }
      analysis = {message: "", purchase_amount: moneyString(cents), purchase_date: date, reserve: moneyString(buffer), horizon_days: horizon, allow_model: allowModel, channel: "web"};
    }
    const previous = chat.messages.at(-1)?.result;
    void send({request_key: crypto.randomUUID(), message: question.trim(), analysis,
      allow_model: allowModel, handoff: handoff?.reference,
      expected_snapshot_id: previous?.snapshot_id}, chat.id);
  }
  function cancel() {const current = active.current; if (!current) return;
    void councilAdapter.cancel(current.conversation, current.input.request_key).catch(() => {}); current.controller.abort();}
  async function reset() {
    if (pending) return;
    if (chat) {try {await councilAdapter.clear(chat.id);} catch (cause) {if (!(cause instanceof ApiError && cause.message === "Request failed (404)")) {setError("Could not clear the server chat; it may be expired or still active. No stored history was changed locally."); return;}}}
    queryClient.setQueryData<State>(key, old => {const next = {...old}; delete next[role]; return next;});
    setFailed(null); setError(""); setHandoff(null); await open(role);
  }
  if (status.isPending) return <p role="status">Checking council availability…</p>;
  if (status.isError) return <div role="alert" className="panel p-5"><p>Council status is unavailable. Your existing purchase-analysis view remains available.</p><Button onClick={() => void status.refetch()}>Try again</Button></div>;
  if (!status.data?.enabled) return <div className="panel p-5"><h2 className="font-semibold">Council is disabled</h2><p className="mt-2 text-sm">Enable PLUTUS_COUNCIL_ENABLED=1 on the local backend and restart it. Existing purchase analysis is unchanged.</p></div>;
  return <section><PageHeading eyebrow="Financial Decision Council" title="Explore a decision from every angle." description="Talk to a specialist or ask the council to compare independent perspectives." /><BackendSource snapshot={snapshot} />
    <p className="mb-4 text-sm text-muted-foreground">Temporary chats for this browser session and the configured demo customer. No login or permanent storage. Only selected findings cross chats through an explicit handoff.</p>
    <div role="tablist" aria-label="Financial specialists" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{ROLES.map(r => <Button key={r} role="tab" aria-selected={role === r} disabled={!!pending || opening} variant={role === r ? "default" : "outline"} onClick={() => {setRole(r); setQuestion(""); setFailed(null); setError("");}}>{LABELS[r]}</Button>)}</div>
    <div className="panel p-4 sm:p-6" role="tabpanel" aria-label={LABELS[role]}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{LABELS[role]}</h2><p className="mt-1 text-sm text-muted-foreground">{DESCRIPTIONS[role]}</p></div>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!!pending || opening} onClick={() => void open(role)}>Reload chat</Button><Button size="sm" variant="outline" disabled={!!pending || opening} onClick={() => void reset()}>New chat</Button></div></div>
      {opening && <p role="status" className="mt-4">Opening isolated chat…</p>}
      {!opening && !chat?.messages.length && <p className="my-5 text-sm text-muted-foreground">Ask a conceptual question, or confirm purchase fields to compare projected cash flow. Debt-interest and investment calculations are not available.</p>}
      <div className="mt-5 space-y-6" aria-live="polite">{chat?.messages.map(turn => <article key={turn.request_key} className="space-y-3 border-t border-border pt-4"><p className="ml-auto max-w-[90%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground break-words">{turn.message}</p><CouncilAnswer result={turn.result} onHandoff={role !== "council" && turn.result.handoff_reference ? () => {setHandoff({reference: turn.result.handoff_reference!, source: LABELS[role]}); setRole("council"); setQuestion("Compare the selected specialist findings with the other perspectives."); setPurchase(!!turn.result.analysis); if (turn.result.analysis) {const a = turn.result.analysis; setAmount(a.passport.purchase_amount); setReserve(a.passport.reserve); setDate(a.scenarios.find(s => s.name === "purchase")!.purchase_date!); setDays(String(a.scenarios[0]!.forecast.daily_balances.length));}} : undefined} /></article>)}</div>
      {pending && <div role="status" className="my-5 rounded-xl bg-secondary p-4 text-sm"><p>Waiting for validated specialist responses and calculations. This can take up to a minute; completed actions appear in the result.</p><Button className="mt-3" variant="outline" onClick={cancel}>Cancel analysis</Button></div>}
      {error && <div role="alert" className="my-4 rounded-lg border border-destructive p-4 text-sm"><p>{error}</p>{failed && <Button className="mt-3" variant="outline" disabled={!!pending} onClick={() => void send(failed.input, failed.conversation)}>Retry same request</Button>}</div>}
      {handoff && <div className="my-4 rounded-lg bg-secondary p-3 text-sm">Selected findings from {handoff.source} will be shared with Council, not the whole chat. <button className="underline" onClick={() => setHandoff(null)}>Remove handoff</button></div>}
      <form className="mt-6 space-y-4 border-t border-border pt-5" noValidate onSubmit={e => {e.preventDefault(); submit();}}>
        <div><Label htmlFor="council-question">Question for {LABELS[role]}</Label><Input id="council-question" value={question} maxLength={2000} autoComplete="off" onChange={e => setQuestion(e.target.value)} placeholder="What changes if my income arrives late?" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={purchase} onChange={e => setPurchase(e.target.checked)} />Include a confirmed purchase comparison</label>
        {purchase && <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="council-amount">Purchase amount (USD)</Label><Input id="council-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div><div><Label htmlFor="council-reserve">Reserve (USD)</Label><Input id="council-reserve" inputMode="decimal" value={reserve} onChange={e => setReserve(e.target.value)} /></div><div><Label htmlFor="council-date">Purchase date</Label><Input id="council-date" type="date" min={forecastStart(snapshot)} value={date} onChange={e => setDate(e.target.value)} /></div><div><Label htmlFor="council-days">Horizon (days)</Label><Input id="council-days" type="number" min={1} max={90} value={days} onChange={e => setDays(e.target.value)} /></div></div>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowModel} onChange={e => setAllowModel(e.target.checked)} />Use Nemotron. Shares this message, this chat's recent validated context, and approved financial evidence. Do not enter keys or personal identifiers.</label>
        <Button type="submit" disabled={!!pending || opening || !chat || chat.busy}>Send to {LABELS[role]}</Button>
      </form>
    </div></section>;
}
export function CouncilAnswer({result, onHandoff}: {result: CouncilRun; onHandoff?: (() => void) | undefined}) {
  const latest = ROLES.map(role => [...result.reviews].reverse().find(r => r.role === role)).filter((r): r is CouncilRun["reviews"][number] => !!r);
  const main = latest.find(r => r.role === result.role);
  return <div className="space-y-4"><p className="text-xs text-muted-foreground">{MODES[result.mode]}{result.status === "cancelled" ? " · Cancelled" : ""}</p>
    <div className="rounded-xl bg-secondary p-4">{main?.status === "complete" && main.recommendation ? <><h3 className="text-lg font-semibold">{main.recommendation}</h3><p className="mt-2 text-sm">{main.summary}</p></> : <p className="text-sm">{result.message}</p>}</div>
    {result.next_question && <p className="rounded-xl border border-border p-4 text-sm">{result.next_question}</p>}
    <div className="grid gap-3 md:grid-cols-2">{latest.map(review => <section key={review.role} className="rounded-xl border border-border p-4" aria-label={`${LABELS[review.role]} recommendation`}><h3 className="text-sm text-muted-foreground">{LABELS[review.role]}</h3>
      <p className="mt-2 font-semibold">{review.status !== "complete" ? "Recommendation unavailable" : review.recommendation ?? (result.analysis ? "Run a new analysis for a clear recommendation." : "What you should know")}</p>
      <p className="mt-2 text-sm">{review.summary}</p>{review.revised && <p className="mt-3 text-xs text-muted-foreground">Updated after comparing the results</p>}
    </section>)}</div>
    <p className="text-xs text-muted-foreground">Projections use the supplied income and expenses. No payment was made.</p>
    {result.chart && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Compare balance timelines</summary><div className="mt-4"><CouncilGraph chart={result.chart} /></div></details>}
    {result.analysis && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold">Calculation evidence, safe dates, Passport and Trust Shield</summary><NemotronResult response={result.analysis} calculationOnly /></details>}
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Agent discussion and supporting evidence</summary><div className="mt-4 space-y-5">{result.reviews.map((review, i) => <section key={i}><h4 className="text-sm font-semibold">{LABELS[review.role]} · {review.stage.replaceAll("_", " ")} · {review.status}</h4><p className="mt-1 text-sm">{review.recommendation ?? review.position.replaceAll("_", " ")}</p><ul className="mt-2 space-y-2 text-sm">{review.findings.map(f => <li key={f.id}><p>{f.text}</p><span className="break-all text-xs text-muted-foreground">Calculation references: {f.evidence_ids.join(", ")}</span></li>)}</ul></section>)}</div></details>
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Observed action log and limitations</summary><ol className="mt-3 space-y-1 text-xs">{result.events.map(e => <li key={e.sequence}>{e.sequence}. {LABELS[e.role]} · {e.action.replaceAll("_", " ")} · {e.status}</li>)}</ol><ul className="mt-3 space-y-2 text-xs text-muted-foreground">{result.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
    {onHandoff && <Button variant="outline" onClick={onHandoff}>Share these findings with Council</Button>}
  </div>;
}
