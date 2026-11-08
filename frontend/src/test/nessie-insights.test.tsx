import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NessieInsights } from "@/components/financial/NessieInsights";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const fixture={source:"nessie_sandbox",currency:"USD",as_of_date:"2026-11-08",fetched_at:"2026-11-08T13:00:00Z",period_start:"2026-11-01",accounts:[{selected:true,type:"Checking",balance:"1000.00",label:"Main checking"}],income:"500.00",spending:"40.00",transfer_volume:"10.00",transaction_count:2,categories:[{label:"Groceries",amount:"40.00"}],merchants:[{label:"Test store",amount:"40.00"}],activity:[{date:"2026-11-07",amount:"-40.00",merchant:"Test store",category:"Groceries",source:"purchase"}],bills:[],loans:[],loan_status:"unavailable",notes:["Future income is unknown."]};
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});client.setQueryData(["demo-session"],{enabled:true});render(<QueryClientProvider client={client}><NessieInsights/></QueryClientProvider>);return client;}
it("shows source-backed totals, spending records and an honest optional-loan failure",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json(fixture)));const c=mount();
 expect(await screen.findByRole("heading",{name:"Your Nessie banking picture"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Groceries"}));expect(screen.getByRole("heading",{name:"Spending records: Groceries"})).toBeInTheDocument();
 expect(screen.getByText(/2026-11-07 · Test store · purchase/)).toBeInTheDocument();
 fireEvent.click(screen.getByText("Loan records and coverage"));expect(screen.getByText(/Loan data: unavailable/)).toBeInTheDocument();c.clear();
});
it("keeps missing data explicit and provides retry without demo substitution",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:503})));const c=mount();expect(await screen.findByRole("alert")).toHaveTextContent("Additional account insights unavailable");expect(screen.getByRole("button",{name:"Retry insights"})).toBeInTheDocument();expect(screen.queryByText("$1,000.00")).not.toBeInTheDocument();c.clear();
});
it("shows empty spending and rejects invalid confirmed-event inputs",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...fixture,categories:[],merchants:[],activity:[]})));const c=mount();expect(await screen.findByText("No completed spending this month.")).toBeInTheDocument();
 fireEvent.click(screen.getByText("Add a confirmed future income or extra expense"));
 fireEvent.change(screen.getByLabelText("Amount (USD)"),{target:{value:"-5"}});fireEvent.change(screen.getByLabelText("Expected date"),{target:{value:"2026-11-09"}});
 fireEvent.click(screen.getByRole("button",{name:"Confirm and refresh"}));expect(await screen.findByRole("alert")).toHaveTextContent("positive amount");c.clear();
});
