import { useState } from "react";
import { AlertTriangle, CircleHelp, ShieldCheck } from "lucide-react";
import type { NemotronResponse } from "@/types/nemotron";
import { explainDecision } from "@/lib/decisionExplanation";
import { Button } from "@/components/ui/button";
import { NemotronDetails } from "./NemotronDetails";

export function NemotronResult({ response }: { response: NemotronResponse }) {
  const copy = explainDecision(response);
  const [focus, setFocus] = useState<"overview" | "why" | "alternatives">("overview");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const Icon = copy.tone === "risk" || copy.tone === "caution" ? AlertTriangle : copy.tone === "limited" ? CircleHelp : ShieldCheck;
  const status = { risk: "Balance could go negative", caution: "Cash cushion at risk", limited: "More information needed", cushion: "Cash cushion holds in these tests" }[copy.tone];
  return <section aria-label="Plutus purchase recommendation" className={`mt-3 rounded-xl border bg-card p-5 sm:p-6 ${copy.tone === "risk" ? "border-destructive/50" : "border-border"}`}>
    <h2 className="font-display text-2xl font-semibold leading-snug sm:text-3xl">{copy.headline}</h2>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${copy.tone === "risk" ? "bg-destructive-soft text-destructive" : copy.tone === "caution" ? "bg-caution-soft text-caution-foreground" : "bg-secondary text-foreground"}`}><Icon className="h-4 w-4" aria-hidden />{status}</span><span className="text-muted-foreground">{response.mode === "nemotron" ? "Nemotron investigation" : "Deterministic fallback"}</span></div>
    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{copy.limitation}</p>
    <div className="mt-5 flex flex-wrap gap-2" aria-label="Explore this completed analysis">
      <Button size="sm" variant={focus === "overview" ? "default" : "outline"} aria-pressed={focus === "overview"} onClick={() => setFocus("overview")}>Overview</Button>
      <Button size="sm" variant={focus === "why" ? "default" : "outline"} aria-pressed={focus === "why"} onClick={() => setFocus("why")}>Why?</Button>
      <Button size="sm" variant={focus === "alternatives" ? "default" : "outline"} aria-pressed={focus === "alternatives"} onClick={() => setFocus("alternatives")}>What should I do instead?</Button>
    </div>
    <div aria-live="polite">
      {focus !== "alternatives" && <section className="mt-5" aria-label="Why Plutus says this"><h3 className="text-sm font-semibold">Why Plutus says this</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">{copy.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></section>}
      {focus !== "why" && <section className="mt-5" aria-label="What you can do instead"><h3 className="text-sm font-semibold">What you can do instead</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">{copy.alternatives.map(alternative => <li key={alternative}>{alternative}</li>)}</ul></section>}
      {focus !== "overview" && <p className="mt-3 text-xs text-muted-foreground">Based on this completed analysis. No new model call or calculation was made.</p>}
    </div>
    <details className="mt-5 border-t border-border pt-4" onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-semibold text-primary">Explore the details</summary>{detailsOpen && <NemotronDetails response={response} />}</details>
  </section>;
}
