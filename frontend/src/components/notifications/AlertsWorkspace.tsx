import { useState } from "react";
import { useQuery,useMutation,useQueryClient } from "@tanstack/react-query";
import { PageHeading } from "@/components/app/PageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney,parseDollarsToCents } from "@/lib/formatMoney";
import { notificationAdapter } from "@/services/notifications";
import type { AlertPreferences } from "@/types/notifications";
const STATUS:Record<string,string>={preview_only:"Preview — no text sent",submitted_not_delivery_confirmed:"Submitted to Photon — delivery unconfirmed",blocked_not_enrolled:"Blocked — recipient not enrolled",blocked_missing_sender_secret:"Blocked — sender not configured",sender_rejected:"Sender rejected the request",delivery_unconfirmed:"Delivery unconfirmed — no automatic retry",claimed_not_submitted:"Submission interrupted — no automatic retry"};
export function AlertsWorkspace(){
 const client=useQueryClient();const [feedback,setFeedback]=useState("");
 const settings=useQuery({queryKey:["alert-settings"],queryFn:({signal})=>notificationAdapter.settings(signal),retry:false});
 const watches=useQuery({queryKey:["alert-watchlist"],queryFn:({signal})=>notificationAdapter.watches(signal),retry:false});
 const history=useQuery({queryKey:["alert-history"],queryFn:({signal})=>notificationAdapter.history(signal),retry:false});
 const check=useMutation({mutationFn:notificationAdapter.check,onSuccess:data=>{setFeedback(data.event_statuses.length?data.event_statuses.map(s=>STATUS[s]??s).join(" · "):"Check complete. No new alert was triggered.");void client.invalidateQueries({queryKey:["alert-history"]});void client.invalidateQueries({queryKey:["alert-watchlist"]});},onError:()=>setFeedback("Could not check the account. No substitute data was used. Try again.")});
 const remove=useMutation({mutationFn:notificationAdapter.remove,onSuccess:()=>{void client.invalidateQueries({queryKey:["alert-watchlist"]});}});
 return <div><PageHeading eyebrow="Alerts" title="Know when something changes." description="Watch a purchase or set a spending threshold. Plutus checks your selected account and keeps a record of each notification."/>
  <div className="mb-6 flex flex-wrap items-center gap-3"><Button disabled={check.isPending} onClick={()=>{setFeedback("");check.mutate();}}>{check.isPending?"Checking…":"Check for updates"}</Button><p className="text-sm text-muted-foreground">No purchases or bank transfers are made.</p></div>
  {feedback&&<p role={check.isError?"alert":"status"} className="mb-5 rounded-xl border p-4 text-sm">{feedback}</p>}
  {check.data&&<div className="mb-5 text-sm text-muted-foreground"><p>Checked {check.data.snapshot_date} · {check.data.source==="nessie_sandbox"?"Nessie sandbox data":check.data.source==="synthetic_demo"?"Synthetic demo data":"Configured account data"}.</p>{check.data.budget&&<p>{check.data.budget.category}: {formatMoney(check.data.budget.spent_cents)} recorded this month against your {formatMoney(check.data.budget.limit_cents)} limit.</p>}{check.data.deferred_notifications>0&&<p>Additional eligible notifications will be checked next time.</p>}{check.data.budget_limitation&&<p>{check.data.budget_limitation}</p>}</div>}
  <section className="panel p-5 sm:p-6"><h2 className="text-xl font-semibold">Text notification settings</h2>
   {settings.isPending?<p role="status">Loading settings…</p>:settings.isError?<p role="alert">Settings unavailable. <Button variant="outline" onClick={()=>void settings.refetch()}>Retry settings</Button></p>:<><p className="my-3 text-sm text-muted-foreground">{settings.data.mode==="preview"?"Preview mode: alerts are recorded here. No texts are sent.":settings.data.recipient_enrolled?`Photon mode: texts go only to the enrolled number ending ${settings.data.recipient_masked}. Sender connectivity is checked when submitting.`:"Photon mode needs an enrolled demo recipient before texts can be enabled."}</p><p className="mb-4 text-sm text-muted-foreground">{settings.data.poll_seconds?`Enabled alerts are checked every ${settings.data.poll_seconds} seconds while this backend is running.`:"Checks run when you press Check for updates. Background checking is off."}</p>{settings.data.poll_failed&&<p role="alert" className="mb-4 text-sm">The last background check failed. Check the account connection and try Check for updates.</p>}<SettingsForm key={JSON.stringify(settings.data.preferences)} initial={settings.data.preferences} onSaved={()=>void settings.refetch()}/></>}
  </section>
  <section className="panel mt-6 p-5 sm:p-6"><h2 className="text-xl font-semibold">Watched purchases</h2><p className="my-3 text-sm text-muted-foreground">Save from a Council result or add one below. Checks use the earliest supported purchase date once your saved date has passed, the saved horizon, and your selected cash buffer. They do not infer missing expenses.</p>
   {watches.isPending?<p>Loading purchases…</p>:watches.isError?<p role="alert">Purchases unavailable. <Button variant="outline" onClick={()=>void watches.refetch()}>Retry purchases</Button></p>:watches.data.length?<ul className="divide-y">{watches.data.map(w=><li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{w.label} · {formatMoney(w.amount_cents)}</p><p className="text-sm text-muted-foreground">Keep {formatMoney(w.reserve_cents)} · {w.horizon_days} days</p></div><Button variant="outline" disabled={remove.isPending} onClick={()=>remove.mutate(w.id)}>Remove {w.label}</Button></li>)}</ul>:<p>No purchases saved yet.</p>}
   {remove.isError&&<p role="alert">Could not remove this purchase. Try again.</p>}
   {check.data?.watchlist.map(w=><p key={w.id} className="my-2 text-sm">{w.label}: {w.limitation??(w.ready?"Passes the tested cash-flow checks.":"Does not pass all selected cash-flow checks.")}</p>)}
   <PurchaseForm onSaved={()=>void client.invalidateQueries({queryKey:["alert-watchlist"]})}/>
  </section>
  <section className="panel mt-6 p-5 sm:p-6"><h2 className="text-xl font-semibold">Notification history</h2><p className="my-3 text-sm text-muted-foreground">One purchase-opportunity alert per saved item; one budget warning per category, month and selected threshold. Submission does not confirm delivery.</p>
   {history.isPending?<p>Loading history…</p>:history.isError?<p role="alert">History unavailable. <Button variant="outline" onClick={()=>void history.refetch()}>Retry history</Button></p>:history.data.length?<ul className="divide-y">{history.data.map(h=><li key={h.id} className="py-3"><p className="text-sm font-semibold">{STATUS[h.status]??"Status unavailable"}</p><p className="mt-1 text-sm">{h.text}</p><p className="mt-1 text-xs text-muted-foreground">{h.created_at}</p></li>)}</ul>:<p>No notifications yet.</p>}
  </section>
 </div>;
}
function SettingsForm({initial,onSaved}:{initial:AlertPreferences;onSaved:()=>void}){
 const [form,setForm]=useState(initial),[limit,setLimit]=useState((initial.budget_limit_cents/100).toFixed(2)),[error,setError]=useState("");
 const save=useMutation({mutationFn:notificationAdapter.save,onSuccess:()=>{setError("");onSaved();},onError:()=>setError("Settings were not saved. Check the budget limit and recipient configuration.")});
 return <form className="space-y-4" onSubmit={e=>{e.preventDefault();const cents=parseDollarsToCents(limit);if(cents===null||cents<0||(form.budget_alerts&&cents===0)){setError("Enter a positive category limit to enable budget warnings.");return;}save.mutate({...form,budget_limit_cents:cents});}}>
  <label className="flex items-center gap-3"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>Enable notifications</label>
  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.purchase_alerts} onChange={e=>setForm({...form,purchase_alerts:e.target.checked})}/>Notify me when a watched purchase passes my cash-flow checks</label>
  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.budget_alerts} onChange={e=>setForm({...form,budget_alerts:e.target.checked})}/>Warn me about a category spending limit</label>
  {form.budget_alerts&&<div className="grid gap-4 sm:grid-cols-3"><label>Category<Input required maxLength={80} value={form.budget_category} onChange={e=>setForm({...form,budget_category:e.target.value})}/><span className="text-xs text-muted-foreground">Use a category name from Cash Flow.</span></label><label>Monthly limit (USD)<Input inputMode="decimal" value={limit} onChange={e=>setLimit(e.target.value)}/></label><label>Warning threshold (%)<Input type="number" min={50} max={100} value={form.threshold_percent} onChange={e=>setForm({...form,threshold_percent:Number(e.target.value)})}/></label></div>}
  <Button disabled={save.isPending}>{save.isPending?"Saving…":"Save notification settings"}</Button>{save.isSuccess&&<p role="status">Settings saved.</p>}{error&&<p role="alert">{error}</p>}
 </form>;
}
function PurchaseForm({onSaved}:{onSaved:()=>void}){
 const [label,setLabel]=useState(""),[amount,setAmount]=useState(""),[reserve,setReserve]=useState("200"),[error,setError]=useState("");
 const save=useMutation({mutationFn:notificationAdapter.watch,onSuccess:()=>{setLabel("");setAmount("");setError("");onSaved();},onError:()=>setError("Purchase was not saved. Check the account connection or remove an older item if the watchlist is full.")});
 return <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Add a purchase to watch</summary><form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();const a=parseDollarsToCents(amount),r=parseDollarsToCents(reserve);if(a===null||a<=0||r===null||r<0){setError("Enter a positive price and a non-negative cash buffer.");return;}save.mutate({label:label.trim(),amount_cents:a,reserve_cents:r,horizon_days:30});}}>
  <label>Purchase name<Input required maxLength={100} value={label} onChange={e=>setLabel(e.target.value)}/></label><label>Price (USD)<Input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Cash to keep (USD)<Input required inputMode="decimal" value={reserve} onChange={e=>setReserve(e.target.value)}/></label><Button disabled={save.isPending}>{save.isPending?"Saving…":"Save purchase"}</Button>{error&&<p role="alert" className="sm:col-span-3">{error}</p>}
 </form></details>;
}
