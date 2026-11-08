import { RotateCcw, Scale } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BudgetCategory } from "@/types/financial";
import type { ScenarioFormErrors, ScenarioFormValues } from "./validateScenarioForm";

export function PurchaseScenarioForm({ values, errors, onChange, onSubmit, onReset, pending, minDate, maxDate, categories }: {
  values: ScenarioFormValues; errors: ScenarioFormErrors; onChange: (v: ScenarioFormValues) => void;
  onSubmit: () => void; onReset: () => void; pending: boolean; minDate: string; maxDate: string; categories: BudgetCategory[];
}) {
  const set = (k: keyof ScenarioFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...values, [k]: e.target.value });
  const field = (k: keyof ScenarioFormValues, label: string, input: React.ReactNode, help?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${k}`}>{label}</Label>
      {input}
      {errors[k] ? (
        <p id={`e-${k}`} role="alert" className="text-xs text-destructive">{errors[k]}</p>
      ) : help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
  const common = (k: keyof ScenarioFormValues) => ({
    id: `f-${k}`, value: values[k], onChange: set(k), "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `e-${k}` : undefined,
  });

  return (
    <form className="panel space-y-4 p-5" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">What are you thinking of buying?</h2>
        <p className="text-xs text-muted-foreground">Nothing is bought or saved — this only runs a calculation.</p>
      </div>
      {field("label", "What are you buying?", <Input {...common("label")} maxLength={60} autoComplete="off" />)}
      {field("amount", "Purchase amount (USD)", (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input {...common("amount")} inputMode="decimal" className="pl-6 font-mono" autoComplete="off" />
        </div>
      ))}
      {field("categoryId", "Budget category", <Select value={values.categoryId} onValueChange={(categoryId) => onChange({ ...values, categoryId })}><SelectTrigger id="f-categoryId" aria-invalid={!!errors.categoryId}><SelectValue /></SelectTrigger><SelectContent>{categories.filter((c) => c.kind !== "savings").map((c) => <SelectItem key={c.categoryId} value={c.categoryId}>{c.label}</SelectItem>)}</SelectContent></Select>)}
      {field("purchaseDate", "Purchase date", <Input {...common("purchaseDate")} type="date" min={minDate} max={maxDate} />)}
      <details><summary className="cursor-pointer text-sm text-primary">Explore another date / cash cushion</summary><div className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {field("altDate", "Or buy later on", <Input {...common("altDate")} type="date" min={minDate} max={maxDate} />)}
      </div>
      {field("buffer", "Cash buffer you want to keep", (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input {...common("buffer")} inputMode="decimal" className="pl-6 font-mono" autoComplete="off" />
        </div>
      ), "Your own illustrative cushion — not a bank-approved safe-to-spend amount.")}
      </div></details>
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={pending}>
          <Scale className="h-4 w-4" aria-hidden />{pending ? "Comparing…" : "Compare choices"}
        </Button>
        <Button type="button" variant="outline" onClick={onReset}><RotateCcw className="h-4 w-4" aria-hidden />Reset</Button>
      </div>
    </form>
  );
}
