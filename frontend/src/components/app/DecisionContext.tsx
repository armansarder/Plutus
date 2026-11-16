import { createContext, useContext, useState, type ReactNode } from "react";
import type { CompareScenariosRequest } from "@/types/financial";
import type { EngineComparison } from "@/types/engine";
export type CouncilDraft = { amount: string; date: string; reserve: string };

type EngineDecision = { snapshotId: string; comparison: EngineComparison };

const DecisionContext = createContext<{ councilDraft: CouncilDraft | null; setCouncilDraft: (draft: CouncilDraft | null) => void; request: CompareScenariosRequest | null; setRequest: (request: CompareScenariosRequest) => void; engineDecision: EngineDecision | null; setEngineDecision: (decision: EngineDecision) => void }>({ councilDraft: null, setCouncilDraft: () => {}, request: null, setRequest: () => {}, engineDecision: null, setEngineDecision: () => {} });

export function DecisionProvider({ children }: { children: ReactNode }) {
  const [councilDraft, setCouncilDraft] = useState<CouncilDraft | null>(null);
  const [request, setRequest] = useState<CompareScenariosRequest | null>(null);
  const [engineDecision, setEngineDecision] = useState<EngineDecision | null>(null);
  return <DecisionContext.Provider value={{ councilDraft, setCouncilDraft, request, setRequest, engineDecision, setEngineDecision }}>{children}</DecisionContext.Provider>;
}

export const useDecision = () => useContext(DecisionContext);
