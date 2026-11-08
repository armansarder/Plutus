import { demoSessionSchema, insightsSchema } from "@/types/nessie";
import { ENDPOINTS } from "./endpoints";
export async function getDemoSession(signal?: AbortSignal) {
 const res = await fetch(ENDPOINTS.demoSession,{...(signal ? {signal}: {}),cache:"no-store"});
 if (!res.ok) throw Error("Customer selector unavailable");
 return demoSessionSchema.parse(await res.json());
}
export async function selectDemo(profile: string | null) {
 const res = await fetch(ENDPOINTS.demoSession,{method:profile ? "POST":"DELETE",headers:{"Content-Type":"application/json"},...(profile ? {body:JSON.stringify({profile})}: {})});
 if (!res.ok) throw Error("Could not switch customers. Try again.");
}
export async function getInsights(signal?: AbortSignal) {
 const res = await fetch(ENDPOINTS.nessieInsights,{...(signal ? {signal}: {}),cache:"no-store"});
 if (!res.ok) throw Error("Nessie insights unavailable");
 return insightsSchema.parse(await res.json());
}
export async function saveSchedule(events: unknown[]) {
 const res = await fetch(ENDPOINTS.demoSchedule,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({events})});
 if (!res.ok) throw Error("Could not save future events. Use dates tomorrow through 90 days ahead.");
}
