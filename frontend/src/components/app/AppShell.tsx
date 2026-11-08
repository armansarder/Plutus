import { DATA_MODE } from "@/services/config";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinancialDataBadge } from "@/components/financial/FinancialDataBadge";
import { useCustomerFinancialData } from "./CustomerFinancialData";

function BackendDataBadge() {
  const query = useCustomerFinancialData();
  const label = query.isError ? "Backend data unavailable" : query.isPending ? "Loading backend data…" : query.data.backend?.source === "nessie_sandbox" ? "Nessie sandbox data" : "Backend-connected data";
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

const navCls =
  "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AppShell({ children }: { children: ReactNode }) {
  const backendConnected = DATA_MODE === "remote";
  const [open, setOpen] = useState(false);
  const links = [{ to: "/", label: "Home" }, { to: "/dashboard", label: "Current situation" }, { to: "/monthly-plan", label: "Monthly plan" }, { to: "/simulator", label: "Simulator" }, { to: "/cash-flow", label: "Cash flow" }, { to: "/suggestions", label: "Suggestions" }, { to: "/alerts", label: "Alerts" }, { to: "/talk", label: "Talk to Plutus" }] as const;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-baseline gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="font-display text-3xl font-semibold text-brand">Plutus<span className="text-destructive">.</span></span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
            {links.map((link) => <Link key={link.to} to={link.to} activeOptions={{ exact: true }} className={navCls} activeProps={{ className: "bg-primary-soft text-primary" }}>{link.label}</Link>)}
          </nav>
          <div className="ml-auto">{backendConnected ? <BackendDataBadge /> : <FinancialDataBadge persona="Alex" />}</div>
          <Button variant="ghost" size="icon" className="xl:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button>
          {open && <nav aria-label="Mobile" className="grid w-full gap-1 border-t border-border pt-3 xl:hidden">{links.map((link) => <Link key={link.to} to={link.to} activeOptions={{ exact: true }} onClick={() => setOpen(false)} className={`${navCls} flex min-h-11 items-center justify-between`} activeProps={{ className: "bg-primary-soft text-primary" }}>{link.label}<ArrowUpRight className="h-4 w-4" /></Link>)}</nav>}
        </div>
      </header>
      <main className="page-enter mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          {backendConnected ? "Using the connected customer's records across all pages." : "Synthetic demo data for Alex."} No real money moves. Your plan stays under your control. Projections are illustrative, not financial advice. Plutus is not a bank.
        </p>
      </footer>
    </div>
  );
}
