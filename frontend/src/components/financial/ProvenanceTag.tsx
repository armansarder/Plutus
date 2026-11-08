import { cn } from "@/lib/utils";

const labels = { observed: "Observed", scheduled: "Scheduled", assumed: "Assumed", committed: "Committed", hypothetical: "Hypothetical" } as const;

export function ProvenanceTag({ value }: { value?: keyof typeof labels | undefined }) {
  if (!value) return null;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      value === "assumed" && "bg-caution-soft text-caution-foreground",
      value === "scheduled" && "bg-secondary text-muted-foreground",
      value === "observed" && "bg-primary-soft text-accent-foreground",
      value === "hypothetical" && "bg-destructive-soft text-destructive")}>
      {labels[value]}
    </span>
  );
}
