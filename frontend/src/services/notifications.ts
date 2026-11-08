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
