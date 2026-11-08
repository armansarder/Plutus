import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getInsights, saveSchedule } from "@/services/nessie";
import { decimalCents } from "@/services/backendFinancial";
import { Button } from "@/components/ui/button";
const money = (v:string) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(decimalCents.parse(v)/100);
export function NessieInsights() {
 const canConfirm = useQueryClient().getQueryData<{enabled:boolean}>(["demo-session"])?.enabled === true;
 const query = useQuery({queryKey:["nessie-insights"],queryFn:({signal})=>getInsights(signal),retry:false});
 const [filter,setFilter]=useState<{kind:"category"|"merchant",label:string}|null>(null);
 const [amount,setAmount]=useState(""), [day,setDay]=useState(""), [kind,setKind]=useState("income"), [error,setError]=useState(""), [busy,setBusy]=useState(false);
 if (query.isPending) return <p role="status">Loading Nessie account insights…</p>;
 if (query.isError) return <div role="alert">Additional account insights unavailable. Existing financial pages remain available. <Button onClick={()=>void query.refetch()}>Retry insights</Button></div>;
 const d=query.data;
 async function save(clear=false) {
  setBusy(true);setError("");
  try {
   const [whole,fraction=""] = amount.split(".");
   const normalized = whole+"."+fraction.padEnd(2,"0");
   if (!clear && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || decimalCents.parse(normalized)<=0 || !day)) throw Error("Enter a positive amount and future date.");
   await saveSchedule(clear ? [] : [{id:"confirmed_event",date:day,description:"User-confirmed future event",amount:(kind==="expense" ? "-":"")+normalized,type:kind,source_status:"estimated"}]);
   window.location.reload();
  } catch(e) {setError((e as Error).message);setBusy(false);}
 }
 return <section className="my-6 rounded-xl border p-4 sm:p-6" aria-label="Nessie banking insights">
  <h2 className="text-xl font-semibold">Your Nessie banking picture</h2>
  <p className="mt-1 text-sm text-muted-foreground">Sandbox data · projections use the selected cash account only · updated {d.fetched_at ?? d.as_of_date}</p>
  <div className="my-4 grid gap-3 sm:grid-cols-3">
   {d.accounts.map((a,i)=><div key={i}><p>{a.label} · {a.type}{a.selected ? " · used for projections" : " · excluded from projections"}</p><strong>{money(a.balance)}</strong></div>)}
   <div><p>Income this month</p><strong>{money(d.income)}</strong></div><div><p>Spending this month</p><strong>{money(d.spending)}</strong></div>
  </div>
  <p className="text-sm">{d.transaction_count} records this month. Transfer volume: {money(d.transfer_volume)} (excluded from income and spending).</p>
  <div className="mt-5 grid gap-6 sm:grid-cols-2">
   <div><h3 className="font-semibold">Spending by category</h3>{d.categories.length ? d.categories.map(c=><div key={c.label} className="flex justify-between gap-4 border-b py-2"><button className="text-left underline" onClick={()=>setFilter({kind:"category",label:c.label})}>{c.label}</button><strong>{money(c.amount)}</strong></div>) : <p>No completed spending this month.</p>}</div>
   <div><h3 className="font-semibold">Top merchants / payees</h3>{d.merchants.length ? d.merchants.map(m=><div key={m.label} className="flex justify-between gap-4 border-b py-2"><button className="break-words text-left underline" onClick={()=>setFilter({kind:"merchant",label:m.label})}>{m.label}</button><strong>{money(m.amount)}</strong></div>):<p>No merchant spending this month.</p>}</div>
  </div>
  {filter && <div className="mt-4 rounded border p-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Spending records: {filter.label}</h3><Button variant="outline" onClick={()=>setFilter(null)}>Close records</Button></div>
   <ul>{d.activity.filter(a=>(filter.kind==="category" ? a.category : a.merchant)===filter.label).map((a,i)=><li key={i} className="flex flex-wrap justify-between gap-2 border-b py-2"><span>{a.date} · {a.merchant} · {a.source}</span><strong>{money(a.amount)}</strong></li>)}</ul><p className="mt-2 text-sm">Up to 200 spending records. Full history is available in Cash Flow.</p>
  </div>}
  <h3 className="mt-5 font-semibold">Upcoming events used in projections</h3>
  {d.bills.length ? <ul>{d.bills.map(b=><li key={b.id} className="my-2">{b.date} · {b.description} · {money(b.amount)} <span className="text-sm text-muted-foreground">({b.id.startsWith("user_") ? "User-confirmed estimate" : "Nessie dated bill estimate"})</span></li>)}</ul>:<p>No dated upcoming events. This does not mean you have no future expenses.</p>}
  <details className="mt-4"><summary>Loan records and coverage</summary><p>Loan data: {d.loan_status}. Interest and repayment comparisons are not supported.</p>{d.loans.map((l,i)=><p key={i}>{l.type} · {l.status}</p>)}{d.notes.map(n=><p className="mt-2 text-sm" key={n}>{n}</p>)}</details>
  {canConfirm && <details className="mt-4"><summary>Add a confirmed future income or extra expense</summary>
   <p className="my-3 text-sm">For this temporary customer session only. This replaces your previous manual event; it never changes Nessie. Do not duplicate a bill shown above. All remaining future spending is still unknown. Saving clears displayed decisions; rerun the Council.</p>
   <form onSubmit={e=>{e.preventDefault();void save();}} className="flex flex-wrap items-end gap-3">
    <label>Event<select className="block rounded border p-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="income">Expected income</option><option value="expense">Extra expense</option></select></label>
    <label>Amount (USD)<input className="block w-36 rounded border p-2" inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <label>Expected date<input className="block rounded border p-2" type="date" required value={day} onChange={e=>setDay(e.target.value)}/></label>
    <Button disabled={busy}>Confirm and refresh</Button><Button disabled={busy} type="button" variant="outline" onClick={()=>void save(true)}>Clear manual event</Button>
   </form>{error && <p role="alert">{error}</p>}
  </details>}
 </section>;
}
