import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

// Illustrative synthetic example: $250 monthly Fun budget, $100 already spent,
// so $150 remains before a $120 purchase. Not a recommendation.
const options = [
  {
    id: "buy",
    label: "Buy today",
    remaining: "$30 left in Fun this month",
    note: "You can fit this purchase into your plan, but you'll have less money left for other fun activities.",
    d: "M70 160 C 170 160, 200 55, 320 50",
    color: "var(--scenario-now)",
    end: [320, 50],
  },
  {
    id: "wait",
    label: "Wait until next month",
    remaining: "$150 left in Fun this month",
    note: "Waiting protects this month's spending plan. The purchase would need to fit into next month's plan instead.",
    d: "M70 160 C 170 160, 210 160, 320 160",
    color: "var(--scenario-later)",
    end: [320, 160],
  },
  {
    id: "skip",
    label: "Skip the purchase",
    remaining: "$150 left in Fun this month",
    note: "You keep your current spending flexibility and can put unused money toward your goals.",
    d: "M70 160 C 170 160, 200 265, 320 270",
    color: "var(--brand)",
    end: [320, 270],
  },
] as const;

export function FinancialFutures() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const shownId = hovered ?? selected;
  const current = options.find((o) => o.id === shownId);
  return (
    <figure className="futures panel w-full max-w-md p-5" aria-label="One decision, three possibilities: an illustrative spending example">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
        Today's decision: $120 purchase
      </p>
      <svg viewBox="0 0 420 320" className="mt-2 w-full" role="img" aria-hidden="true">
        {options.map((o) => (
          <g key={o.id} className="futures-path" data-dim={shownId && shownId !== o.id ? "true" : undefined}>
            <path d={o.d} fill="none" stroke={o.color} strokeWidth={4} strokeLinecap="round" />
            <circle cx={o.end[0]} cy={o.end[1]} r={9} fill={o.color} />
          </g>
        ))}
        <circle cx={70} cy={160} r={14} fill="var(--destructive)" className="futures-origin" />
      </svg>
      <div className="mt-3 grid gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onMouseEnter={() => setHovered(o.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(o.id)}
            onBlur={() => setHovered(null)}
            onClick={() => setSelected(selected === o.id ? null : o.id)}
            aria-pressed={selected === o.id}
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary-soft"
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.color }} />
            <span className="font-semibold">{o.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">{o.remaining}</span>
          </button>
        ))}
      </div>
      <figcaption className="mt-3 min-h-24 text-sm text-muted-foreground" aria-live="polite">
        {current ? current.note : "Pick an option to see what happens to this month's Fun budget."}{" "}
        <span className="block text-xs">Illustrative example only, not a recommendation.</span>
      </figcaption>
      <Link
        to="/simulator"
        className="mt-2 inline-flex items-center gap-1 rounded text-sm font-semibold text-primary transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try your own decision <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </figure>
  );
}
