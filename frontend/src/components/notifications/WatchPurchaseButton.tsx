import { useState } from "react";
import { Button } from "@/components/ui/button";
import { notificationAdapter } from "@/services/notifications";
import { centsValue } from "@/services/engine";
import type { NemotronResponse } from "@/types/nemotron";
export function WatchPurchaseButton({analysis}:{analysis:NemotronResponse}){
 const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState("");
 async function save(){setBusy(true);setError("");try{
  const scenario=analysis.scenarios.find(s=>s.name==="purchase")!;
  await notificationAdapter.watch({label:"Saved purchase",amount_cents:centsValue(analysis.passport.purchase_amount),reserve_cents:centsValue(analysis.passport.reserve),purchase_date:scenario.purchase_date,horizon_days:scenario.forecast.daily_balances.length});
  setSaved(true);
 }catch{setError("Could not save this purchase. Check the account connection and try again.");}finally{setBusy(false);}}
 return <div className="flex flex-wrap items-center gap-3 text-sm"><Button type="button" variant="outline" disabled={busy||saved} onClick={()=>void save()}>{busy?"Saving…":saved?"Purchase saved":"Watch this purchase"}</Button><span className="text-muted-foreground">{saved?"Set your notification preferences on Alerts.":"Recheck this purchase against your selected cash buffer."}</span>{error&&<p role="alert">{error}</p>}</div>;
}
