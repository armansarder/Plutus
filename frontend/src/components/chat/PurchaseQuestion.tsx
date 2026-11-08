import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engineAdapter } from "@/services/engine";
import { EngineComparisonChart, EngineSummary } from "@/components/financial/EngineResults";
import type { EngineComparison } from "@/types/engine";
import type { SituationSnapshot } from "@/services/situation";
import type { PurchaseDraft } from "@/services/purchaseIntent";

export function PurchaseQuestion({draft, date, snapshot, onChoose}: {draft: PurchaseDraft; date: string; snapshot: SituationSnapshot; onChoose: (amount: string, label: string) => void}) {
  const [amounts, setAmounts] = useState(draft.options.map(o => o.amount));
  const [result, setResult] = useState<EngineComparison | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => {active.current?.abort();}, []);
  async function compare() {
    if (active.current) return;
    const request = new AbortController(); active.current = request;
    setPending(true); setError(""); setResult(null);
    try {setResult(await engineAdapter.compare(snapshot, [...draft.options.map((o, i) => ({name: `${i + 1}. ${o.label}`, purchase_amount: amounts[i]!, purchase_date: date})), {name: "Keep the cash", purchase_amount: "0.00", purchase_date: date} ], request.signal));}
    catch {if (!request.signal.aborted) setError("Check both prices and the purchase date. Refresh your account if the snapshot changed, then try again.");}
    finally {if (active.current === request) active.current = null; setPending(false);}
  }
  return <section className="my-5 rounded-2xl border border-primary/25 bg-primary-soft p-5" aria-label="Confirm purchase choices"><h3 className="font-semibold">Let's compare your choices</h3><p className="mt-2 text-sm text-muted-foreground">{draft.question} Same account, date and source snapshot; this compares projected cash flow, not product quality.</p>{draft.availableCash && <p className="mt-2 text-xs text-muted-foreground">You mentioned ${draft.availableCash} in available cash. That is context, not a purchase price; calculations use the connected account snapshot shown on Current Situation.</p>}<div className="my-4 grid gap-4 sm:grid-cols-2">{draft.options.map((o, i) => <div key={i}><Label htmlFor={`choice-${i}`}>{o.label} price (USD)</Label><Input id={`choice-${i}`} value={amounts[i]} disabled={pending} onChange={e => {setResult(null); setAmounts(old => old.map((v, n) => n === i ? e.target.value : v));}} /></div>)}</div><Button type="button" disabled={pending} onClick={() => void compare()}>{pending ? "Comparing..." : "Confirm and compare choices"}</Button>{error && <p role="alert" className="mt-3 text-sm">{error}</p>}{result && <div className="mt-6 space-y-5"><EngineComparisonChart comparison={result} selected={result.scenarios[0]!.name} /><div className="grid gap-4 lg:grid-cols-2">{result.scenarios.slice(0, 2).map((s, i) => <article key={s.name} className="rounded-xl bg-card p-4"><h4 className="mb-3 font-semibold">{s.name}</h4><EngineSummary result={s} /><Button type="button" className="mt-4" variant="outline" onClick={() => onChoose(amounts[i]!, draft.options[i]!.label)}>Ask this specialist about {draft.options[i]!.label}</Button></article>)}</div></div>}</section>;
}
