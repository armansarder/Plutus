import { Link } from "@tanstack/react-router";
import { useDecision } from "@/components/app/DecisionContext";
/** Adapted from Raiyan's Future Lab (97a08da); all financial values now come from Python. */
import { useEffect, useRef, useState } from "react";
import { CashFlowChart } from "@/components/financial/CashFlowChart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { compareMultiverse } from "@/services/multiverse";
import { centsValue, forecastStart, moneyString } from "@/services/engine";
import { parseDollarsToCents, formatMoney } from "@/lib/formatMoney";
import { addDays } from "@/lib/dateOnly";
import type { SituationSnapshot } from "@/services/situation";
import type { Multiverse as Result } from "@/types/multiverse";
const names:Record<string,string>={buy_now:"Buy now",buy_later:"Buy later",skip:"Skip purchase",unexpected_expense:"Unexpected expense",delayed_income:"Income delayed three days"};
const colors=["var(--scenario-now)","var(--scenario-later)","var(--brand)","var(--color-destructive)","var(--color-caution)"];
export function Multiverse({snapshot}:{snapshot:SituationSnapshot}){
 const {setCouncilDraft}=useDecision();
 const start=forecastStart(snapshot),end=addDays(start,29);
 const [form,setForm]=useState({amount:"400",reserve:"200",stress:"200",date:start,later:addDays(start,7)});
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(""),[pending,setPending]=useState(false),[selected,setSelected]=useState("buy_now"),[day,setDay]=useState(0);
 const controller=useRef<AbortController|null>(null),generation=useRef(0);
 useEffect(()=>()=>controller.current?.abort(),[]);
 function edit(key:keyof typeof form,value:string){generation.current++;controller.current?.abort();setPending(false);setResult(null);setError("");setForm(old=>({...old,[key]:value}));}
 async function run(){
  const amount=parseDollarsToCents(form.amount),reserve=parseDollarsToCents(form.reserve),stress=parseDollarsToCents(form.stress);
  if(amount===null||amount<=0||amount>10_000_000||reserve===null||reserve>10_000_000||stress===null||stress>10_000_000||form.date<start||form.later<form.date||form.later>end){setError("Check amounts and dates within the 30-day window.");return;}
  controller.current?.abort();const c=new AbortController();controller.current=c;const current=++generation.current;setPending(true);setResult(null);setError("");
  try{const data=await compareMultiverse({purchase_amount:moneyString(amount),reserve:moneyString(reserve),stress_expense:moneyString(stress),purchase_date:form.date,later_date:form.later,horizon_days:30},c.signal);
   if(data.scenarios.some(s=>s.forecast.customer_id!==snapshot.customer.displayName||s.forecast.currency!==snapshot.currency||centsValue(s.forecast.starting_balance)!==snapshot.startingBalanceCents))throw new Error("Snapshot changed");
   if(current===generation.current&&!c.signal.aborted){setResult(data);setDay(0);}
  }catch{if(current===generation.current&&!c.signal.aborted)setError("Comparison unavailable. No sample or stale results were substituted. Try again.");}
  finally{if(current===generation.current)setPending(false);}
 }
 const current=result?.scenarios.find(s=>s.name===selected),point=current?.forecast.daily_balances[day];
 return <section className="mt-10 border-t border-border pt-7" aria-label="Financial Multiverse">
  <h2 className="font-display text-2xl">Financial Multiverse</h2><p className="my-3 text-sm text-muted-foreground">Explore alternatives and explicit setbacks over one shared 30-day window. Starting balance {formatMoney(snapshot.startingBalanceCents)}. Source obligations remain unchanged.</p>
  <form className="panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e=>{e.preventDefault();void run();}}>
   {([['amount','Multiverse purchase amount'],['reserve','Minimum reserve'],['stress','Hypothetical setback amount'],['date','Multiverse purchase date'],['later','Multiverse comparison date']] as const).map(([key,label])=><div key={key}><Label htmlFor={'mv-'+key}>{label}</Label><Input id={'mv-'+key} type={key==='date'||key==='later'?'date':'text'} inputMode="decimal" value={form[key]} min={start} max={end} onChange={e=>edit(key,e.target.value)}/></div>)}
   <Button type="submit" disabled={pending}>{pending?'Calculating futures…':'Explore futures'}</Button>
  </form>
  {error&&<p role="alert" className="mt-3 text-destructive">{error}</p>}{pending&&<p role="status">Calculating all futures from one snapshot…</p>}
  {result&&<div className="mt-6" aria-live="polite"><p className="text-xs text-muted-foreground">{result.source.label} · Snapshot {result.source.snapshot_date} · Observed {result.source.observed_at}. Schedule completeness unverified.</p>
   <div className="my-4 flex flex-wrap gap-2">{result.scenarios.map(s=><Button key={s.name} variant={s.name===selected?'default':'outline'} aria-pressed={s.name===selected} onClick={()=>setSelected(s.name)}>{names[s.name]}{!s.applicable?' (not applicable)':''}</Button>)}</div>
   <CashFlowChart bufferCents={centsValue(result.reserve)} selectedId={selected} events={[]} series={result.scenarios.filter(s=>s.applicable).map((s,i)=>({shortName:names[s.name]!,color:colors[i]!,result:{id:s.name,lowestBalanceDate:s.forecast.minimum_balance_date,lowestBalanceCents:centsValue(s.forecast.minimum_balance),dailyBalances:s.forecast.daily_balances.map(p=>({date:p.date,endOfDayBalanceCents:centsValue(p.ending_balance)}))}}))}/>
   <Label htmlFor="mv-day">Inspect timeline day</Label><Input id="mv-day" type="range" min={0} max={29} value={day} onChange={e=>setDay(Number(e.target.value))}/>
   {current&&point&&<p className="my-3">{point.date} · Closing {formatMoney(centsValue(point.ending_balance))} · Difference from skip {formatMoney(centsValue(current.differences[day]!.balance_difference))}. Minimum event balance {formatMoney(centsValue(current.forecast.minimum_balance))}. {current.first_reserve_breach?`First reserve breach: ${current.first_reserve_breach}`:'Reserve preserved under this scenario.'} {!current.applicable&&'No eligible future income; delay test is not applicable.'}</p>}
   <details><summary>Accessible timeline and events</summary><div className="overflow-x-auto"><table className="w-full text-sm"><caption>{names[selected]} daily closing balances</caption><thead><tr><th>Date</th><th>Balance</th><th>Difference from skip</th></tr></thead><tbody>{current?.forecast.daily_balances.map((p,i)=><tr key={p.date}><td>{p.date}</td><td>{formatMoney(centsValue(p.ending_balance))}</td><td>{formatMoney(centsValue(current.differences[i]!.balance_difference))}</td></tr>)}</tbody></table></div>{current?.forecast.transaction_timeline.map(e=><p key={e.id} className="text-sm">{e.date}: {e.description} · Event balance {formatMoney(centsValue(e.balance))}</p>)}</details>
   <details className="mt-4"><summary>Assumptions and limits</summary>{result.assumptions.map(a=><p key={a} className="mt-2 text-sm text-muted-foreground">{a}</p>)}</details>
   {["buy_now","buy_later"].includes(selected)&&<Button asChild className="mt-4"><Link to="/talk" onClick={()=>setCouncilDraft({amount:result.input.purchase_amount,date:selected==="buy_later"?result.input.later_date:result.input.purchase_date,reserve:result.input.reserve})}>Review selected purchase with Council</Link></Button>}
   <p className="mt-4 text-sm text-muted-foreground">Council reviews remain separate. Open Talk to Plutus and confirm the same purchase and reserve; its analysis takes a new snapshot. Custom Multiverse setbacks are not passed to Council.</p>
  </div>}
 </section>;
}
