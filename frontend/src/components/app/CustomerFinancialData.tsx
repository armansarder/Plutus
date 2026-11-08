import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { snapshotQueryOptions } from "@/services/financial";
import type { SituationSnapshot } from "@/services/situation";
import { Button } from "@/components/ui/button";

/** Shared customer state, including loading/failure. No demo placeholder or fallback. */
export const useCustomerFinancialData = () => useQuery(snapshotQueryOptions);

export function CustomerFinancialData({ children }: { children: (snapshot: SituationSnapshot) => ReactNode }) {
  const query = useCustomerFinancialData();
  if (query.isPending) return <p role="status">Loading your financial records…</p>;
  // Hide cached records on error too, so a failed refresh never looks like success.
  if (query.isError) return <div role="alert"><h1 className="font-display text-2xl">Financial records unavailable</h1><p className="my-4">We couldn't load your backend snapshot. No demo data has been substituted.</p><Button onClick={() => void query.refetch()}>Try again</Button></div>;
  return <>{children(query.data)}</>;
}
