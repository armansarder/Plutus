import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DATA_MODE } from "@/services/config";
import { getDemoSession, selectDemo } from "@/services/nessie";
import { Button } from "@/components/ui/button";
export function DemoCustomers({children}: {children:ReactNode}) {
 const query = useQuery({queryKey:["demo-session"],queryFn:({signal})=>getDemoSession(signal),enabled:DATA_MODE==="remote",retry:false,refetchOnWindowFocus:true});
 const client = useQueryClient(), [busy,setBusy]=useState(false), [error,setError]=useState("");
 const original = useRef<string | undefined>(undefined);
 const identity = query.data ? `${query.data.active ?? ""}:${query.data.generation ?? ""}` : undefined;
 const changed = original.current !== undefined && identity !== undefined && original.current !== identity;
 useEffect(()=>{
  if (identity === undefined) return;
  if (original.current === undefined) original.current = identity;
  else if (original.current !== identity) {void client.cancelQueries();client.clear();window.location.reload();}
 },[identity,client]);
 async function change(profile: string | null) {
  setBusy(true); setError("");
  await client.cancelQueries(); client.clear();
  try {await selectDemo(profile); window.location.replace(window.location.pathname);} catch(e) {setError((e as Error).message); setBusy(false);}
 }
 if (DATA_MODE!=="remote") return <>{children}</>;
 if (query.isPending || query.isFetching || changed) return <p role="status" className="p-8">Checking customer session…</p>;
 if (query.isError) return <div className="p-8" role="alert">Customer session unavailable. <Button onClick={()=>void query.refetch()}>Retry</Button></div>;
 if (!query.data.enabled) return <>{children}</>;
 return <>
  <section aria-label="Sandbox customer" className="border-b bg-blue-50 px-4 py-3 text-sm">
   <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
    <strong>Sandbox customer</strong>
    <select aria-label="Select sandbox customer" className="max-w-full rounded border bg-white p-2" value={query.data.active ?? ""} disabled={busy} onChange={e=>void change(e.target.value || null)}>
     <option value="">Choose a customer</option>{query.data.profiles.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
    {query.data.active && <Button disabled={busy} variant="outline" onClick={()=>void change(null)}>End demo session</Button>}
    <span>Temporary demo access · not a bank login</span>
   </div>
   {error && <p role="alert">{error}</p>}
  </section>
  {busy ? <p role="status" className="p-8">Switching customer and clearing previous results…</p> : query.data.active ? children : <div className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Choose a sandbox customer</h1><p className="mt-3">Each profile uses its own account, bills, spending history and Council conversations. All data is simulated. Select a profile above to begin.</p></div>}
 </>;
}
