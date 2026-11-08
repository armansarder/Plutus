import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, parseDollarsToCents } from "@/lib/formatMoney";
import { summarizePlan } from "@/lib/budgetMath";
import { budgetAdapter } from "@/services/budgets";
import type { BudgetPlan } from "@/types/financial";

export function BudgetEditor({ plan, proposedCategoryId, proposedIncreaseCents = 0, children, onApplied }: { plan: BudgetPlan; proposedCategoryId?: string | undefined; proposedIncreaseCents?: number; children?: React.ReactNode; onApplied?: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const draft = { ...plan, categories: plan.categories.map((c) => ({ ...c, allocatedCents: parseDollarsToCents(amounts[c.categoryId] ?? "") ?? c.allocatedCents })) };
  const summary = summarizePlan(draft);
  const original = summarizePlan(plan);
  const invalid = Object.values(amounts).some((v) => parseDollarsToCents(v) === null);
  const begin = () => { setAmounts(Object.fromEntries(plan.categories.map((c) => [c.categoryId, String((c.allocatedCents + (c.categoryId === proposedCategoryId ? proposedIncreaseCents : 0)) / 100)]))); setError(""); setOpen(true); };
  const apply = async () => {
    if (invalid) return setError("Enter valid nonnegative dollar amounts for every allocation.");
    setPending(true);
    try {
      const checked = await budgetAdapter.updatePlanDraft(draft);
      await budgetAdapter.applyPlan(checked);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["budget"] }), queryClient.invalidateQueries({ queryKey: ["baseline"] })]);
      setOpen(false); onApplied?.();
    } catch { setError("Your plan couldn't be applied. Please try again."); } finally { setPending(false); }
  };
  return <><Button variant="outline" className="text-foreground" onClick={begin}>{children ?? "View / adjust my plan"}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogTitle>Review your November plan</DialogTitle><DialogDescription>Changes apply only after your confirmation. Simulation only — no money moved.</DialogDescription>
    <div className="grid gap-3 sm:grid-cols-2">{plan.categories.map((c) => <div key={c.categoryId}><Label htmlFor={`allocation-${c.categoryId}`} className="text-xs">{c.label} (USD)</Label><Input id={`allocation-${c.categoryId}`} inputMode="decimal" value={amounts[c.categoryId] ?? ""} onChange={(e) => setAmounts({ ...amounts, [c.categoryId]: e.target.value })} /></div>)}</div>
    <dl className="space-y-2 border-t border-border pt-3 text-sm"><div className="flex justify-between"><dt>Total allocations</dt><dd className="font-mono">{formatMoney(original.allocations)} → {formatMoney(summary.allocations)}</dd></div><div className="flex justify-between"><dt>Unallocated</dt><dd className="font-mono">{summary.unallocated === null ? "Unknown" : formatMoney(summary.unallocated)}</dd></div><div className="flex justify-between"><dt>Planned savings</dt><dd className="font-mono">{formatMoney(original.savings)} → {formatMoney(summary.savings)}</dd></div></dl>
    {summary.savings < original.savings && <p className="bg-caution-soft p-3 text-sm text-caution-foreground">Your choice reduces planned savings by {formatMoney(original.savings - summary.savings)}. Goal timing is not estimated.</p>}
    {(summary.deficit ?? 0) > 0 && <p role="alert" className="bg-caution-soft p-3 text-sm text-caution-foreground">Plan needs adjustment: {formatMoney(summary.deficit ?? 0)} funding gap. This will remain flagged if you apply it.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || invalid} onClick={apply}>{pending ? "Applying…" : "Confirm plan changes"}</Button></DialogFooter>
  </DialogContent></Dialog></>;
}