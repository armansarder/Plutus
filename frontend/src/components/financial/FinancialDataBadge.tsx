import { FlaskConical } from "lucide-react";

export function FinancialDataBadge({ persona }: { persona: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-caution/40 bg-caution-soft px-3 py-1 text-xs font-medium text-caution-foreground">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Synthetic demo data · {persona}</span><span className="sm:hidden">Demo data</span>
    </span>
  );
}
