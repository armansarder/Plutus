import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Wallet, Layers3, Scale, ChartNoAxesCombined, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinancialFutures } from "@/components/home/FinancialFutures";
import { DATA_MODE } from "@/services/config";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Plutus — Your money, made simple" },
    { name: "description", content: "Understand where you stand, follow your monthly plan and explore everyday money decisions with Plutus." },
    { property: "og:title", content: "Plutus — Your money, made simple" },
    { property: "og:description", content: "Your bank shows you your balance. Plutus shows you your possibilities." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Home,
});
const sections = [
  { to: "/dashboard", name: "Current situation", description: "A little clarity on right now.", icon: Wallet },
  { to: "/monthly-plan", name: "Monthly plan", description: "Make room for what matters.", icon: Layers3 },
  { to: "/simulator", name: "Try a decision", description: "Buy now, wait, or skip it?", icon: Scale },
  { to: "/cash-flow", name: "30-day cash flow", description: "See what's coming next.", icon: ChartNoAxesCombined },
  { to: "/suggestions", name: "Plutus suggestions", description: "A few possibilities to consider.", icon: Sparkles },
] as const;
function Home() {
  return <div>
    <section className="hero-enter mx-auto max-w-2xl py-10 text-center sm:py-14">
      <p className="mb-5 text-sm font-semibold text-primary">Your possibilities, not just your balance.</p><h1 className="font-display text-6xl font-semibold leading-[1.08] text-brand sm:text-7xl">Plutus<span className="text-destructive">.</span></h1><h2 className="mt-4 font-display text-3xl font-semibold text-brand sm:text-4xl">Your money, made simple.</h2><p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-foreground">See where you stand, explore your financial choices, and make decisions that protect what matters most.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button size="lg" asChild><Link to="/simulator">Try a decision <ArrowRight className="h-4 w-4" /></Link></Button><Button size="lg" variant="outline" asChild><Link to="/dashboard">See my current situation</Link></Button></div><p className="mt-6 text-xs text-muted-foreground">No real money moves · You control your decisions</p>
    </section>
    {DATA_MODE === "synthetic_demo" && <section className="mt-12 grid items-center gap-8 rounded-2xl bg-primary-soft p-6 sm:p-10 lg:grid-cols-[1fr_auto]"><div className="max-w-md"><p className="text-sm font-semibold text-primary">One choice, many paths</p><h2 className="mt-2 font-display text-3xl font-semibold text-brand">One decision. Three possibilities<span className="text-destructive">.</span></h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">See how a purchase could change your monthly spending plan. Illustrative examples only.</p></div><FinancialFutures /></section>}
    <section className="pt-10 sm:pt-12"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><h2 className="font-display text-3xl font-semibold">Where would you like to start?<span className="text-destructive">.</span></h2><p className="text-sm text-muted-foreground">One step at a time.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{sections.map(({ to, name, description, icon: Icon }, i) => <Link to={to} key={to} className="panel group min-h-44 p-5 transition-[box-shadow,border-color] duration-200 hover:shadow-lg hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-center justify-between text-primary"><Icon className="h-6 w-6" /><ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-0.5" /></div><p className="mt-6 text-xs text-muted-foreground">0{i + 1}</p><h3 className="mt-1 text-base font-semibold">{name}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></Link>)}</div></section>
    <p className="mt-12 border-t border-border pt-6 text-center font-display text-xl text-brand">Your bank shows you your balance. Plutus shows you your possibilities.</p>
    <p className="mt-3 text-center text-xs text-muted-foreground">A HackUTD prototype. Not a bank, not financial advice.</p>
  </div>;
}
