import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewCashPlan, useCashPlan, type CashPlanResult } from "@/services/cashPlan";
import type { SituationSnapshot } from "@/services/situation";
import { centsValue, moneyString } from "@/services/engine";
import { parseDollarsToCents, formatMoney } from "@/lib/formatMoney";

export function CashPlanEditor({snapshot}:{snapshot:SituationSnapshot}) {
  const {plan,approve} = useCashPlan(snapshot);
  const [savings,setSavings] = useState(plan?.planned_savings??"");
  const [reserve,setReserve] = useState(plan?.reserve??"");
  const [essentials,setEssentials] = useState(plan?.essential_buffer??"0");
  const [preview,setPreview] = useState<CashPlanResult|null>(null);
  const [pending,setPending] = useState(false),[error,setError] = useState("");
  async function calculate() {
    if(pending)return;
    const values=[savings,reserve,essentials].map(parseDollarsToCents);
    if(values.some(v=>v===null||v<0||v>100_000_000)){setError("Enter a savings target, reserve and essentials buffer as nonnegative dollar amounts; use zero if none.");return;}
    setPending(true);setError("");setPreview(null);
    try {setPreview(await previewCashPlan(snapshot,{savings_target:moneyString(values[0]!),reserve:moneyString(values[1]!),essential_buffer:moneyString(values[2]!)}));}
    catch {setError("The plan could not be calculated. Refresh your account if the source changed, then try again.");}
    finally {setPending(false);}
  }
  const edit=(setter:(v:string)=>void,value:string)=>{setter(value);setPreview(null);};
  return <section className="my-7 rounded-xl border border-border p-5" aria-label="Your cash plan"><h2 className="font-display text-2xl">Set your savings and spending plan</h2><p className="mt-2 text-sm text-muted-foreground">Nessie supplies account activity, not your savings goals. Choose what to protect; we calculate the remaining cash-flow headroom through this month end.</p><div className="my-5 grid gap-4 sm:grid-cols-3"><div><Label htmlFor="plan-savings">Savings target this month (USD)</Label><Input id="plan-savings" inputMode="decimal" value={savings} disabled={pending} onChange={e=>edit(setSavings,e.target.value)}/></div><div><Label htmlFor="plan-reserve">Cash reserve to keep (USD)</Label><Input id="plan-reserve" inputMode="decimal" value={reserve} disabled={pending} onChange={e=>edit(setReserve,e.target.value)}/></div><div><Label htmlFor="plan-essentials">Additional unlisted essentials (USD)</Label><Input id="plan-essentials" inputMode="decimal" value={essentials} disabled={pending} onChange={e=>edit(setEssentials,e.target.value)}/></div></div><Button type="button" disabled={pending} onClick={()=>void calculate()}>{pending?"Calculating...":"Preview my plan"}</Button>{error&&<p role="alert" className="mt-3 text-sm">{error}</p>}{preview&&<div className="mt-5 space-y-3 rounded-lg bg-secondary p-4"><p>Planned savings: <strong>{formatMoney(centsValue(preview.planned_savings))}</strong></p><p>Conditional flexible spending: <strong>{formatMoney(centsValue(preview.available_flexible_spending))}</strong></p>{centsValue(preview.funding_gap)>0&&<p className="text-sm text-caution-foreground">This plan has a projected funding gap of {formatMoney(centsValue(preview.funding_gap))}. Reduce your target or review obligations before treating it as funded.</p>}<Button type="button" variant="outline" onClick={()=>{approve(preview);setPreview(null);}}>Use this plan for this session</Button></div>}{plan&&<p role="status" className="mt-4 text-sm">Your plan is applied to the dashboard for this session. Refreshing the page clears it.</p>}<p className="mt-4 text-xs text-muted-foreground">No money is transferred. Only supplied events and the amounts you enter are included; missing expenses can reduce the available headroom. This is a cash allocation, not a complete category budget.</p></section>;
}
