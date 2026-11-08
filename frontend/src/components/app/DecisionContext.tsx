import { createContext, useContext, useState, type ReactNode } from "react";
import type { CompareScenariosRequest } from "@/types/financial";
import type { EngineComparison } from "@/types/engine";
type EngineDecision = { snapshotId: string; comparison: EngineComparison };

const DecisionContext = createContext<{ request: CompareScenariosRequest | null; setRequest: (request: CompareScenariosRequest) => void; engineDecision: EngineDecision | null; setEngineDecision: (decision: EngineDecision) => void }>({ request: null, setRequest: () => {}, engineDecision: null, setEngineDecision: () => {} });

export function DecisionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<CompareScenariosRequest | null>(null);
  const [engineDecision, setEngineDecision] = useState<EngineDecision | null>(null);
  return <DecisionContext.Provider value={{ request, setRequest, engineDecision, setEngineDecision }}>{children}</DecisionContext.Provider>;
}

export const useDecision = () => useContext(DecisionContext);
