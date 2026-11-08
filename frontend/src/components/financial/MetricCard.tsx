import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MetricCard({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: LucideIcon; label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "negative" | "caution";
}) {
  return (
    <div className="panel p-6 sm:p-7">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </div>
      <div className={cn("mt-4 text-4xl font-semibold tabular text-foreground",
        tone === "negative" && "text-destructive", tone === "caution" && "text-caution-foreground")}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
