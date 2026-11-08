import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,render,screen,fireEvent,waitFor } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { AlertsWorkspace } from "@/components/notifications/AlertsWorkspace";
import { WatchPurchaseButton } from "@/components/notifications/WatchPurchaseButton";
import { proxyNotifications } from "@/notificationsProxy.server";
import { nemotronResponseSchema } from "@/types/nemotron";
import councilFixture from "./fixtures/council.json";
const settings={preferences:{enabled:false,purchase_alerts:true,budget_alerts:false,threshold_percent:85,budget_category:"Groceries",budget_limit_cents:0},mode:"preview",recipient_enrolled:false,recipient_masked:"",poll_seconds:0,poll_failed:false,scope:"One configured account"};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function page(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><AlertsWorkspace/></QueryClientProvider>);return client;}
it("shows honest preview and empty states; submits preferences without customer selectors",async()=>{
 const fetch=vi.fn(async(url: string,init?:RequestInit)=>Response.json(url.endsWith("/settings")?(init?.method==="PUT"?{saved:true}:settings):[]));vi.stubGlobal("fetch",fetch);const c=page();
 expect(await screen.findByText(/Preview mode: alerts are recorded here/)).toBeVisible();expect(await screen.findByText("No purchases saved yet.")).toBeVisible();
 fireEvent.click(screen.getByLabelText("Enable notifications"));fireEvent.click(screen.getByRole("button",{name:"Save notification settings"}));
 await waitFor(()=>expect(fetch.mock.calls.some(([,init])=>init?.method==="PUT")).toBe(true));
 const body=JSON.parse(fetch.mock.calls.find(([,init])=>init?.method==="PUT")![1]!.body as string);
 expect(body.enabled).toBe(true);expect(body).not.toHaveProperty("customer_id");c.clear();
});
it("shows a retryable source failure without a fake alert",async()=>{
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.endsWith("/check")?new Response(null,{status:503}):Response.json(url.endsWith("/settings")?settings:[])));const c=page();
 await screen.findByText(/Preview mode/);fireEvent.click(screen.getByRole("button",{name:"Check for updates"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("No substitute data was used");expect(screen.queryByText("Submitted to Photon — delivery unconfirmed")).not.toBeInTheDocument();c.clear();
});
it("does not claim a purchase was saved when the backend rejects it",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:503})));
 render(<WatchPurchaseButton analysis={nemotronResponseSchema.parse(councilFixture.analysis)}/>);
 fireEvent.click(screen.getByRole("button",{name:"Watch this purchase"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this purchase");expect(screen.queryByRole("button",{name:"Purchase saved"})).not.toBeInTheDocument();
});
it("protects the notification proxy from forged identity, arbitrary routes and cross-site calls",async()=>{
 vi.stubEnv("FINPILOT_API_TOKEN","server-token-"+"x".repeat(40));const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 const request=(path:string,body:unknown)=>new Request("http://localhost"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 expect((await proxyNotifications(request("/api/notifications/watchlist",{label:"Laptop",amount_cents:40000,reserve_cents:20000,horizon_days:30,customer_id:"other"}))).status).toBe(422);
 expect((await proxyNotifications(request("/api/notifications/operator/unknown",{}))).status).toBe(404);
 expect((await proxyNotifications(new Request("http://localhost/api/notifications/history",{headers:{Origin:"https://evil.test"}}))).status).toBe(403);
 expect(fetch).not.toHaveBeenCalled();
});
it("forwards only validated responses and the server's token",async()=>{
 vi.stubEnv("FINPILOT_API_TOKEN","server-token-"+"x".repeat(40));const fetch=vi.fn(async(_url:URL,_init:RequestInit)=>Response.json({...settings,secret:"must-not-leak"}));vi.stubGlobal("fetch",fetch);
 const res=await proxyNotifications(new Request("http://localhost/api/notifications/settings",{headers:{Authorization:"Bearer forged","X-Operator-Token":"forged"}}));
 expect(res.status).toBe(200);expect(await res.text()).not.toContain("must-not-leak");
 expect((fetch.mock.calls[0]![1].headers as Record<string,string>)["Authorization"]).not.toContain("forged");
 expect((fetch.mock.calls[0]![1].headers as Record<string,string>)["X-Operator-Token"]).toBeUndefined();
});

it("accepts persisted watch metadata while omitting internal fields from the browser response",async()=>{
 vi.stubEnv("FINPILOT_API_TOKEN","server-token-"+"x".repeat(40));
 const watch={id:"a".repeat(32),created_at:"2026-11-08T12:00:00Z",label:"Laptop",amount_cents:120000,reserve_cents:60000,purchase_date:"2026-11-09",horizon_days:30,last_ready:false};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json([watch])));
 const response=await proxyNotifications(new Request("http://localhost/api/notifications/watchlist"));
 expect(response.status).toBe(200);
 const data=await response.json();expect(data[0].amount_cents).toBe(120000);expect(data[0]).not.toHaveProperty("last_ready");
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...watch,ready:false,stress_tests_passed:0,stress_tests_total:2,snapshot_id:"internal-reference"})));
 const saved=await proxyNotifications(new Request("http://localhost/api/notifications/watchlist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:"Laptop",amount_cents:120000,reserve_cents:60000,purchase_date:"2026-11-09",horizon_days:30})}));
 expect(saved.status).toBe(200);const savedBody=await saved.json();expect(savedBody.ready).toBe(false);expect(savedBody).not.toHaveProperty("snapshot_id");
});
