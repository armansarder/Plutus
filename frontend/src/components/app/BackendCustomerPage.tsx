import { CustomerFinancialData } from "./CustomerFinancialData";
import { PageHeading } from "./PageHeading";
import { CashPlanEditor } from "@/components/financial/CashPlanEditor";

export type BackendCustomerPageId = "monthly-plan";
export function BackendCustomerPage({page: _page}: {page: BackendCustomerPageId}) {
  return <CustomerFinancialData>{snapshot => <div>
    <PageHeading eyebrow={`Your account · Your financial records`} title="Make room for what matters." description="Choose a savings target and the cash you want to protect." />
    <CashPlanEditor snapshot={snapshot} />
    <p className="panel p-6 text-muted-foreground">Your cash plan uses the connected account schedule and your own allocations. Category budgets and automatic transfers are separate features; no money moves.</p>
  </div>}</CustomerFinancialData>;
}
