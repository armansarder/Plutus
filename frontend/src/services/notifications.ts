import { z } from "zod";
import { requestJson } from "./apiClient";
import { ENDPOINTS } from "./endpoints";
import { alertPreferencesSchema, watchRequestSchema, watchedPurchaseSchema, notificationSettingsSchema, notificationEventSchema, alertCheckSchema, type AlertPreferences } from "@/types/notifications";
const base=ENDPOINTS.notifications;
export const notificationAdapter={
 settings:(signal?:AbortSignal)=>requestJson("",base+"/settings",notificationSettingsSchema,{signal}),
 save:(input:AlertPreferences)=>requestJson("",base+"/settings",z.object({saved:z.literal(true)}),{method:"PUT",body:JSON.stringify(alertPreferencesSchema.parse(input))}),
 watches:(signal?:AbortSignal)=>requestJson("",base+"/watchlist",z.array(watchedPurchaseSchema).max(10),{signal}),
 watch:(input:z.input<typeof watchRequestSchema>)=>requestJson("",base+"/watchlist",watchedPurchaseSchema,{method:"POST",body:JSON.stringify(watchRequestSchema.parse(input))}),
 remove:(id:string)=>{if(!/^[a-f0-9]{32}$/.test(id))throw Error("Invalid saved purchase");return requestJson("",base+"/watchlist/"+id,z.object({removed:z.literal(true)}),{method:"DELETE"});},
 history:(signal?:AbortSignal)=>requestJson("",base+"/history",z.array(notificationEventSchema).max(100),{signal}),
 check:()=>requestJson("",base+"/check",alertCheckSchema,{method:"POST",body:"{}"}),
};

const operatorDemoStateSchema=z.object({
 asOf:z.string(),balance:z.string(),currency:z.string(),version:z.number(),scheduledCount:z.number(),
 budget:z.object({category:z.string(),allocatedCents:z.number(),spentCents:z.number(),thresholdPercent:z.number(),percent:z.number(),above:z.boolean()}),
});
const operatorDemoWatchSchema=z.object({id:z.string(),label:z.string(),amount_cents:z.number(),reserve_cents:z.number(),purchase_date:z.string(),horizon_days:z.number(),ready:z.boolean(),notified:z.boolean(),minimum_balance:z.string(),reserve:z.string(),verdict:z.string()});
const operatorDemoEventSchema=z.object({id:z.number(),kind:z.string(),text:z.string(),status:z.string(),created_at:z.string()});
export type OperatorDemoState=z.infer<typeof operatorDemoStateSchema>;
export type OperatorDemoWatch=z.infer<typeof operatorDemoWatchSchema>;
export type OperatorDemoEvent=z.infer<typeof operatorDemoEventSchema>;

function operatorHeaders(token:string){return {"Content-Type":"application/json","X-Operator-Token":token};}
async function operatorRequest<T>(path:string,token:string,schema:z.ZodType<T>,init:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...init,headers:{...operatorHeaders(token),...(init.headers??{})},cache:"no-store"});
 if(!response.ok)throw new Error(`Operator request failed with HTTP ${response.status}`);
 return schema.parse(await response.json());
}
export const operatorDemoAdapter={
 state:(token:string)=>operatorRequest("/api/notifications/operator/state",token,operatorDemoStateSchema),
 watchlist:(token:string)=>operatorRequest("/api/notifications/operator/watchlist",token,z.array(operatorDemoWatchSchema)),
 history:(token:string)=>operatorRequest("/api/notifications/operator/history",token,z.array(operatorDemoEventSchema)),
 spend:(token:string,amount_cents:number)=>operatorRequest("/api/notifications/operator/spend",token,z.object({action:z.literal("spend"),newSpentCents:z.number(),events:z.array(z.unknown())}),{method:"POST",body:JSON.stringify({amount_cents})}),
 advancePayday:(token:string)=>operatorRequest("/api/notifications/operator/advance-payday",token,z.object({action:z.literal("advance_payday"),advance:z.object({asOf:z.string(),balance:z.string()}),events:z.array(z.unknown())}),{method:"POST",body:"{}"}),
 reset:(token:string)=>operatorRequest("/api/notifications/operator/reset",token,z.object({reset:z.literal(true)}),{method:"POST",body:"{}"}),
};
