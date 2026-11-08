/** Server-only allowlist. No operator actions, customer selectors or arbitrary URLs. */
import { z } from "zod";
import { readBody } from "./financialProxy.server";
import { alertPreferencesSchema,watchRequestSchema,watchedPurchaseSchema,notificationSettingsSchema,notificationEventSchema,alertCheckSchema } from "./types/notifications";
export function isNotificationPath(path:string){return /^\/api\/notifications\/(settings|watchlist(?:\/[a-f0-9]{32})?|history|check)$/.test(path);}
export async function proxyNotifications(request:Request):Promise<Response>{
 const url=new URL(request.url),headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 const fail=(status:number)=>Response.json({error:"Alert request failed. Check your inputs, account connection or delivery configuration."},{status,headers});
 if(!isNotificationPath(url.pathname)||url.search)return fail(404);
 if(request.headers.get("sec-fetch-site")==="cross-site"||(request.headers.get("origin")&&request.headers.get("origin")!==url.origin))return fail(403);
 const suffix=url.pathname.slice("/api/notifications/".length),remove=suffix.startsWith("watchlist/");
 const methods=remove?["DELETE"]:suffix==="settings"?["GET","PUT"]:suffix==="watchlist"?["GET","POST"]:suffix==="history"?["GET"]:["POST"];
 if(!methods.includes(request.method))return fail(405);
 let body:string|undefined;
 if(["PUT","POST"].includes(request.method)){
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json"||![null,"identity"].includes(request.headers.get("content-encoding")))return fail(415);
  const length=request.headers.get("content-length");if(length&&(!/^\d+$/.test(length)||Number(length)>16384))return fail(413);
  try{body=await readBody(request);(suffix==="settings"?alertPreferencesSchema:suffix==="watchlist"?watchRequestSchema:z.object({}).strict()).parse(JSON.parse(body));}catch{return fail(422);}
 }
 const token=process.env["FINPILOT_API_TOKEN"];if(!token)return fail(503);
 try{
  const base=new URL(process.env["FINPILOT_BACKEND_URL"]||"http://127.0.0.1:8000");
  if(base.pathname!=="/"||base.search||base.hash||base.username||base.password||!["http:","https:"].includes(base.protocol)||(base.protocol==="http:"&&!["localhost","127.0.0.1","[::1]"].includes(base.hostname)))return fail(503);
  const response=await fetch(new URL(url.pathname,base),{method:request.method,...(body===undefined?{}:{body}),headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"})},cache:"no-store",redirect:"error",signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});
  if(!response.ok)return fail([400,401,403,404,409,422,429,503].includes(response.status)?response.status:502);
  const schema=remove?z.object({removed:z.literal(true)}):suffix==="settings"?(request.method==="GET"?notificationSettingsSchema:z.object({saved:z.literal(true)})):suffix==="watchlist"?(request.method==="GET"?z.array(watchedPurchaseSchema).max(10):watchedPurchaseSchema):suffix==="history"?z.array(notificationEventSchema).max(100):alertCheckSchema;
  const parsed=schema.safeParse(await response.json());return parsed.success?Response.json(parsed.data,{headers}):fail(502);
 }catch{return fail(502);}
}
