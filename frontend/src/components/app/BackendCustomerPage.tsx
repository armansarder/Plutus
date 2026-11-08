import { CustomerFinancialData } from "./CustomerFinancialData";
import { PageHeading } from "./PageHeading";
import { BackendSource, BackendTransactions } from "@/components/financial/BackendRecords";

const COPY = {
  "monthly-plan": { title: "Make room for what matters.", message: "We don't have your monthly spending plan yet.", detail: "Category budgets and savings allocations are unavailable. You can review your balance and upcoming transactions in Current Situation." },
  alerts: { title: "A gentle heads-up.", message: "We don't have enough information to assess your plan yet.", detail: "Budget, savings and forecast alerts are unavailable. Review the supplied upcoming transactions below; this is not an all-clear on your finances." },
  suggestions: { title: "A few possibilities for you.", message: "We don't have your monthly spending plan yet.", detail: "Personalized suggestions need your category budgets and savings allocations. You can review the records already available in Current Situation." },
} as const;
export type BackendCustomerPageId = keyof typeof COPY;

export function BackendCustomerPage({ page }: { page: BackendCustomerPageId }) {
  const copy = COPY[page];
  return <CustomerFinancialData>{snapshot => <div>
    <PageHeading eyebrow={`${snapshot.customer.displayName} · Your financial records`} title={copy.title} description={copy.message} />
    <BackendSource snapshot={snapshot} />
    <p className="panel p-6 text-muted-foreground">{copy.detail}</p>
    {page === "alerts" && <BackendTransactions snapshot={snapshot} />}
  </div>}</CustomerFinancialData>;
}
