import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Calculator, CircleHelp, Layers3, LoaderCircle, RefreshCw, Send, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { CouncilGraph } from "./CouncilGraph";
import { CustomerFinancialData } from "@/components/app/CustomerFinancialData";
import { PageHeading } from "@/components/app/PageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/apiClient";
import { assertCouncilSnapshot, councilAdapter } from "@/services/council";
import { forecastStart, moneyString } from "@/services/engine";
import { parseDollarsToCents } from "@/lib/formatMoney";
import { addDays, isDateOnly } from "@/lib/dateOnly";
import type { SituationSnapshot } from "@/services/situation";
import type { CouncilConversation, CouncilMessage, CouncilRole, CouncilRun } from "@/types/council";
import { NemotronResult } from "./NemotronResult";
import { localToday, proposePurchase, type PurchaseDraft } from "@/services/purchaseIntent";
import { PurchaseQuestion } from "./PurchaseQuestion";
import { useCashPlan } from "@/services/cashPlan";
import { centsValue } from "@/services/engine";

const ROLES: CouncilRole[] = ["council", "budget", "risk", "simulator"];
const LABELS = {council: "Council Leader", budget: "Budget Advisor", risk: "Risk Advisor", simulator: "Simulator Advisor"};
const DESCRIPTIONS = {council: "Independent perspectives, shared evidence, one balanced comparison.", budget: "Explore affordability and how a choice uses available cash.", risk: "Challenge timing and reserve assumptions with explicit stress tests.", simulator: "Compare projected timelines using the existing financial engine."};
const ROLE_ICONS = {council: Layers3, budget: Wallet, risk: ShieldCheck, simulator: Calculator};
const STARTERS = {
  council: ["Help me compare a purchase with keeping my cash reserve.", "What should I check before a major purchase?"],
  budget: ["How should I think about affordability?", "Compare this purchase with preserving my reserve."],
  risk: ["What changes if my income arrives late?", "How much does an unexpected expense change my plan?"],
  simulator: ["Show how a purchase changes my projected balance.", "What do the different balance timelines mean?"],
};
const MODES = {nemotron_council: "Live Nemotron council", nemotron_specialist: "Live Nemotron specialist", partial: "Partial result · Some model actions did not complete", deterministic_only: "Deterministic only · No specialist model reviews", no_analysis: "Clarification or unsupported calculation"};
type State = Partial<Record<CouncilRole, CouncilConversation>>;
type Active = {controller: AbortController; conversation: string; input: CouncilMessage};
function chatError(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiError)) return fallback;
  if (cause.message.includes("(401)")) return "The frontend and financial service could not authenticate. Restart both using the shared local launcher; your question was not processed.";
  if (cause.message.includes("(503)")) return "The financial service is unavailable. Check the backend connection and Nessie source, then try again.";
  if (cause.message.includes("(429)")) return "This session reached its chat limit. Start a new chat or clear an older conversation.";
  if (cause.message.includes("(409)")) return "An analysis is still running or the financial snapshot changed. Reload this chat before retrying; start a new chat after refreshing your records.";
  return fallback;
}
export function CouncilWorkspace() {
  return <CustomerFinancialData>{snapshot => <Workspace key={snapshot.snapshotId + snapshot.startingBalanceCents} snapshot={snapshot} />}</CustomerFinancialData>;
}
function Workspace({snapshot}: {snapshot: SituationSnapshot}) {
  const {plan:cashPlan} = useCashPlan(snapshot);
  const queryClient = useQueryClient();
  const key = useMemo(() => ["council-conversations", snapshot.snapshotId, snapshot.startingBalanceCents], [snapshot.snapshotId, snapshot.startingBalanceCents]);
  const {data: chats} = useQuery<State>({queryKey: key, queryFn: async () => ({}), initialData: {}, enabled: false, staleTime: Infinity});
  const status = useQuery({queryKey: ["council-status"], queryFn: ({signal}) => councilAdapter.status(signal), retry: false, staleTime: 30000});
  const [role, setRole] = useState<CouncilRole>("council");
  const [question, setQuestion] = useState("");
  const [purchase, setPurchase] = useState(false);
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(forecastStart(snapshot));
  const [reserve, setReserve] = useState(cashPlan?.protected_amount ?? "200");
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
    } catch (cause) {if (mounted.current) setError(chatError(cause, "Could not open this chat. Reload it, or choose New chat if the session expired."));}
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
      if (mounted.current) {save(view); setQuestion(""); setHandoff(null); setDraft(null); setPurchase(false); setAmount("");
        if (view.messages.at(-1)?.result.status === "needs_clarification") setPurchase(true);}
    } catch (cause) {
      if (mounted.current) {setFailed(current); setError(current.controller.signal.aborted
        ? "Display request cancelled. The server was asked to stop. Reload chat to inspect completed work."
        : chatError(cause, "Request failed or the snapshot changed. Retry uses the same request key; reload chat to inspect a pending result. Start a new chat after source changes."));}
    } finally {if (active.current === current) active.current = null; if (mounted.current) setPending(null);}
  }
  function submit() {
    if (!chat || !question.trim() || active.current) {setError("Open a chat and enter your question first."); return;}
    const proposal = proposePurchase(question, localToday(Intl.DateTimeFormat().resolvedOptions().timeZone), forecastStart(snapshot));
    if (!purchase || !amount.trim() || (proposal.kind === "comparison" && draft?.kind !== "comparison")) {
      if (proposal.kind !== "education") {
        setDraft(proposal); setPurchase(true); setDate(proposal.purchaseDate);
        if (proposal.reserve) setReserve(proposal.reserve);
        if (proposal.options[0]) setAmount(proposal.options[0].amount);
        setError(proposal.kind === "clarify" || proposal.purchaseDate < forecastStart(snapshot) ? proposal.question : ""); return;
      }
    }
    if (draft?.kind === "comparison") {setError("Confirm and compare the two choices below, then choose one for a specialist review."); return;}
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
  const Icon = ROLE_ICONS[role];
  const selectStarter = (text: string) => {setQuestion(text); setError("");};
  if (status.isPending) return <div className="panel flex items-center gap-3 p-6" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-primary" />Connecting your financial workspace...</div>;
  if (status.isError) return <div role="alert" className="panel flex flex-wrap items-center justify-between gap-4 p-6"><div><h2 className="font-semibold">The council connection needs attention</h2><p className="mt-1 text-sm text-muted-foreground">The purchase-analysis view is still available. Reconnect the council to open specialist chats.</p></div><Button variant="outline" onClick={() => void status.refetch()}><RefreshCw className="h-4 w-4" />Try again</Button></div>;
  if (!status.data?.enabled) return <div className="panel p-6"><h2 className="font-semibold">Council is disabled</h2><p className="mt-2 text-sm text-muted-foreground">Your financial service is connected, but specialist chats are not enabled. Start the app with the shared local launcher to enable them, or use purchase analysis.</p></div>;
  return <section>
    <PageHeading eyebrow="Financial Decision Council" title="A clearer view of your next move." description="Explore a question with one specialist, or bring the council together around the same financial evidence." />
    {cashPlan && <div className="mb-5 rounded-xl border border-border p-4 text-sm"><p>Your cash plan protects a reserve, savings target, and additional essentials. You can use their combined amount as the reserve for this analysis.</p><Button type="button" className="mt-3" variant="outline" disabled={!!pending || centsValue(cashPlan.protected_amount)>100_000_000} onClick={()=>{setReserve(cashPlan.protected_amount);setPurchase(true);}}>Use my cash plan protection</Button></div>}
    {status.data.model_configured === false && <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-caution/30 bg-caution-soft p-5"><div className="max-w-2xl"><p className="text-sm font-semibold">AI reviews are not configured on the running service</p><p className="mt-1 text-sm text-muted-foreground">Purchase comparisons still work with the financial engine. If you have just added the provider key, restart the app to load it.</p></div><Button variant="outline" onClick={() => {setAllowModel(false); setPurchase(true); if (!question.trim()) setQuestion("Compare this purchase with preserving my reserve.");}}>Use calculation only</Button></div>}
    <div role="tablist" aria-label="Financial specialists" className="mb-5 flex flex-wrap gap-2">{ROLES.map(r => <Button key={r} type="button" role="tab" aria-label={LABELS[r]} aria-selected={role === r} aria-controls="specialist-panel" disabled={!!pending || opening} variant={role === r ? "default" : "outline"} onClick={() => {setRole(r); setQuestion(""); setDraft(null); setPurchase(false); setFailed(null); setError("");}}>{LABELS[r]}</Button>)}</div>
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm" id="specialist-panel" role="tabpanel" aria-label={LABELS[role]}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold">{LABELS[role]}</h2><p className="mt-1 text-sm text-muted-foreground">{DESCRIPTIONS[role]}</p></div></div><div className="flex gap-2"><Button size="sm" variant="ghost" disabled={!!pending || opening} onClick={() => void open(role)}><RefreshCw className="h-3.5 w-3.5" />Reload chat</Button><Button size="sm" variant="outline" disabled={!!pending || opening} onClick={() => void reset()}>New chat</Button></div></div>
      <div className="px-5 py-6 sm:px-7">
        {opening && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Opening your private chat context...</p>}
        {!opening && !chat?.messages.length && <div className="mx-auto max-w-2xl py-5 text-center sm:py-8"><span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Sparkles className="h-6 w-6" aria-hidden="true" /></span><h3 className="font-display text-2xl font-semibold">Start with a question.</h3><p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Ask a money question, or check how a purchase could affect your balance and upcoming bills.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{STARTERS[role].map(text => <button type="button" key={text} disabled={!chat} onClick={() => selectStarter(text)} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-4 text-left text-sm transition hover:border-primary/50 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{text}<ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></button>)}</div></div>}
        <div className="space-y-7" aria-live="polite">{chat?.messages.map(turn => <article key={turn.request_key} className="space-y-5"><div className="ml-auto max-w-[90%]"><p className="mb-2 text-right text-xs text-muted-foreground">You</p><p className="rounded-2xl rounded-br-sm bg-primary px-5 py-4 text-sm leading-relaxed text-primary-foreground break-words">{turn.message}</p></div><CouncilAnswer result={turn.result} onHandoff={role !== "council" && turn.result.handoff_reference ? () => {setHandoff({reference: turn.result.handoff_reference!, source: LABELS[role]}); setRole("council"); setQuestion("Compare the selected specialist findings with the other perspectives."); setPurchase(!!turn.result.analysis); if (turn.result.analysis) {const a = turn.result.analysis; setAmount(a.passport.purchase_amount); setReserve(a.passport.reserve); setDate(a.scenarios.find(s => s.name === "purchase")!.purchase_date!); setDays(String(a.scenarios[0]!.forecast.daily_balances.length));}} : undefined} /></article>)}</div>
        {pending && <div role="status" className="my-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary-soft p-5 text-sm"><div className="flex items-start gap-3"><LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" /><div><p className="font-semibold">Reviewing the evidence</p><p className="mt-1 text-muted-foreground">Specialist responses and calculations can take up to a minute. Completed actions appear with the result.</p></div></div><Button variant="outline" onClick={cancel}>Cancel analysis</Button></div>}
        {error && <div role="alert" className="my-4 rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm"><p>{error}</p>{failed && <Button className="mt-3" variant="outline" disabled={!!pending} onClick={() => void send(failed.input, failed.conversation)}>Retry same request</Button>}</div>}
        {handoff && <div className="my-4 rounded-xl bg-secondary p-4 text-sm">Selected findings from {handoff.source} will be shared with Council. <button type="button" className="font-medium text-primary underline" onClick={() => setHandoff(null)}>Remove handoff</button></div>}
      </div>
      <form className="space-y-5 border-t border-border bg-secondary/30 px-5 py-6 sm:px-7" noValidate onSubmit={e => {e.preventDefault(); submit();}}>
        <div><Label htmlFor="council-question" className="mb-2 block">Question for {LABELS[role]}</Label><Textarea id="council-question" className="min-h-24 resize-y rounded-xl bg-card p-4 leading-relaxed" value={question} maxLength={2000} autoComplete="off" onChange={e => {setQuestion(e.target.value); if (draft) {setDraft(null); setPurchase(false);}}} placeholder="Should I buy a $500 laptop or a $300 tablet?" /><p className="mt-2 text-xs text-muted-foreground">Ask in your own words. If you mention a purchase, we'll ask you to check its price and date before comparing your options. Relative dates use {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p></div>
        {draft?.kind === "purchase" && <p role="status" className="rounded-xl bg-primary-soft p-4 text-sm">{draft.question}</p>}
        {draft?.kind === "comparison" && <PurchaseQuestion key={question+date} draft={draft} date={date} snapshot={snapshot} onChoose={(chosen, label) => {setQuestion(`Should I buy ${label} for $${chosen}?`); setAmount(chosen); setDraft(null); setPurchase(true); setError("Choice selected. Review the date and reserve, then send it to the specialist.");}} />}
        <div className="rounded-xl border border-border bg-card p-4"><label className="flex cursor-pointer items-start gap-3 text-sm font-medium"><input className="mt-0.5 h-4 w-4 accent-primary" type="checkbox" aria-label="Check if I can afford a purchase" checked={purchase} onChange={e => setPurchase(e.target.checked)} /><span>Check if I can afford a purchase<span className="mt-1 block text-xs font-normal text-muted-foreground">Enter the price and date to compare buying now, waiting, or skipping the purchase. No money moves.</span></span></label>
        {purchase && <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="council-amount">Purchase amount (USD)</Label><Input className="mt-2" id="council-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div><div><Label htmlFor="council-reserve">Reserve (USD)</Label><Input className="mt-2" id="council-reserve" inputMode="decimal" value={reserve} onChange={e => setReserve(e.target.value)} /></div><div><Label htmlFor="council-date">Purchase date</Label><Input className="mt-2" id="council-date" type="date" min={forecastStart(snapshot)} value={date} onChange={e => setDate(e.target.value)} /></div><div><Label htmlFor="council-days">Horizon (days)</Label><Input className="mt-2" id="council-days" type="number" min={1} max={90} value={days} onChange={e => setDays(e.target.value)} /></div></div>}</div>
        <div className="flex flex-wrap items-start justify-between gap-4"><label className="flex max-w-2xl items-start gap-3 text-xs leading-relaxed text-muted-foreground"><input className="mt-0.5 h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={allowModel} onChange={e => setAllowModel(e.target.checked)} /><span><span className="font-semibold text-foreground">Use Nemotron specialist reviews</span><span className="mt-1 block">Shares this message, recent validated chat context, and approved financial evidence. Keep keys and personal identifiers out of chat.</span></span></label><Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={!!pending || opening || !chat || chat.busy || draft?.kind === "comparison"}><Send className="h-4 w-4" />Send to {LABELS[role]}</Button></div>
      </form>
    </div>
    <div className="mt-4 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Chats are temporary and isolated to this browser session. Only selected findings cross chats through a handoff. Debt-interest and investment calculations are not available.</p></div>
  </section>;
}

export function CouncilAnswer({result, onHandoff}: {result: CouncilRun; onHandoff?: (() => void) | undefined}) {
  if (!result.analysis && (result.status === "needs_clarification" || result.status === "unsupported")) return <div className="space-y-3 rounded-xl bg-secondary p-5"><p className="text-xs font-medium text-muted-foreground">{result.status === "needs_clarification"?"A few details first":"Scope of this comparison"}</p><p className="text-sm leading-relaxed">{result.message}</p>{result.next_question && <p className="text-sm leading-relaxed">{result.next_question}</p>}</div>;
  const latest = ROLES.map(role => [...result.reviews].reverse().find(r => r.role === role)).filter((r): r is CouncilRun["reviews"][number] => !!r);
  const main = latest.find(r => r.role === result.role);
  const focus = {council: "Overall tradeoffs", budget: "Expected cash flow", risk: "Setbacks and timing", simulator: "Scenario comparison"};
  const specialists = latest.filter(review => review.role !== result.role);
  return <div className="space-y-4"><p className="text-xs text-muted-foreground">{MODES[result.mode]}{result.status === "cancelled" ? " · Cancelled" : ""}</p>
    <section aria-label={main ? `${LABELS[main.role]} recommendation` : "Decision result"} className="rounded-xl bg-secondary p-4">{main && <p className="mb-2 text-sm font-medium text-muted-foreground">{LABELS[main.role]} · {focus[main.role]}</p>}{main?.status === "complete" && main.recommendation ? <><h3 className="text-lg font-semibold">{main.recommendation}</h3><p className="mt-2 text-sm">{main.summary}</p></> : <p className="text-sm">{result.message}</p>}</section>
    {result.next_question && <p className="rounded-xl border border-border p-4 text-sm">{result.next_question}</p>}
    <div className="grid gap-3 md:grid-cols-2">{specialists.map(review => <section key={review.role} className="rounded-xl border border-border p-4" aria-label={`${LABELS[review.role]} recommendation`}><h3 className="text-sm text-muted-foreground">{LABELS[review.role]} · {focus[review.role]}</h3>
      <p className="mt-2 font-semibold">{review.status !== "complete" ? "Recommendation unavailable" : review.recommendation ?? (result.analysis ? "Run a new analysis for a clear recommendation." : "What you should know")}</p>
      <p className="mt-2 text-sm">{review.summary}</p>
      {!!review.findings.length && <details className="mt-3 text-xs"><summary className="cursor-pointer font-medium">Evidence selected by this advisor</summary><ul className="mt-2 space-y-2">{review.findings.map(f => <li key={f.id}>{f.text}</li>)}</ul></details>}
      {review.revised && <p className="mt-3 text-xs text-muted-foreground">Updated after comparing the results</p>}
    </section>)}</div>
    <p className="text-xs text-muted-foreground">Projections use the supplied income and expenses. No payment was made.</p>
    {result.chart && <details open className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Compare balance timelines</summary><div className="mt-4"><CouncilGraph chart={result.chart} /></div></details>}
    {result.analysis && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold">Calculation evidence, safe dates, Passport and Trust Shield</summary><NemotronResult response={result.analysis} calculationOnly /></details>}
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Advisor discussion and supporting evidence</summary><div className="mt-4 space-y-5">{result.reviews.map((review, i) => <section key={i}><h4 className="text-sm font-semibold">{LABELS[review.role]} · {review.stage.replaceAll("_", " ")} · {review.status}</h4><p className="mt-1 text-sm">{review.recommendation ?? review.position.replaceAll("_", " ")}</p><ul className="mt-2 space-y-2 text-sm">{review.findings.map(f => <li key={f.id}><p>{f.text}</p><span className="break-all text-xs text-muted-foreground">Calculation references: {f.evidence_ids.join(", ")}</span></li>)}</ul></section>)}</div></details>
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Observed action log and limitations</summary><ol className="mt-3 space-y-1 text-xs">{result.events.map(e => <li key={e.sequence}>{e.sequence}. {LABELS[e.role]} · {e.action.replaceAll("_", " ")} · {e.status}</li>)}</ol><ul className="mt-3 space-y-2 text-xs text-muted-foreground">{result.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
    {onHandoff && <Button variant="outline" onClick={onHandoff}>Share these findings with Council</Button>}
  </div>;
}
