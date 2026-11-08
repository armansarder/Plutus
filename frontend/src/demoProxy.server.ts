/** Server-only sandbox selector. Opaque session credential never enters JS responses. */
import { z } from "zod";
import { demoSessionSchema, insightsSchema } from "./types/nessie";
const COOKIE = "plutus_demo_session";
export function profileHeaders(request: Request): Record<string,string> {
 const values = request.headers.get("cookie")?.split(";").map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+"=")) ?? [];
 const token = values.length === 1 ? values[0]!.slice(COOKIE.length+1) : "";
 return /^[A-Za-z0-9_-]{43}$/.test(token) ? {"X-Plutus-Profile-Session": token} : {};
}
export async function proxyDemo(request: Request): Promise<Response> {
 const url = new URL(request.url), headers = new Headers({"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
 const fail = (status: number) => Response.json({error:"Sandbox request failed. Check the profile configuration or select a customer again."},{status,headers});
 const session = url.pathname === "/api/demo/session", insights = url.pathname === "/api/nessie/insights", schedule = url.pathname === "/api/demo/schedule";
 if ((!session && !insights && !schedule) || url.search) return fail(404);
 if (request.headers.get("sec-fetch-site")==="cross-site" || (request.headers.get("origin") && request.headers.get("origin") !== url.origin)) return fail(403);
 if (!(session ? ["GET","POST","DELETE"] : insights ? ["GET"] : ["PUT"]).includes(request.method)) return fail(405);
 // Disabled by default so the original single-customer experience stays intact.
 if (!insights && process.env["PLUTUS_DEMO_CUSTOMERS"] !== "1") return session && request.method === "GET" ? Response.json({enabled:false,profiles:[],active:null,notice:"Single configured customer"},{headers}) : fail(404);
 const token = process.env["FINPILOT_API_TOKEN"]; if (!token) return fail(503);
 let body: string | undefined;
 if (["POST","PUT"].includes(request.method)) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") return fail(415);
  try { const reader = request.body?.getReader(); if (!reader) return fail(422);
   const bytes: number[] = []; const deadline = Date.now()+10000;
   while (true) { const remaining = deadline-Date.now(); if (remaining<=0) throw Error();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const part = await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),remaining);})]).finally(()=>clearTimeout(timer));
    if (part.done) break; if (bytes.length+part.value.length>16384) {void reader.cancel(); return fail(413);} bytes.push(...part.value);
   } body = new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(bytes)); JSON.parse(body);
  } catch {return fail(422);}
 }
 try {
  const base = new URL(process.env["FINPILOT_BACKEND_URL"] || "http://127.0.0.1:8000");
  if (base.pathname!=="/" || base.search || base.hash || base.username || base.password || !["http:","https:"].includes(base.protocol) || (base.protocol==="http:" && !["localhost","127.0.0.1","[::1]"].includes(base.hostname))) return fail(503);
  const res = await fetch(new URL(url.pathname,base),{method:request.method,headers:{Authorization:`Bearer ${token}`,...profileHeaders(request),...(body ? {"Content-Type":"application/json"}: {})},...(body ? {body}: {}),cache:"no-store",redirect:"error",signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)])});
  if (!res.ok) return fail([401,403,404,409,422,429,503].includes(res.status)?res.status:502);
  let result: unknown = await res.json();
  if (session && request.method === "GET") demoSessionSchema.parse(result);
  if (insights) result = insightsSchema.parse(result);
  if (session && request.method === "GET") result = demoSessionSchema.parse(result);
  if (session && request.method === "POST") result = z.object({selected:z.string()}).parse(result);
  if (session && request.method === "DELETE") result = z.object({logged_out:z.literal(true)}).parse(result);
  if (schedule) result = z.object({saved:z.number().int().min(0).max(50),notice:z.string()}).parse(result);
  if (session && request.method!=="GET") {
   const value = request.method === "POST" ? res.headers.get("x-plutus-profile-session") : "";
   if (request.method==="POST" && !/^[A-Za-z0-9_-]{43}$/.test(value ?? "")) return fail(502);
   const secure = url.protocol==="https:" ? "; Secure" : "";
   headers.append("Set-Cookie",`${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? 1800 : 0}${secure}`);
   headers.append("Set-Cookie",`plutus_council_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  }
  return Response.json(result,{headers});
 } catch {return fail(502);}
}
