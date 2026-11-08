import { afterEach, expect, it, vi } from "vitest";
import { proxyDemo, profileHeaders } from "@/demoProxy.server";
import { proxyFinancialData } from "@/financialProxy.server";
import { proxyCouncil } from "@/councilProxy.server";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const token="x".repeat(43);
function config(){vi.stubEnv("PLUTUS_DEMO_CUSTOMERS","1");vi.stubEnv("FINPILOT_API_TOKEN","service-"+"s".repeat(40));}
it("sets an HttpOnly customer cookie, clears council identity, and never exposes session credential in JSON",async()=>{
 config();vi.stubGlobal("fetch",vi.fn(async()=>Response.json({selected:"alice"},{headers:{"x-plutus-profile-session":token}})));
 const r=await proxyDemo(new Request("http://localhost/api/demo/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile:"alice"})}));
 expect(r.status).toBe(200);expect(r.headers.get("set-cookie")).toContain("HttpOnly");expect(r.headers.get("set-cookie")).toContain("plutus_council_session=;");expect(await r.text()).not.toContain(token);
});
it("forwards cookie identity rather than forged browser headers",async()=>{
 config();const spy=vi.fn(async(_url: URL, _init: RequestInit)=>Response.json({error:"no"},{status:401}));vi.stubGlobal("fetch",spy);
 const req=(path:string)=>new Request("http://localhost"+path,{headers:{Cookie:"plutus_demo_session="+token,"X-Plutus-Profile-Session":"forged"}});
 await proxyFinancialData(req("/api/financial-data"));
 expect((spy.mock.calls[0]![1].headers as Record<string,string>)["X-Plutus-Profile-Session"]).toBe(token);
 await proxyCouncil(req("/api/v2/council/status"));
 expect((spy.mock.calls[1]![1].headers as Record<string,string>)["X-Plutus-Profile-Session"]).toBe(token);
});
it("rejects cross-origin changes, duplicate cookies, arbitrary paths and oversized inputs",async()=>{
 config();vi.stubGlobal("fetch",vi.fn());
 expect((await proxyDemo(new Request("http://localhost/api/demo/session",{method:"DELETE",headers:{Origin:"https://evil.test"}}))).status).toBe(403);
 expect((await proxyDemo(new Request("http://localhost/api/demo/anything"))).status).toBe(404);
 expect(profileHeaders(new Request("http://localhost",{headers:{Cookie:`plutus_demo_session=${token}; plutus_demo_session=${token}`}}))).toEqual({});
 expect((await proxyDemo(new Request("http://localhost/api/demo/session",{method:"POST",headers:{"Content-Type":"application/json"},body:"x".repeat(17000)}))).status).toBe(413);
});
it("leaves legacy single-customer mode enabled without profile configuration",async()=>{
 vi.stubEnv("PLUTUS_DEMO_CUSTOMERS","0");const r=await proxyDemo(new Request("http://localhost/api/demo/session"));expect((await r.json()).enabled).toBe(false);
});
