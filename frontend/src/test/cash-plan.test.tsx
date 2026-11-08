import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CashPlanEditor } from "@/components/financial/CashPlanEditor";
import { useCashPlan } from "@/services/cashPlan";
import { proxyFinancialData } from "@/financialProxy.server";
import type { SituationSnapshot } from "@/services/situation";

const snapshot:SituationSnapshot={snapshotId:"test-plan",customer:{displayName:"test-customer",persona:"test"},currency:"USD",source:"nessie_sandbox",startDate:"2026-11-07",startingBalanceCents:80000,cashFlows:[]};
const quote={customer_id:"test-customer",currency:"USD",snapshot_as_of:"2026-11-07",starting_balance:"800.00",month:"2026-11",horizon_end:"2026-11-30",planned_savings:"100.00",reserve:"100.00",essential_buffer:"50.00",protected_amount:"250.00",projected_minimum:"300.00",available_flexible_spending:"50.00",funding_gap:"0.00",schedule_complete:false,assumptions:["Supplied events only"]};
let client:QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function Approved(){const {plan}=useCashPlan(snapshot);return <output>{plan?`Approved ${plan.planned_savings}/${plan.available_flexible_spending}`:"No approved plan"}</output>;}
it("requires explicit preview and approval before updating shared dashboard values",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(quote)));
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><CashPlanEditor snapshot={snapshot}/><Approved/></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Savings target this month (USD)"),{target:{value:"100"}});
  fireEvent.change(screen.getByLabelText("Cash reserve to keep (USD)"),{target:{value:"100"}});
  fireEvent.change(screen.getByLabelText("Additional unlisted essentials (USD)"),{target:{value:"50"}});
  fireEvent.click(screen.getByRole("button",{name:"Preview my plan"}));
  await screen.findByRole("button",{name:"Use this plan for this session"});
  expect(screen.getByText("No approved plan")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Use this plan for this session"}));
  await waitFor(()=>expect(screen.getByText("Approved 100.00/50.00")).toBeInTheDocument());
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)).toEqual({savings_target:"100.00",reserve:"100.00",essential_buffer:"50.00"});
});
it("proxies validated plan requests without exposing the service token",async()=>{
  vi.stubEnv("FINPILOT_API_TOKEN","private-test-token");
  const fetcher=vi.fn(async()=>Response.json(quote));vi.stubGlobal("fetch",fetcher);
  const url="http://localhost/api/cash-plan/preview";
  const response=await proxyFinancialData(new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({savings_target:"100.00",reserve:"100.00",essential_buffer:"50.00"})}));
  expect(response.status).toBe(200);expect(await response.text()).not.toContain("private-test-token");
  const bad=await proxyFinancialData(new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({savings_target:"100.00",reserve:"100.00",essential_buffer:"50.00",customer_id:"forged"})}));
  expect(bad.status).toBe(422);expect(fetcher).toHaveBeenCalledTimes(1);
});
