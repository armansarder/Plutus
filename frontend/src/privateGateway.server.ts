/** Private tools are opt-in and require separate operator credentials at both hops. */
import { timingSafeEqual } from "node:crypto";
import { readBody } from "./financialProxy.server";
export function privateAccess(request:Request):Response|null{
 const headers={"Cache-Control":"no-store","WWW-Authenticate":'Basic realm="Plutus private tools", charset="UTF-8"'};
 if(process.env["PLUTUS_PRIVATE_TOOLS"]!=="1")return new Response("Not found",{status:404,headers});
 const url=new URL(request.url);
 if((url.protocol!=="https:"&&!["localhost","127.0.0.1"].includes(url.hostname))||request.headers.get("sec-fetch-site")==="cross-site"||(request.headers.get("origin")&&request.headers.get("origin")!==url.origin))return new Response("Forbidden",{status:403,headers});
 const password=process.env["PLUTUS_OPERATOR_PASSWORD"]??"",actual=Buffer.from(request.headers.get("authorization")??""),expected=Buffer.from("Basic "+Buffer.from("operator:"+password).toString("base64"));
 if(password.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return new Response("Operator login required",{status:401,headers});
 return null;
}
export async function proxyPrivate(request:Request):Promise<Response>{
 const denied=privateAccess(request);if(denied)return denied;
 const url=new URL(request.url),headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 const fail=(status:number)=>Response.json({error:"Private tool unavailable"},{status,headers});
 if(url.search||!/^\/api\/(operator\/(jobs(?:\/[a-f0-9]{32}\/(retry|cancel))?|process|evaluate)|research\/preview)$/.test(url.pathname))return fail(404);
 const get=url.pathname==="/api/operator/jobs";
 if(request.method!==(get?"GET":"POST"))return fail(405);
 let body:string|undefined;
 if(!get){
  if(request.headers.get("content-type")?.split(";")[0]!=="application/json")return fail(415);
  try{body=await readBody(request);const value=JSON.parse(body);if(!url.pathname.startsWith("/api/research/")&&JSON.stringify(value)!=="{}")return fail(422);}catch{return fail(422);}
 }
 const base=process.env["FINPILOT_BACKEND_URL"],token=process.env["FINPILOT_API_TOKEN"],operator=process.env["PLUTUS_OPERATOR_TOKEN"];
 if(!base||!token||!operator)return fail(503);
 try{
  const origin=new URL(base);
  if(origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash||(!["https:"].includes(origin.protocol)&&!(origin.protocol==="http:"&&["127.0.0.1","localhost"].includes(origin.hostname))))return fail(503);
  const response=await fetch(new URL(url.pathname,origin),{method:request.method,...(body?{body}:{}),headers:{Authorization:`Bearer ${token}`,"X-Plutus-Operator":operator,...(body?{"Content-Type":"application/json"}:{})},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(60000)});
  if(!response.ok)return fail([401,403,404,409,422,429,503].includes(response.status)?response.status:502);
  return Response.json(await response.json(),{headers});
 }catch{return fail(502);}
}
