import type { FutureLabResult, FutureName, FutureScenario } from "./futureLab";

/** Local integration boundary, not a guessed Council HTTP contract. No external delivery. */
export type FutureLabCouncilRequest = {
  schemaVersion: "future-lab-draft-1";
  snapshotId: string;
  selectedFuture: FutureName;
  input: FutureLabResult["input"];
  evidence: FutureScenario;
};
export interface FutureLabCouncilAdapter {
  available: boolean;
  unavailableReason: string | null;
  send(request: FutureLabCouncilRequest, signal?: AbortSignal): Promise<{ status: "unavailable"; sent: false }>;
}
export const futureLabCouncil: FutureLabCouncilAdapter = {
  available: false,
  unavailableReason: "The Council handoff contract has not been provided. Nothing has been sent. Your selected future is ready to connect when that integration is available.",
  async send() { return { status: "unavailable", sent: false }; },
};
